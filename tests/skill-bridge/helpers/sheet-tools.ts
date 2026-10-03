/**
 * Helpers for the bridge's own unit tests.
 *
 * buildUnitTestSheet() is a SYNTHETIC sheet whose only purpose is to exercise the validator's
 * rejection paths in isolation (one defect at a time). Its numbers are placeholders and its rule
 * ids carry the UT- prefix; it is never used to prove integration — the cross-repo tests consume
 * sheets emitted by the real chinese-aesthetic-skill generator.
 */
import type { AestheticConstraintSheet, AestheticConstraint } from "../../../contracts/aesthetic-constraint-sheet/aesthetic-constraint-sheet.types";
import { CONTRACT_LOCK } from "../../../skill-bridge/contract";
import { computeConstraintHash, computeSheetHash } from "../../../skill-bridge/sheet-validator";
import type { SkillBinding } from "../../../skill-bridge/binding";

const H = (c: string) => c.repeat(64).slice(0, 64);

type Draft = Omit<AestheticConstraint, "provenance"> & { provenance: Omit<AestheticConstraint["provenance"], "content_hash"> & { content_hash?: string } };

const src = (id: string) => ({ source_id: `SRC-UT-${id}`, kind: "expert-judgment" as const, ref: `unit-test fixture ${id}` });

/** Recompute every hash so that a mutation made by a test is the ONLY defect left in the sheet. */
export function resealSheet<T extends AestheticConstraintSheet>(sheet: T): T {
  const copy = JSON.parse(JSON.stringify(sheet)) as T;
  for (const c of copy.constraints) c.provenance.content_hash = computeConstraintHash(c);
  copy.provenance.constraint_count = copy.constraints.length;
  copy.confidence = Math.min(...copy.constraints.map((c) => c.confidence));
  copy.provenance.content_hash = H("0");
  copy.provenance.content_hash = computeSheetHash(copy);
  return copy;
}

