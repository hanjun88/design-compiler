/**
 * Fail-closed validation of an AestheticConstraintSheet.
 *
 * Two layers, both mandatory:
 *   1. JSON Schema (contracts/aesthetic-constraint-sheet/*.schema.json) — structure and vocabulary.
 *   2. Semantic invariants the schema cannot express: hash integrity, version/source binding,
 *      capability support, provenance completeness, confidence fuse, role coverage, context
 *      applicability, band consistency and the "repair targets never escape the band" rule.
 *
 * The compiler never interprets aesthetic values here; it only checks that the producer's
 * decisions are internally consistent, traceable and bound to the pinned skill.
 */
import Ajv2020 from "ajv/dist/2020";
import semver from "semver";
import type { AestheticConstraintSheet, AestheticConstraint, ConstraintOfKind } from "../contracts/aesthetic-constraint-sheet/aesthetic-constraint-sheet.types";
import { isValidPointer } from "../compiler-intent/pointer-map";
import { SHEET_SCHEMA, CONTRACT_LOCK, SUPPORTED_CAPABILITIES, verifiedContractHash } from "./contract";
import { canonicalSha256Without } from "./hash";
import { SheetRejectedError, type SheetIssue } from "./errors";
import type { SkillBinding } from "./binding";

export const DEFAULT_CONFIDENCE_FUSE = 0.5;

/** The contract identity a compiler build implements. */
export interface ContractIdentity {
  schema_version: string;
  contract_hash: string;
}

export interface ValidateOptions {
  /**
   * The contract identity of the compiler build the sheet is checked against. Defaults to this
   * repository's locked contract; a host that moves between compiler builds (see GrammarGovernor)
   * re-verifies its active grammar against the build it now runs.
   */
  contract?: ContractIdentity;
  /** Pinned skill binding. When present, source/version/registry/ledger/contract are enforced against it. */
  binding?: SkillBinding;
  /** Accept sheets produced from a dirty skill worktree (never in CI). Defaults to binding.policy.allow_dirty_source or false. */
  allowDirty?: boolean;
  /** Trust fuse: a constraint (or the aggregate) below this confidence rejects the whole sheet. */
  confidenceFuse?: number;
  supportedCapabilities?: readonly string[];
}

/** A sheet that passed every check. Frozen; the only input DecisionPack accepts. */
export type ValidatedSheet = Readonly<AestheticConstraintSheet> & { readonly __validated: true };

const VALIDATED = new WeakSet<object>();
export const isValidatedSheet = (x: unknown): x is ValidatedSheet => typeof x === "object" && x !== null && VALIDATED.has(x);

let schemaValidator: ReturnType<Ajv2020["compile"]> | null = null;
function sheetSchemaValidator() {
  if (!schemaValidator) {
    const ajv = new Ajv2020({ strict: true, allErrors: true, discriminator: true });
    schemaValidator = ajv.compile(SHEET_SCHEMA as object);
  }
  return schemaValidator;
}

export const computeConstraintHash = (c: AestheticConstraint): string => canonicalSha256Without(c, ["provenance.content_hash"]);
export const computeSheetHash = (s: AestheticConstraintSheet): string => canonicalSha256Without(s, ["provenance.content_hash"]);

function deepFreeze<T>(v: T): T {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const child of Object.values(v as Record<string, unknown>)) deepFreeze(child);
  }
  return v;
}

const hardBand = (c: ConstraintOfKind<"PARAMETER_BAND">) => c.payload.semantics === "PERIOD_BAND" || c.payload.semantics === "PHYSICAL_RANGE" || c.payload.semantics === "HARD_FLOOR";
const stripValueSuffix = (p: string) => (p.endsWith("/value") ? p.slice(0, -"/value".length) : p);
const isRatioUnit = (u: string) => u === "ratio" || u === "normalized";

