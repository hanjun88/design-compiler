/**
 * GrammarGovernor — lifecycle and rollback of the aesthetic grammar the compiler runs on.
 *
 * The grammar is not defined here. Every generation is an AestheticConstraintSheet that the
 * chinese-aesthetic-skill emitted and the bridge validated (schema, hashes, binding, capabilities,
 * confidence fuse, band consistency). The governor owns what happens to those sheets over time:
 *
 *   submit()            validate -> DecisionPack -> (canary compile through the real chain) -> activate.
 *                       Any refusal leaves the active generation untouched; nothing is half-activated.
 *   compile()           compile with the active generation. When its patches fail to apply and the previous
 *                       generation compiles the very same input, the active generation is rolled back
 *                       (quarantined) and the previous one answers. A failure the previous generation shares
 *                       is the input's fault, not the grammar's, and rolls nothing back.
 *   applyEnvironment()  the compiler build or its capability set changed (contract incompatible, capability
 *                       withdrawn): every active generation is re-verified and rolled back to the newest
 *                       generation that still passes, or deactivated (fail closed) when none does.
 *   rollbackGrammar()   explicit, audited rollback to a named earlier generation.
 *
 * Generations are ordered by a logical sequence number; the governor never reads a wall clock, so a history
 * replays identically. A rolled-back generation is quarantined: the same sheet cannot be activated again, only
 * a changed one can.
 */
import semver from "semver";
import { CompilerError, CompilerErrorCode } from "../compiler-core/error-codes";
import type { G1Policy } from "../compiler-core/data-gate";
import type { HostCapabilities } from "../compiler-core/capability-negotiator";
import type { TierMappingConfig } from "../compiler-core/tier-mapping-types";
import type { CangjieRawDesignIR } from "../compiler-intent/types";
import {
  DEFAULT_BINDING_PATH,
  DecisionPack,
  REQUIRED_DECISIONS,
  SheetRejectedError,
  SUPPORTED_CAPABILITIES,
  collectSheetIssues,
  compileWithSheet,
  loadBinding,
  validateSheet,
  verifyLedger,
  type CompileWithSheetInput,
  type CompileWithSheetResult,
  type ContractIdentity,
  type SheetIssue,
  type SheetRejectionCode,
  type SkillBinding,
  type ValidateOptions,
  type ValidatedSheet,
} from "../skill-bridge";

// ------------------------------------------------------------------------------------------------
// vocabulary
// ------------------------------------------------------------------------------------------------

export type GovernanceRejectionCode = SheetRejectionCode | "CANARY_FAILED" | "GENERATION_STALE" | "GENERATION_QUARANTINED";

export interface GovernanceIssue {
  code: GovernanceRejectionCode;
  message: string;
  decision_id?: string;
}

export type GenerationState = "ACTIVE" | "SUPERSEDED" | "ROLLED_BACK";

/** Everything that identifies a generation; derived from the validated sheet, never supplied by the caller. */
export interface GenerationIdentity {
  /** PERIOD.MATERIAL.LIGHTING.SCENE_TYPE — the lineage the generation belongs to. */
  readonly context: string;
  readonly skill_version: string;
  readonly commit: string;
  readonly registry_hash: string;
  readonly schema_version: string;
  readonly contract_hash: string;
  readonly sheet_hash: string;
  /** Digest of the decisions only (stable across skill commits that do not change them). */
  readonly constraints_hash: string;
  readonly decision_id: string;
}

export interface CanaryEvidence {
  readonly validated_ir_hash: string;
  readonly patches: number;
}

/** Read-only snapshot of a generation. */
export interface GenerationView {
  readonly sequence: number;
  readonly state: GenerationState;
  /** Why the generation left ACTIVE (rollback reason / supersession), when it did. */
  readonly state_reason?: string;
  readonly identity: GenerationIdentity;
  readonly canary?: CanaryEvidence;
}

export type GovernanceEventType = "REJECTED" | "ACTIVATED" | "UNCHANGED" | "ROLLED_BACK" | "DEACTIVATED" | "REVERIFIED";

export interface GovernanceEvent {
  /** Logical clock, strictly increasing across the governor. */
  readonly seq: number;
  readonly type: GovernanceEventType;
  readonly context: string;
  readonly generation?: number;
  readonly from?: number;
  readonly to?: number;
  readonly reason?: string;
  readonly codes?: readonly string[];
}

