import { SheetRejectedError, type SheetRejectionCode } from "../../skill-bridge/errors";
import { collectSheetIssues, validateSheet, isValidatedSheet, computeSheetHash } from "../../skill-bridge/sheet-validator";
import { SUPPORTED_CAPABILITIES } from "../../skill-bridge/contract";
import { DecisionPack, MissingDecisionError } from "../../skill-bridge/decision-pack";
import { buildUnitTestSheet, bindingFor, mutate, resealSheet } from "./helpers/sheet-tools";

const base = buildUnitTestSheet();
const codes = (s: unknown, o = {}) => [...new Set(collectSheetIssues(s, o).map((i) => i.code))].sort();
const only = (c: SheetRejectionCode) => [c];

describe("sheet validator — unit behaviour on a synthetic sheet (rejection paths in isolation)", () => {
  it("accepts a consistent sheet and returns a frozen, branded ValidatedSheet", () => {
    expect(collectSheetIssues(base)).toEqual([]);
    const v = validateSheet(base);
    expect(isValidatedSheet(v)).toBe(true);
    expect(Object.isFrozen(v)).toBe(true);
    expect(Object.isFrozen(v.constraints[0])).toBe(true);
    expect(isValidatedSheet(JSON.parse(JSON.stringify(base)))).toBe(false);
  });

  it("accepts a sheet that matches its binding", () => {
    expect(collectSheetIssues(base, { binding: bindingFor(base) })).toEqual([]);
  });

  it("SHEET_SCHEMA_INVALID: unknown top-level field, bad id, wrong kind payload", () => {
    expect(codes({ ...base, surprise: 1 })).toEqual(only("SHEET_SCHEMA_INVALID"));
    expect(codes(mutate(base, (s) => { s.constraints[0].rule_id = "lowercase-id"; }))).toEqual(only("SHEET_SCHEMA_INVALID"));
    expect(codes(mutate(base, (s) => { (s.constraints[0] as any).payload.min = "0.1"; }))).toEqual(only("SHEET_SCHEMA_INVALID"));
    expect(codes(null)).toEqual(only("SHEET_SCHEMA_INVALID"));
  });

  it("SHEET_SCHEMA_INVALID: constraint with a payload of another kind is refused by the discriminator", () => {
    const wrong = mutate(base, (s) => { (s.constraints[0] as any).kind = "SCORING_WEIGHTS"; });
    expect(codes(wrong)).toEqual(only("SHEET_SCHEMA_INVALID"));
  });

  it("SHEET_SCHEMA_INVALID: malicious pointer segments are rejected at the schema layer", () => {
    const evil = mutate(base, (s) => { (s.constraints[2] as any).payload.target_path = "/__proto__/polluted"; });
    expect(codes(evil)).toEqual(only("SHEET_SCHEMA_INVALID"));
  });

  it("SHEET_CONTRACT_HASH_MISMATCH", () => {
    expect(codes(mutate(base, (s) => { s.contract_hash = "f".repeat(64); }))).toEqual(only("SHEET_CONTRACT_HASH_MISMATCH"));
  });

  it("SHEET_SCHEMA_VERSION_INCOMPATIBLE: other major or unsatisfied range", () => {
    expect(codes(mutate(base, (s) => { s.schema_version = "2.0.0"; }))).toEqual(only("SHEET_SCHEMA_VERSION_INCOMPATIBLE"));
    expect(codes(mutate(base, (s) => { s.compatibility.contract_range = "^2.0.0"; }))).toEqual(only("SHEET_SCHEMA_VERSION_INCOMPATIBLE"));
  });

  it("SHEET_SKILL_VERSION_STALE: skill version outside the bound range", () => {
    const binding = bindingFor(base);
    binding.skill.compatible_range = "^2.0.0";
    expect(codes(base, { binding })).toEqual(only("SHEET_SKILL_VERSION_STALE"));
  });

  it("SHEET_SOURCE_MISMATCH: repository, commit, registry hash", () => {
    const b = bindingFor(base);
    expect(codes(mutate(base, (s) => { s.source_ref.repository = "someone/else"; }), { binding: b })).toEqual(only("SHEET_SOURCE_MISMATCH"));
    expect(codes(mutate(base, (s) => { s.source_ref.commit = "d".repeat(40); }), { binding: b })).toEqual(only("SHEET_SOURCE_MISMATCH"));
    expect(codes(mutate(base, (s) => { s.source_ref.registry_hash = "e".repeat(64); }), { binding: b })).toEqual(only("SHEET_SOURCE_MISMATCH"));
  });

  it("SHEET_PROVENANCE_LEDGER_MISMATCH", () => {
    const b = bindingFor(base);
    b.provenance.ledger_hash = "9".repeat(64);
    expect(codes(base, { binding: b })).toEqual(only("SHEET_PROVENANCE_LEDGER_MISMATCH"));
  });

  it("BINDING_SOURCE_MISMATCH: binding pins another contract", () => {
    const b = bindingFor(base);
    b.contract.contract_hash = "1".repeat(64);
    expect(codes(base, { binding: b })).toEqual(only("BINDING_SOURCE_MISMATCH"));
  });

  it("SHEET_SOURCE_DIRTY unless explicitly allowed", () => {
    const dirty = mutate(base, (s) => { s.source_ref.dirty = true; });
    expect(codes(dirty)).toEqual(only("SHEET_SOURCE_DIRTY"));
    expect(codes(dirty, { allowDirty: true })).toEqual([]);
  });

  it("SHEET_CAPABILITY_UNSUPPORTED", () => {
    const s = mutate(base, (x) => { x.compatibility.requires_capabilities.push("cap.runtime.webgpu@1"); });
    expect(codes(s)).toEqual(only("SHEET_CAPABILITY_UNSUPPORTED"));
    expect(codes(s, { supportedCapabilities: [...SUPPORTED_CAPABILITIES, "cap.runtime.webgpu@1"] })).toEqual([]);
  });

  it("SHEET_PROVENANCE_HASH_MISMATCH: tampering after sealing is detected (constraint and sheet level)", () => {
    expect(codes(mutate(base, (s) => { (s.constraints[0].payload as any).max = 0.9; }, { reseal: false }))).toContain("SHEET_PROVENANCE_HASH_MISMATCH");
    expect(codes(mutate(base, (s) => { s.skill_version = "1.0.1"; }, { reseal: false }))).toEqual(only("SHEET_PROVENANCE_HASH_MISMATCH"));
    expect(computeSheetHash(base)).toBe(base.provenance.content_hash);
  });

  it("SHEET_PROVENANCE_MISSING: blank source ref", () => {
    expect(codes(mutate(base, (s) => { s.constraints[0].provenance.sources[0].ref = "   "; }))).toEqual(only("SHEET_PROVENANCE_MISSING"));
  });

  it("SHEET_CONFIDENCE_BELOW_FUSE: one weak decision blows the fuse for the whole sheet", () => {
    const s = mutate(base, (x) => { x.constraints[3].confidence = 0.3; });
    expect(codes(s)).toEqual(only("SHEET_CONFIDENCE_BELOW_FUSE"));
    expect(codes(s, { confidenceFuse: 0.2 })).toEqual([]);
  });

  it("SHEET_CONFIDENCE_INCONSISTENT: aggregate must equal the minimum", () => {
    const s = mutate(base, (x) => { x.confidence = 0.99; }, { reseal: false });
    const sealed = resealSheet(s);
    sealed.confidence = 0.99;
    sealed.provenance.content_hash = computeSheetHash(sealed);
    expect(codes(sealed)).toEqual(only("SHEET_CONFIDENCE_INCONSISTENT"));
  });

  it("SHEET_DUPLICATE_DECISION: decision ids, grammar rule ids, policy subjects, singletons", () => {
    expect(codes(mutate(base, (s) => { s.constraints[1].decision_id = s.constraints[0].decision_id; }))).toEqual(only("SHEET_DUPLICATE_DECISION"));
    expect(codes(mutate(base, (s) => { s.constraints[3].rule_id = s.constraints[2].rule_id; }))).toEqual(only("SHEET_DUPLICATE_DECISION"));
    expect(codes(mutate(base, (s) => { const c = JSON.parse(JSON.stringify(s.constraints[6])); c.decision_id = "D:UT-OP-02:SONG"; c.rule_id = "UT-OP-02"; s.constraints.push(c); }))).toEqual(only("SHEET_DUPLICATE_DECISION"));
    expect(codes(mutate(base, (s) => { const c = JSON.parse(JSON.stringify(s.constraints[8])); c.decision_id = "D:UT-SW-02:SONG"; c.rule_id = "UT-SW-02"; s.constraints.push(c); }))).toEqual(only("SHEET_DUPLICATE_DECISION"));
  });

  it("SHEET_CONTEXT_MISMATCH: a decision that does not apply to the sheet's context", () => {
    expect(codes(mutate(base, (s) => { s.constraints[0].applies_to = { period: ["TANG"] }; }))).toEqual(only("SHEET_CONTEXT_MISMATCH"));
    expect(codes(mutate(base, (s) => { s.constraints[0].applies_to = { material: ["BRONZE"] }; }))).toEqual(only("SHEET_CONTEXT_MISMATCH"));
    expect(codes(mutate(base, (s) => { s.constraints[0].applies_to = { lighting: ["DAYLIGHT"] }; }))).toEqual(only("SHEET_CONTEXT_MISMATCH"));
    expect(codes(mutate(base, (s) => { s.constraints[0].applies_to = { period: ["SONG"], material: ["STONE"], lighting: ["DIM"] }; }))).toEqual([]);
  });

  it("SHEET_ROLE_MISSING: required role without any constraint (e.g. missing material role)", () => {
    const s = mutate(base, (x) => { x.constraints = x.constraints.filter((c) => c.role !== "material"); });
    expect(codes(s)).toEqual(only("SHEET_ROLE_MISSING"));
  });

  it("SHEET_DECISION_INVALID: inverted band, target outside band, ratio outside [0,1], missing target, weights, mutation without value", () => {
    expect(codes(mutate(base, (s) => { (s.constraints[0].payload as any).min = 0.9; }))).toContain("SHEET_DECISION_INVALID");
    expect(codes(mutate(base, (s) => { (s.constraints[1].payload as any).target = 0.95; }))).toContain("SHEET_DECISION_INVALID");
    expect(codes(mutate(base, (s) => { (s.constraints[0].payload as any).max = 1.4; }))).toContain("SHEET_DECISION_INVALID");
    expect(codes(mutate(base, (s) => { delete (s.constraints[1].payload as any).target; }))).toContain("SHEET_DECISION_INVALID");
    expect(codes(mutate(base, (s) => { (s.constraints[8].payload as any).weights.composition = 0.9; }))).toEqual(only("SHEET_DECISION_INVALID"));
    expect(codes(mutate(base, (s) => { delete (s.constraints[2].payload as any).mutation.value; }))).toEqual(only("SHEET_DECISION_INVALID"));
  });

  it("SHEET_RULE_CONFLICT: bands with an empty intersection; targets or repairs that escape the band", () => {
    const disjoint = mutate(base, (s) => {
      const c = JSON.parse(JSON.stringify(s.constraints[0]));
      c.decision_id = "D:UT-BAND-03:SONG"; c.rule_id = "UT-BAND-03"; c.payload.semantics = "HARD_FLOOR"; c.payload.min = 0.85; c.payload.max = 1;
      s.constraints.push(c);
    });
    expect(codes(disjoint)).toEqual(only("SHEET_RULE_CONFLICT"));
    const escapes = mutate(base, (s) => { (s.constraints[2].payload as any).mutation.value = 0.95; });
    expect(codes(escapes)).toEqual(only("SHEET_RULE_CONFLICT"));
    const multi = mutate(base, (s) => { (s.constraints[2].payload as any).patches = [{ op: "replace", path: "/composition/negativeSpaceRatio/value", value: 0.05 }]; });
    expect(codes(multi)).toEqual(only("SHEET_RULE_CONFLICT"));
  });

  it("SHEET_PATCH_PATH_INVALID: grammar rule outside the Core IR, band pointer outside the Core IR", () => {
    expect(codes(mutate(base, (s) => { (s.constraints[2].payload as any).target_path = "/composition/doesNotExist/value"; }))).toEqual(only("SHEET_PATCH_PATH_INVALID"));
    expect(codes(mutate(base, (s) => { (s.constraints[2].payload as any).patches = [{ op: "replace", path: "/provenance/rawIRHash", value: "x" }]; }))).toEqual(only("SHEET_PATCH_PATH_INVALID"));
    expect(codes(mutate(base, (s) => { (s.constraints[0].payload as any).ir_pointer = "/nope/nothing"; }))).toEqual(only("SHEET_PATCH_PATH_INVALID"));
  });

  it("every code is reachable and every rejection throws SheetRejectedError with all issues", () => {
    const bad = mutate(base, (s) => { s.contract_hash = "f".repeat(64); s.constraints[0].provenance.sources[0].ref = " "; });
    try { validateSheet(bad); throw new Error("expected rejection"); } catch (e) {
      expect(e).toBeInstanceOf(SheetRejectedError);
      expect((e as SheetRejectedError).codes).toEqual(expect.arrayContaining(["SHEET_CONTRACT_HASH_MISMATCH", "SHEET_PROVENANCE_MISSING"]));
    }
  });
});