/** Returns every issue found; empty array means the sheet is acceptable. Never throws on bad input. */
export function collectSheetIssues(raw: unknown, opts: ValidateOptions = {}): SheetIssue[] {
  const issues: SheetIssue[] = [];
  const push = (i: SheetIssue) => issues.push(i);

  // Contract integrity first: nothing is validated against a drifted schema.
  const lockHash = verifiedContractHash();
  const contract: ContractIdentity = opts.contract ?? { schema_version: CONTRACT_LOCK.schema_version, contract_hash: lockHash };

  const validate = sheetSchemaValidator();
  if (!validate(raw)) {
    for (const e of (validate.errors ?? []).slice(0, 12)) {
      push({ code: "SHEET_SCHEMA_INVALID", message: `${e.instancePath || "/"} ${e.message ?? "invalid"}`.trim(), path: e.instancePath || "/" });
    }
    return issues; // structure is unusable; semantic checks would only add noise
  }
  const sheet = raw as AestheticConstraintSheet;
  const binding = opts.binding;

  // --- contract identity -------------------------------------------------------------------
  if (sheet.contract_hash !== contract.contract_hash) {
    push({ code: "SHEET_CONTRACT_HASH_MISMATCH", message: `sheet.contract_hash ${sheet.contract_hash} != compiler contract ${contract.contract_hash}` });
  }
  const compatible =
    semver.valid(sheet.schema_version) !== null &&
    semver.major(sheet.schema_version) === semver.major(contract.schema_version) &&
    semver.validRange(sheet.compatibility.contract_range) !== null &&
    semver.satisfies(contract.schema_version, sheet.compatibility.contract_range);
  if (!compatible) {
    push({ code: "SHEET_SCHEMA_VERSION_INCOMPATIBLE", message: `sheet schema_version ${sheet.schema_version} (range ${sheet.compatibility.contract_range}) is not compatible with contract ${contract.schema_version}` });
  }

  // --- binding (version / source / ledger) -------------------------------------------------
  const allowDirty = opts.allowDirty ?? binding?.policy.allow_dirty_source ?? false;
  if (sheet.source_ref.dirty && !allowDirty) {
    push({ code: "SHEET_SOURCE_DIRTY", message: "sheet was generated from a dirty skill worktree; its commit does not identify its content" });
  }
  if (binding) {
    if (binding.contract.contract_hash !== contract.contract_hash) {
      push({ code: "BINDING_SOURCE_MISMATCH", message: `binding pins contract ${binding.contract.contract_hash} but the compiler contract is ${contract.contract_hash}` });
    }
    if (!semver.validRange(binding.skill.compatible_range) || !semver.satisfies(sheet.skill_version, binding.skill.compatible_range)) {
      push({ code: "SHEET_SKILL_VERSION_STALE", message: `skill_version ${sheet.skill_version} is outside the bound range ${binding.skill.compatible_range}` });
    }
    if (sheet.source_ref.repository !== binding.source.repository) {
      push({ code: "SHEET_SOURCE_MISMATCH", message: `source repository ${sheet.source_ref.repository} != bound ${binding.source.repository}` });
    }
    if (sheet.source_ref.commit !== binding.source.commit) {
      push({ code: "SHEET_SOURCE_MISMATCH", message: `source commit ${sheet.source_ref.commit} != bound ${binding.source.commit}` });
    }
    if (sheet.source_ref.registry_path !== binding.registry.path || sheet.source_ref.registry_hash !== binding.registry.hash) {
      push({ code: "SHEET_SOURCE_MISMATCH", message: `registry ${sheet.source_ref.registry_path}@${sheet.source_ref.registry_hash} != bound ${binding.registry.path}@${binding.registry.hash}` });
    }
    if (sheet.provenance.ledger_hash !== binding.provenance.ledger_hash) {
      push({ code: "SHEET_PROVENANCE_LEDGER_MISMATCH", message: `provenance ledger ${sheet.provenance.ledger_hash} != bound ${binding.provenance.ledger_hash}` });
    }
  }

  // --- capabilities ------------------------------------------------------------------------
  const supported = new Set(opts.supportedCapabilities ?? SUPPORTED_CAPABILITIES);
  for (const cap of sheet.compatibility.requires_capabilities) {
    if (!supported.has(cap)) push({ code: "SHEET_CAPABILITY_UNSUPPORTED", message: `sheet requires capability ${cap}, which this compiler does not provide` });
  }

  // --- provenance integrity ------------------------------------------------------------------
  if (sheet.provenance.constraint_count !== sheet.constraints.length) {
    push({ code: "SHEET_PROVENANCE_HASH_MISMATCH", message: `provenance.constraint_count ${sheet.provenance.constraint_count} != ${sheet.constraints.length} constraints` });
  }
  const sheetHash = computeSheetHash(sheet);
  if (sheetHash !== sheet.provenance.content_hash) {
    push({ code: "SHEET_PROVENANCE_HASH_MISMATCH", message: `sheet content hash ${sheetHash} != provenance.content_hash ${sheet.provenance.content_hash}` });
  }

  // --- per-constraint checks -----------------------------------------------------------------
  const seen = new Set<string>([sheet.decision_id]);
  const ctx = sheet.design_context;
  const fuse = opts.confidenceFuse ?? binding?.policy.confidence_fuse ?? DEFAULT_CONFIDENCE_FUSE;
  let minConfidence = 1;
  const rolesPresent = new Set<string>();
  const grammarIds = new Set<string>();
  const policyKeys = new Set<string>();
  const singletons = new Set<string>();

  for (const c of sheet.constraints) {
    const at = (suffix = "") => `/constraints/${c.decision_id}${suffix}`;
    if (seen.has(c.decision_id)) push({ code: "SHEET_DUPLICATE_DECISION", message: `duplicate decision_id ${c.decision_id}`, decision_id: c.decision_id });
    seen.add(c.decision_id);
    rolesPresent.add(c.role);
    minConfidence = Math.min(minConfidence, c.confidence);

    if (c.provenance.sources.length === 0 || c.provenance.sources.some((s) => s.ref.trim() === "")) {
      push({ code: "SHEET_PROVENANCE_MISSING", message: `${c.decision_id} has no usable provenance source`, decision_id: c.decision_id, path: at("/provenance") });
    }
    if (computeConstraintHash(c) !== c.provenance.content_hash) {
      push({ code: "SHEET_PROVENANCE_HASH_MISMATCH", message: `${c.decision_id} content hash does not match its provenance.content_hash`, decision_id: c.decision_id, path: at("/provenance/content_hash") });
    }
    if (c.confidence < fuse) {
      push({ code: "SHEET_CONFIDENCE_BELOW_FUSE", message: `${c.decision_id} confidence ${c.confidence} < fuse ${fuse}`, decision_id: c.decision_id });
    }
    const a = c.applies_to;
    if ((a.period && !a.period.includes(ctx.period)) || (a.material && !a.material.includes(ctx.material)) || (a.lighting && !a.lighting.includes(ctx.lighting)) || (a.scene_type && !a.scene_type.includes(ctx.scene_type))) {
      push({ code: "SHEET_CONTEXT_MISMATCH", message: `${c.decision_id} applies_to excludes the sheet context ${ctx.period}/${ctx.material}/${ctx.lighting}/${ctx.scene_type}`, decision_id: c.decision_id });
    }

    switch (c.kind) {
      case "PARAMETER_BAND": {
        const p = c.payload;
        if (p.min > p.max) push({ code: "SHEET_DECISION_INVALID", message: `${c.decision_id} band is inverted (${p.min} > ${p.max})`, decision_id: c.decision_id });
        if (p.target !== undefined && (p.target < p.min || p.target > p.max)) {
          push({ code: "SHEET_DECISION_INVALID", message: `${c.decision_id} target ${p.target} lies outside its own band [${p.min}, ${p.max}]`, decision_id: c.decision_id });
        }
        if ((p.semantics === "REPAIR_TARGET" || p.semantics === "DESIGN_DEFAULT") && p.target === undefined) {
          push({ code: "SHEET_DECISION_INVALID", message: `${c.decision_id} (${p.semantics}) must carry a target`, decision_id: c.decision_id });
        }
        if (isRatioUnit(p.unit) && (p.min < 0 || p.max > 1)) {
          push({ code: "SHEET_DECISION_INVALID", message: `${c.decision_id} ratio band [${p.min}, ${p.max}] leaves the physical domain [0, 1]`, decision_id: c.decision_id });
        }
        if (p.ir_pointer && !isValidPointer(p.ir_pointer)) {
          push({ code: "SHEET_PATCH_PATH_INVALID", message: `${c.decision_id} ir_pointer ${p.ir_pointer} is not a Core IR parameter`, decision_id: c.decision_id });
        }
        break;
      }
      case "GRAMMAR_RULE": {
        const p = c.payload;
        if (grammarIds.has(c.rule_id)) push({ code: "SHEET_DUPLICATE_DECISION", message: `grammar rule ${c.rule_id} appears twice`, decision_id: c.decision_id });
        grammarIds.add(c.rule_id);
        const paths = [p.target_path, ...(p.patches ?? []).map((x) => x.path)];
        for (const path of paths) {
          if (!isValidPointer(stripValueSuffix(path)) && !isValidPointer(path)) {
            push({ code: "SHEET_PATCH_PATH_INVALID", message: `${c.decision_id} patches ${path}, which is not a Core IR parameter`, decision_id: c.decision_id, path: at() });
          }
        }
        if ((p.mutation.op === "replace" || p.mutation.op === "add") && p.mutation.value === undefined && !(p.patches && p.patches.length)) {
          push({ code: "SHEET_DECISION_INVALID", message: `${c.decision_id} ${p.mutation.op} mutation carries no value`, decision_id: c.decision_id });
        }
        break;
      }
      case "OPERATION_POLICY":
      case "ANTI_PATTERN_THRESHOLD":
      case "EVALUATION_ASSERTION": {
        const key = `${c.kind}|${c.payload.subject}`;
        if (policyKeys.has(key)) push({ code: "SHEET_DUPLICATE_DECISION", message: `${c.kind} subject ${c.payload.subject} is decided twice`, decision_id: c.decision_id });
        policyKeys.add(key);
        break;
      }
      case "PRIORITY_ORDER": {
        if (singletons.has(c.kind)) push({ code: "SHEET_DUPLICATE_DECISION", message: `${c.kind} is decided twice`, decision_id: c.decision_id });
        singletons.add(c.kind);
        break;
      }
      case "SCORING_WEIGHTS": {
        if (singletons.has(c.kind)) push({ code: "SHEET_DUPLICATE_DECISION", message: `${c.kind} is decided twice`, decision_id: c.decision_id });
        singletons.add(c.kind);
        const w = c.payload.weights;
        const sum = w.composition + w.lighting + w.color + w.materials;
        if (Math.abs(sum - 1) > 1e-4) push({ code: "SHEET_DECISION_INVALID", message: `${c.decision_id} weights sum to ${sum}, not 1 (compiler tolerance 1e-4)`, decision_id: c.decision_id });
        break;
      }
      default:
        break;
    }
  }

  // --- aggregate confidence ------------------------------------------------------------------
  if (Math.abs(sheet.confidence - minConfidence) > 1e-12) {
    push({ code: "SHEET_CONFIDENCE_INCONSISTENT", message: `sheet.confidence ${sheet.confidence} != minimum constraint confidence ${minConfidence}` });
  }
  if (sheet.confidence < fuse) {
    push({ code: "SHEET_CONFIDENCE_BELOW_FUSE", message: `sheet confidence ${sheet.confidence} < fuse ${fuse}` });
  }

  // --- role coverage -------------------------------------------------------------------------
  for (const role of ctx.required_roles) {
    if (!rolesPresent.has(role)) push({ code: "SHEET_ROLE_MISSING", message: `design_context requires role "${role}" but no constraint covers it` });
  }

  // --- band consistency (ADR-0001 rule 5: no empty intersection, repair targets stay inside) --
  const bands = sheet.constraints.filter((c): c is ConstraintOfKind<"PARAMETER_BAND"> => c.kind === "PARAMETER_BAND");
  const byParam = new Map<string, ConstraintOfKind<"PARAMETER_BAND">[]>();
  for (const b of bands) byParam.set(b.payload.parameter, [...(byParam.get(b.payload.parameter) ?? []), b]);
  const intersection = new Map<string, { lo: number; hi: number }>();
  const byPointer = new Map<string, { lo: number; hi: number; id: string }>();
  for (const [param, list] of byParam) {
    const hard = list.filter(hardBand);
    if (hard.length === 0) continue;
    const lo = Math.max(...hard.map((b) => b.payload.min));
    const hi = Math.min(...hard.map((b) => b.payload.max));
    if (lo > hi) {
      push({ code: "SHEET_RULE_CONFLICT", message: `bands for ${param} have an empty intersection: ${hard.map((b) => `${b.decision_id}[${b.payload.min},${b.payload.max}]`).join(" ∩ ")}` });
      continue;
    }
    intersection.set(param, { lo, hi });
    for (const b of hard) if (b.payload.ir_pointer) byPointer.set(b.payload.ir_pointer, { lo, hi, id: param });
    for (const t of list.filter((b) => !hardBand(b) && b.payload.target !== undefined && b.payload.semantics !== "STRUCTURAL_SIGNAL")) {
      const v = t.payload.target as number;
      if (v < lo || v > hi) push({ code: "SHEET_RULE_CONFLICT", message: `${t.decision_id} target ${v} escapes the ${param} band [${lo}, ${hi}]`, decision_id: t.decision_id });
    }
  }
  for (const c of sheet.constraints) {
    if (c.kind !== "GRAMMAR_RULE") continue;
    const p = c.payload;
    const edits: Array<{ path: string; value: unknown }> = [];
    if (p.patches?.length) for (const x of p.patches) edits.push({ path: x.path, value: x.value });
    else edits.push({ path: p.target_path, value: p.mutation.value });
    for (const e of edits) {
      const band = byPointer.get(stripValueSuffix(e.path));
      if (band && typeof e.value === "number" && (e.value < band.lo || e.value > band.hi)) {
        push({ code: "SHEET_RULE_CONFLICT", message: `${c.rule_id} repairs ${e.path} to ${e.value}, outside the aesthetic band [${band.lo}, ${band.hi}] of ${band.id}`, decision_id: c.decision_id });
      }
    }
  }
  return issues;
}

/** Validate or throw: the only way to obtain a ValidatedSheet. */
export function validateSheet(raw: unknown, opts: ValidateOptions = {}): ValidatedSheet {
  const issues = collectSheetIssues(raw, opts);
  if (issues.length > 0) throw new SheetRejectedError(issues);
  const frozen = deepFreeze(JSON.parse(JSON.stringify(raw))) as ValidatedSheet;
  VALIDATED.add(frozen);
  return frozen;
}