export interface GovernanceEnvironment {
  /** Capabilities this compiler build provides (default: SUPPORTED_CAPABILITIES). */
  supportedCapabilities?: readonly string[];
  /** Contract identity this compiler build implements (default: the repository's locked contract). */
  contract?: ContractIdentity;
}

// ------------------------------------------------------------------------------------------------
// canary
// ------------------------------------------------------------------------------------------------

export interface CanaryCandidate {
  readonly sheet: ValidatedSheet;
  readonly pack: DecisionPack;
  readonly validation: ValidateOptions;
}

export interface CanaryResult {
  readonly passed: boolean;
  readonly detail: string;
  readonly evidence?: CanaryEvidence;
}

/** Runs a candidate generation through the real chain before it is activated. Must not throw. */
export type CanaryRunner = (candidate: CanaryCandidate) => CanaryResult;

export interface CompileCanaryConfig {
  /** The canary brief of a design context; undefined means no canary can run there (the candidate is refused). */
  briefFor(context: ValidatedSheet["design_context"]): CangjieRawDesignIR | undefined;
  g1Policy: G1Policy;
  tierConfig: TierMappingConfig;
  hostCapabilities: HostCapabilities;
  testCaseId: string;
  capturedAt: string;
}

/**
 * The canary used in production wiring: a real compilation (G1 -> sheet grammar patches -> G3) of the
 * context's canary brief, whose provenance ledger must verify against the candidate's own DecisionPack.
 */