describe("DecisionPack", () => {
  const pack = DecisionPack.from(validateSheet(base));

  it("refuses unvalidated input", () => {
    expect(() => DecisionPack.from(JSON.parse(JSON.stringify(base)))).toThrow(SheetRejectedError);
  });

  it("reads bands, targets, policies and records usage", () => {
    expect(pack.periodBand("scene.composition.negativeSpaceRatio")?.min).toBe(0.2);
    expect(pack.effectiveBand("scene.composition.negativeSpaceRatio")).toMatchObject({ min: 0.2, max: 0.8 });
    expect(pack.designTarget("scene.composition.negativeSpaceRatio")?.target).toBe(0.5);
    const p = pack.policy("OPERATION_POLICY", "UT_OPERATION");
    expect([p.num("alpha"), p.flag("gamma"), p.str("delta"), [...p.vec("eps")]]).toEqual([1, true, "x", [1, 2]]);
    expect(pack.usage().map((u) => u.decision_id)).toEqual(expect.arrayContaining(["D:UT-BAND-01:SONG", "D:UT-OP-01:SONG"]));
  });

  it("fails closed on anything the sheet does not carry", () => {
    expect(() => pack.policy("OPERATION_POLICY", "NOT_THERE")).toThrow(MissingDecisionError);
    expect(() => pack.policy("OPERATION_POLICY", "UT_OPERATION").num("missing")).toThrow(MissingDecisionError);
    expect(() => pack.assertPeriod("TANG")).toThrow(/SONG/);
  });

  it("derives the Core GrammarRulePack with the skill's rule ids", () => {
    const g = pack.grammarRulePack();
    expect(g.rules.map((r) => r.ruleId)).toEqual(["UT-GR-01", "UT-GR-02", "UT-GR-03", "UT-GR-04"]);
    expect(pack.grammarRuleRef("UT-GR-01")).toEqual({ rule_id: "UT-GR-01", decision_id: "D:UT-GR-01:SONG" });
  });

  it("checks a requirements manifest at construction time", () => {
    const v = validateSheet(base);
    expect(() => DecisionPack.from(v, [{ kind: "OPERATION_POLICY", subject: "UT_OPERATION", params: ["alpha", "nope"] }])).toThrow(/nope/);
    expect(() => DecisionPack.from(v, [{ kind: "PARAMETER_BAND", subject: "scene.composition.axialSymmetry" }])).toThrow(/axialSymmetry/);
    expect(() => DecisionPack.from(v, [{ kind: "OPERATION_POLICY", subject: "UT_OPERATION", params: ["alpha", "beta"], flags: ["gamma"], enums: ["delta"], vectors: ["eps"] }, { kind: "SCORING_WEIGHTS" }, { kind: "PRIORITY_ORDER" }])).not.toThrow();
  });
});