export function buildUnitTestSheet(): AestheticConstraintSheet {
  const common = { applies_to: {}, confidence: 0.9 };
  const constraints: Draft[] = [
    {
      ...common, decision_id: "D:UT-BAND-01:SONG", rule_id: "UT-BAND-01", kind: "PARAMETER_BAND", role: "composition",
      provenance: { sources: [src("1")] },
      payload: { parameter: "scene.composition.negativeSpaceRatio", ir_pointer: "/composition/negativeSpaceRatio", metric: "void_ratio", semantics: "PERIOD_BAND", min: 0.2, max: 0.8, unit: "ratio", rationale: "unit-test band" },
    },
    {
      ...common, decision_id: "D:UT-BAND-02:SONG", rule_id: "UT-BAND-02", kind: "PARAMETER_BAND", role: "composition",
      provenance: { sources: [src("2")] },
      payload: { parameter: "scene.composition.negativeSpaceRatio", ir_pointer: "/composition/negativeSpaceRatio", metric: "void_ratio", semantics: "REPAIR_TARGET", min: 0.2, max: 0.8, target: 0.5, unit: "ratio", rationale: "unit-test target" },
    },
    {
      ...common, decision_id: "D:UT-GR-01:SONG", rule_id: "UT-GR-01", kind: "GRAMMAR_RULE", role: "composition",
      provenance: { sources: [src("3")] },
      payload: { principle: "unit-test", category: "composition", target_path: "/composition/negativeSpaceRatio/value", condition: { operator: "<", value: 0.2 }, mutation: { op: "replace", value: 0.5 }, severity: "P1_WARNING", reason: "unit-test grammar rule" },
    },
    {
      ...common, decision_id: "D:UT-GR-02:SONG", rule_id: "UT-GR-02", kind: "GRAMMAR_RULE", role: "material",
      provenance: { sources: [src("4")] },
      payload: { principle: "unit-test", category: "materials", target_path: "/materials/0/roughness/value", condition: { operator: "<", value: 0.2 }, mutation: { op: "replace", value: 0.4 }, severity: "P2_INFO", reason: "unit-test material rule" },
    },
    {
      ...common, decision_id: "D:UT-GR-03:SONG", rule_id: "UT-GR-03", kind: "GRAMMAR_RULE", role: "lighting",
      provenance: { sources: [src("5")] },
      payload: { principle: "unit-test", category: "lighting", target_path: "/lighting/ambientRatio/value", condition: { operator: ">", value: 0.7 }, mutation: { op: "replace", value: 0.4 }, severity: "P2_INFO", reason: "unit-test lighting rule" },
    },
    {
      ...common, decision_id: "D:UT-GR-04:SONG", rule_id: "UT-GR-04", kind: "GRAMMAR_RULE", role: "color",
      provenance: { sources: [src("6")] },
      payload: { principle: "unit-test", category: "color", target_path: "/color/temperatureBias/value", condition: { operator: ">", value: 0.3 }, mutation: { op: "replace", value: 0.1 }, severity: "P2_INFO", reason: "unit-test colour rule" },
    },
    {
      ...common, decision_id: "D:UT-OP-01:SONG", rule_id: "UT-OP-01", kind: "OPERATION_POLICY", role: "spatial",
      provenance: { sources: [src("7")] },
      payload: { subject: "UT_OPERATION", params: { alpha: 1, beta: 2 }, flags: { gamma: true }, enums: { delta: "x" }, vectors: { eps: [1, 2] }, rationale: "unit-test policy" },
    },
    {
      ...common, decision_id: "D:UT-PO-01:SONG", rule_id: "UT-PO-01", kind: "PRIORITY_ORDER", role: "governance",
      provenance: { sources: [src("8")] },
      payload: { order: ["composition", "spatial", "lighting", "material"], rationale: "unit-test order" },
    },
    {
      ...common, decision_id: "D:UT-SW-01:SONG", rule_id: "UT-SW-01", kind: "SCORING_WEIGHTS", role: "evaluation",
      provenance: { sources: [src("9")] },
      payload: { weights: { composition: 0.4, lighting: 0.2, color: 0.2, materials: 0.2 }, rationale: "unit-test weights" },
    },
  ];
  const sheet: AestheticConstraintSheet = {
    schema_version: CONTRACT_LOCK.schema_version,
    skill_version: "1.0.0",
    source_ref: { repository: "hanjun88/chinese-aesthetic-skill", commit: "a".repeat(40), dirty: false, registry_path: "rules/registry.json", registry_hash: H("b"), generator: "unit-test" },
    compatibility: { contract_range: `^${CONTRACT_LOCK.schema_version}`, requires_capabilities: ["cap.constraint.parameter-band@1", "cap.constraint.grammar-rule@1"] },
    contract_hash: CONTRACT_LOCK.contract_hash,
    rule_id: "UT-CTX-01",
    decision_id: "D:UT-CTX-01:SONG.STONE.DIM",
    confidence: 0.9,
    design_context: { period: "SONG", material: "STONE", lighting: "DIM", scene_type: "OBJECT_STUDY", required_roles: ["composition", "lighting", "material", "color"] },
    constraints: constraints as AestheticConstraint[],
    provenance: { ledger_hash: H("c"), content_hash: H("0"), constraint_count: constraints.length },
  };
  return resealSheet(sheet);
}

export function bindingFor(sheet: AestheticConstraintSheet): SkillBinding {
  return {
    binding_version: "1.0.0",
    contract: { name: "AestheticConstraintSheet", schema_version: CONTRACT_LOCK.schema_version, contract_hash: CONTRACT_LOCK.contract_hash },
    source: { repository: sheet.source_ref.repository, commit: sheet.source_ref.commit },
    skill: { version: sheet.skill_version, compatible_range: `^${sheet.skill_version}` },
    registry: { path: sheet.source_ref.registry_path, hash: sheet.source_ref.registry_hash },
    provenance: { ledger_hash: sheet.provenance.ledger_hash },
    policy: { confidence_fuse: 0.5, allow_dirty_source: false, fail_closed: true },
  };
}

/** Deep clone + mutate + reseal. */
export function mutate(sheet: AestheticConstraintSheet, fn: (s: AestheticConstraintSheet) => void, opts: { reseal?: boolean } = {}): AestheticConstraintSheet {
  const copy = JSON.parse(JSON.stringify(sheet)) as AestheticConstraintSheet;
  fn(copy);
  return opts.reseal === false ? copy : resealSheet(copy);
}