export function createCompileCanary(config: CompileCanaryConfig): CanaryRunner {
  return ({ sheet, validation }) => {
    const brief = config.briefFor(sheet.design_context);
    if (!brief) return { passed: false, detail: "no canary brief is registered for this design context" };
    try {
      const out = compileWithSheet({
        sheet,
        brief,
        validation,
        g1Policy: config.g1Policy,
        tierConfig: config.tierConfig,
        hostCapabilities: config.hostCapabilities,
        testCaseId: config.testCaseId,
        capturedAt: config.capturedAt,
      });
      if (out.normalization.status !== "PASS") return { passed: false, detail: `canary brief failed intent normalisation (${out.normalization.status})` };
      if (!out.pipeline || out.pipeline.status !== "SUCCESS") return { passed: false, detail: `canary compilation halted: ${out.pipeline ? out.pipeline.haltStage : "no pipeline output"}` };
      if (!out.ledger) return { passed: false, detail: "canary compilation produced no provenance ledger" };
      verifyLedger(out.ledger, out.pack);
      return { passed: true, detail: "canary compiled and its provenance ledger verified", evidence: { validated_ir_hash: out.pipeline.hashChain.validatedIRHash, patches: out.pipeline.validatedIR.patches.length } };
    } catch (e) {
      return { passed: false, detail: `canary compilation failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  };
}

// ------------------------------------------------------------------------------------------------
// outcomes
// ------------------------------------------------------------------------------------------------

export type SubmitOutcome =
  | { status: "ACTIVATED"; generation: GenerationView; superseded?: GenerationView }
  | { status: "UNCHANGED"; generation: GenerationView }
  | { status: "REJECTED"; context: string; issues: readonly GovernanceIssue[]; codes: readonly GovernanceRejectionCode[]; active?: GenerationView };

export type RollbackTarget = "previous" | { sequence: number } | { skill_version: string };

export type RollbackRefusal = "UNKNOWN_CONTEXT" | "NO_ACTIVE_GENERATION" | "TARGET_NOT_FOUND" | "TARGET_ALREADY_ACTIVE" | "TARGET_QUARANTINED" | "TARGET_NEWER_THAN_ACTIVE" | "TARGET_INCOMPATIBLE";

export interface RollbackOutcome {
  success: boolean;
  context: string;
  rolledBackFrom?: GenerationView;
  rolledBackTo?: GenerationView;
  reason: string;
  refusal?: RollbackRefusal;
  /** Why the target cannot take over (TARGET_INCOMPATIBLE). */
  issues?: readonly GovernanceIssue[];
}

export interface ReverifyReport {
  context: string;
  action: "KEPT" | "ROLLED_BACK" | "DEACTIVATED";
  generation: GenerationView;
  rolledBackTo?: GenerationView;
  codes: readonly GovernanceRejectionCode[];
}

export type GuardedCompileInput = Omit<CompileWithSheetInput, "sheet" | "validation">;

export interface GuardedCompileResult extends CompileWithSheetResult {
  /** The generation whose grammar produced this result. */
  generation: GenerationView;
  /** Present when the previously active generation failed and was rolled back during this call. */
  fallback?: { failed: GenerationView; failure: { code: string; message: string } };
}

export class NoActiveGrammarError extends Error {
  public readonly context: string;
  constructor(context: string) {
    super(`no active aesthetic grammar for ${context}: nothing was activated, or every generation failed re-verification (fail closed)`);
    this.name = "NoActiveGrammarError";
    this.context = context;
  }
}

// ------------------------------------------------------------------------------------------------
// governor
// ------------------------------------------------------------------------------------------------

export interface GovernorOptions {
  environment?: GovernanceEnvironment;
  /**
   * The binding every submitted sheet is admitted under unless submit() names another. Production wiring uses
   * GrammarGovernor.pinned(), which reads contracts/binding/binding.json: a sheet from any other skill build is refused.
   */
  defaultBinding?: SkillBinding;
  /** Validation policy shared by every generation (the binding is per generation, see submit). */
  validation?: Pick<ValidateOptions, "allowDirty" | "confidenceFuse">;
  /** Canary run before activation. With none configured a candidate is activated on validation alone. */
  canary?: CanaryRunner;
}

export interface SubmitOptions {
  /** The binding the sheet is admitted under; it stays attached to the generation for its whole life. */
  binding?: SkillBinding;
  /** Permit activating a sheet from an older skill version than the active generation (rollback is the sanctioned path). */
  allowDowngrade?: boolean;
}

interface Entry {
  sequence: number;
  state: GenerationState;
  stateReason?: string;
  readonly sheet: ValidatedSheet;
  readonly pack: DecisionPack;
  readonly binding?: SkillBinding;
  readonly identity: GenerationIdentity;
  canary?: CanaryEvidence;
}

interface Lineage {
  readonly context: string;
  readonly entries: Entry[];
  active?: Entry;
}

const PATCH_STAGE_CODES: ReadonlySet<string> = new Set([
  CompilerErrorCode.PATCH_POINTER_INVALID,
  CompilerErrorCode.PATCH_OP_UNSUPPORTED,
  CompilerErrorCode.PATCH_PATH_NOT_FOUND,
  CompilerErrorCode.PATCH_TEST_FAILED,
  CompilerErrorCode.PATCH_ORDER_VIOLATION,
]);

export const contextKeyOf = (c: ValidatedSheet["design_context"]): string => [c.period, c.material, c.lighting, c.scene_type].join(".");

const asIssues = (issues: readonly SheetIssue[]): GovernanceIssue[] => issues.map((i) => ({ code: i.code, message: i.message, ...(i.decision_id ? { decision_id: i.decision_id } : {}) }));
const uniqueCodes = (issues: readonly GovernanceIssue[]): GovernanceRejectionCode[] => [...new Set(issues.map((i) => i.code))];

export class GrammarGovernor {
  private env: GovernanceEnvironment;
  private readonly policy: Pick<ValidateOptions, "allowDirty" | "confidenceFuse">;
  private readonly canary?: CanaryRunner;
  private readonly defaultBinding?: SkillBinding;
  private readonly lineages = new Map<string, Lineage>();
  private readonly log: GovernanceEvent[] = [];
  private clock = 0;
  private nextSequence = 1;

  constructor(options: GovernorOptions = {}) {
    this.env = { ...options.environment };
    this.policy = { ...options.validation };
    this.canary = options.canary;
    this.defaultBinding = options.defaultBinding;
  }

  /**
   * The production constructor: every generation is admitted under the skill build this compiler pins
   * (contracts/binding/binding.json, or `bindingPath`). A missing or malformed binding throws; there is no unbound mode.
   */
  static pinned(options: Omit<GovernorOptions, "defaultBinding"> & { bindingPath?: string } = {}): GrammarGovernor {
    const { bindingPath, ...rest } = options;
    const binding = loadBinding(bindingPath ?? DEFAULT_BINDING_PATH);
    return new GrammarGovernor({ ...rest, validation: { allowDirty: binding.policy.allow_dirty_source, ...rest.validation }, defaultBinding: binding });
  }

  // ----- reads ---------------------------------------------------------------------------------
  get environment(): Readonly<GovernanceEnvironment> {
    return { supportedCapabilities: this.env.supportedCapabilities ?? SUPPORTED_CAPABILITIES, ...(this.env.contract ? { contract: this.env.contract } : {}) };
  }

  /** The generation currently answering for a context, if any. */
  active(context: string): GenerationView | undefined {
    const a = this.lineages.get(context)?.active;
    return a ? this.view(a) : undefined;
  }

  /** Every generation of a context, oldest first. */
  generations(context: string): GenerationView[] {
    return (this.lineages.get(context)?.entries ?? []).map((e) => this.view(e));
  }

  contexts(): string[] {
    return [...this.lineages.keys()].sort();
  }

  /** Audited history, oldest first; `limit` keeps the most recent entries. */
  history(filter: { context?: string; limit?: number } = {}): GovernanceEvent[] {
    const events = filter.context ? this.log.filter((e) => e.context === filter.context) : [...this.log];
    return filter.limit !== undefined ? events.slice(-filter.limit) : events;
  }

  // ----- submit --------------------------------------------------------------------------------
  submit(raw: unknown, opts: SubmitOptions = {}): SubmitOutcome {
    const binding = opts.binding ?? this.defaultBinding;
    const validation = this.validationFor(binding);
    const hint = this.contextHint(raw);

    const issues = collectSheetIssues(raw, validation);
    if (issues.length > 0) return this.reject(hint, asIssues(issues));

    const sheet = validateSheet(raw, validation);
    let pack: DecisionPack;
    try {
      pack = DecisionPack.from(sheet, REQUIRED_DECISIONS);
    } catch (e) {
      if (e instanceof SheetRejectedError) return this.reject(hint, asIssues(e.issues));
      throw e;
    }

    const context = contextKeyOf(sheet.design_context);
    const lineage = this.lineageOf(context);
    const identity = this.identityOf(sheet, pack, context);

    const twin = lineage.entries.find((e) => e.identity.sheet_hash === identity.sheet_hash);
    if (twin?.state === "ROLLED_BACK") {
      return this.reject(context, [{ code: "GENERATION_QUARANTINED", message: `sheet ${identity.sheet_hash.slice(0, 12)} was rolled back (${twin.stateReason ?? "no reason recorded"}) and cannot be activated again unchanged` }], lineage);
    }
    if (twin?.state === "ACTIVE") {
      this.record({ type: "UNCHANGED", context, generation: twin.sequence });
      return { status: "UNCHANGED", generation: this.view(twin) };
    }
    const current = lineage.active;
    if (current && !opts.allowDowngrade && semver.lt(sheet.skill_version, current.identity.skill_version)) {
      return this.reject(context, [{ code: "GENERATION_STALE", message: `skill_version ${sheet.skill_version} is older than the active ${current.identity.skill_version}; use rollbackGrammar() to go back deliberately` }], lineage);
    }

    let canary: CanaryEvidence | undefined;
    if (this.canary) {
      const result = this.canary({ sheet, pack, validation });
      if (!result.passed) return this.reject(context, [{ code: "CANARY_FAILED", message: result.detail }], lineage);
      canary = result.evidence;
    }

    const entry: Entry = { sequence: this.nextSequence++, state: "ACTIVE", sheet, pack, binding, identity, canary };
    let superseded: GenerationView | undefined;
    if (current) {
      current.state = "SUPERSEDED";
      current.stateReason = `superseded by generation ${entry.sequence}`;
      superseded = this.view(current);
    }
    lineage.entries.push(entry);
    lineage.active = entry;
    this.record({ type: "ACTIVATED", context, generation: entry.sequence, ...(current ? { from: current.sequence } : {}), to: entry.sequence, reason: `skill ${identity.skill_version} @ ${identity.commit.slice(0, 10)}` });
    return { status: "ACTIVATED", generation: this.view(entry), ...(superseded ? { superseded } : {}) };
  }

  // ----- rollback ------------------------------------------------------------------------------
  /**
   * Roll a context back to an earlier generation. The target must still pass verification under the
   * current environment and its own binding; a refusal changes nothing.
   */
  rollbackGrammar(context: string, target: RollbackTarget, reason: string): RollbackOutcome {
    const lineage = this.lineages.get(context);
    const refuse = (refusal: RollbackRefusal, why: string, extra: Partial<RollbackOutcome> = {}): RollbackOutcome => ({ success: false, context, reason: why, refusal, ...extra });
    if (!lineage) return refuse("UNKNOWN_CONTEXT", `no grammar was ever submitted for ${context}`);
    const from = lineage.active;
    if (!from) return refuse("NO_ACTIVE_GENERATION", `${context} has no active generation to roll back from`);

    let to: Entry | undefined;
    if (target === "previous") to = [...lineage.entries].reverse().find((e) => e.sequence < from.sequence && e.state === "SUPERSEDED");
    else if ("sequence" in target) to = lineage.entries.find((e) => e.sequence === target.sequence);
    else to = [...lineage.entries].reverse().find((e) => e.identity.skill_version === target.skill_version && e.state !== "ACTIVE") ?? lineage.entries.find((e) => e.identity.skill_version === target.skill_version);

    if (!to) return refuse("TARGET_NOT_FOUND", target === "previous" ? `${context} has no earlier generation to return to` : `no generation matches ${JSON.stringify(target)}`);
    if (to === from) return refuse("TARGET_ALREADY_ACTIVE", `generation ${to.sequence} is already active`);
    if (to.state === "ROLLED_BACK") return refuse("TARGET_QUARANTINED", `generation ${to.sequence} was rolled back before (${to.stateReason ?? "no reason recorded"}) and may not be restored`);
    if (to.sequence > from.sequence) return refuse("TARGET_NEWER_THAN_ACTIVE", `generation ${to.sequence} is newer than the active generation ${from.sequence}; this is a rollback, not a promotion`);

    const blocking = this.recheck(to);
    if (blocking.length > 0) {
      return refuse("TARGET_INCOMPATIBLE", `generation ${to.sequence} no longer passes verification: ${blocking.map((i) => i.code).join(", ")}`, { issues: asIssues(blocking) });
    }
    const fromView = this.view(from);
    this.swap(lineage, from, to, reason);
    return { success: true, context, rolledBackFrom: fromView, rolledBackTo: this.view(to), reason };
  }

  // ----- environment ---------------------------------------------------------------------------
  /**
   * The compiler build or its capability set changed. Re-verifies every active generation against the new
   * environment and its own binding; a generation that no longer passes (incompatible contract, withdrawn
   * capability, ...) is rolled back to the newest earlier generation that does, or deactivated when none does.
   */
  applyEnvironment(next: GovernanceEnvironment): ReverifyReport[] {
    this.env = { ...this.env, ...next };
    const reports: ReverifyReport[] = [];
    for (const context of this.contexts()) {
      const lineage = this.lineages.get(context) as Lineage;
      const active = lineage.active;
      if (!active) continue;
      const issues = this.recheck(active);
      const codes = uniqueCodes(asIssues(issues));
      if (issues.length === 0) {
        this.record({ type: "REVERIFIED", context, generation: active.sequence });
        reports.push({ context, action: "KEPT", generation: this.view(active), codes: [] });
        continue;
      }
      const why = `environment change: ${codes.join(", ")}`;
      const fallback = [...lineage.entries].reverse().find((e) => e.sequence < active.sequence && e.state === "SUPERSEDED" && this.recheck(e).length === 0);
      const failed = this.view(active);
      if (fallback) {
        this.swap(lineage, active, fallback, why);
        reports.push({ context, action: "ROLLED_BACK", generation: { ...failed, state: "ROLLED_BACK", state_reason: why }, rolledBackTo: this.view(fallback), codes });
      } else {
        active.state = "ROLLED_BACK";
        active.stateReason = `${why}; no earlier generation passes verification`;
        lineage.active = undefined;
        this.record({ type: "DEACTIVATED", context, generation: active.sequence, reason: active.stateReason, codes });
        reports.push({ context, action: "DEACTIVATED", generation: this.view(active), codes });
      }
    }
    return reports;
  }

  // ----- guarded compile -----------------------------------------------------------------------
  /**
   * Compile with the active grammar of `context`. Fails closed without one. When applying the active
   * generation's patches fails and the previous generation compiles the same input, the active generation
   * is rolled back and the previous generation's result is returned (see `fallback`).
   */
  compile(context: string, input: GuardedCompileInput): GuardedCompileResult {
    const lineage = this.lineages.get(context);
    const active = lineage?.active;
    if (!lineage || !active) throw new NoActiveGrammarError(context);

    try {
      return { ...this.compileWith(active, input), generation: this.view(active) };
    } catch (e) {
      if (!(e instanceof CompilerError) || !PATCH_STAGE_CODES.has(e.code)) throw e;
      const previous = [...lineage.entries].reverse().find((x) => x.sequence < active.sequence && x.state === "SUPERSEDED" && this.recheck(x).length === 0);
      if (!previous) throw e;
      let fallbackResult: CompileWithSheetResult;
      try {
        fallbackResult = this.compileWith(previous, input);
      } catch (e2) {
        // The previous generation cannot handle this input either: the input is at fault, not the grammar.
        if (e2 instanceof CompilerError && PATCH_STAGE_CODES.has(e2.code)) throw e;
        throw e2;
      }
      const failed = this.view(active);
      const failure = { code: e.code, message: e.message };
      this.swap(lineage, active, previous, `patch application failed (${failure.code}): ${failure.message}`);
      return { ...fallbackResult, generation: this.view(previous), fallback: { failed: { ...failed, state: "ROLLED_BACK", state_reason: `patch application failed (${failure.code})` }, failure } };
    }
  }

  // ----- internals -----------------------------------------------------------------------------
  private validationFor(binding: SkillBinding | undefined): ValidateOptions {
    return {
      ...this.policy,
      ...(binding ? { binding } : {}),
      supportedCapabilities: this.env.supportedCapabilities ?? SUPPORTED_CAPABILITIES,
      ...(this.env.contract ? { contract: this.env.contract } : {}),
    };
  }

  private recheck(entry: Entry): SheetIssue[] {
    return collectSheetIssues(entry.sheet, this.validationFor(entry.binding));
  }

  private compileWith(entry: Entry, input: GuardedCompileInput): CompileWithSheetResult {
    return compileWithSheet({ ...input, sheet: entry.sheet, validation: this.validationFor(entry.binding) });
  }

  private swap(lineage: Lineage, from: Entry, to: Entry, reason: string): void {
    from.state = "ROLLED_BACK";
    from.stateReason = reason;
    to.state = "ACTIVE";
    to.stateReason = undefined;
    lineage.active = to;
    this.record({ type: "ROLLED_BACK", context: lineage.context, generation: from.sequence, from: from.sequence, to: to.sequence, reason });
  }

  private lineageOf(context: string): Lineage {
    let l = this.lineages.get(context);
    if (!l) {
      l = { context, entries: [] };
      this.lineages.set(context, l);
    }
    return l;
  }

  private identityOf(sheet: ValidatedSheet, pack: DecisionPack, context: string): GenerationIdentity {
    return Object.freeze({
      context,
      skill_version: sheet.skill_version,
      commit: sheet.source_ref.commit,
      registry_hash: sheet.source_ref.registry_hash,
      schema_version: sheet.schema_version,
      contract_hash: sheet.contract_hash,
      sheet_hash: pack.sheetHash,
      constraints_hash: pack.constraintsHash,
      decision_id: sheet.decision_id,
    });
  }

  private view(e: Entry): GenerationView {
    return Object.freeze({ sequence: e.sequence, state: e.state, ...(e.stateReason ? { state_reason: e.stateReason } : {}), identity: e.identity, ...(e.canary ? { canary: e.canary } : {}) });
  }

  /** A context label for the audit log of a sheet that did not survive validation. */
  private contextHint(raw: unknown): string {
    const c = (raw as { design_context?: Partial<ValidatedSheet["design_context"]> } | null)?.design_context;
    return c && typeof c === "object" && c.period && c.material && c.lighting && c.scene_type ? [c.period, c.material, c.lighting, c.scene_type].join(".") : "UNKNOWN";
  }

  private reject(context: string, issues: GovernanceIssue[], lineage?: Lineage): SubmitOutcome {
    const codes = uniqueCodes(issues);
    this.record({ type: "REJECTED", context, reason: issues.slice(0, 3).map((i) => i.message).join("; "), codes });
    const active = (lineage ?? this.lineages.get(context))?.active;
    return { status: "REJECTED", context, issues, codes, ...(active ? { active: this.view(active) } : {}) };
  }

  private record(e: Omit<GovernanceEvent, "seq">): void {
    this.log.push(Object.freeze({ seq: ++this.clock, ...e }));
  }
}
