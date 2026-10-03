/**
 * Real cross-repo chain, Core half:
 *   chinese-aesthetic-skill (real generator, emitted by the jest global setup)
 *     -> AestheticConstraintSheet -> validateSheet -> DecisionPack -> RawDesignIR (brief + sheet seeds)
 *     -> RFC 6902 patches (rules of the SAME sheet) -> ValidatedDesignIR -> RuntimeExecutionPlan
 *     -> ProvenanceLedger (patch -> rule_id -> decision_id -> source_ref)
 * Nothing here is mocked: the sheet bytes are produced by the skill, the pipeline is the production runner.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { compileWithSheet, verifyLedger, LedgerIntegrityError, SheetRejectedError, sheetGrammarVersion } from "../../skill-bridge";
import type { CangjieRawDesignIR } from "../../compiler-intent/types";
import type { HostCapabilities } from "../../compiler-core/capability-negotiator";
import { GOLDEN_CONTEXTS, loadSheetJson, packFor, strictBinding, type TestContext } from "../support/skill-packs";
import { skillDir } from "../support/skill-env";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const brief = (cell: string): CangjieRawDesignIR => read(`tests/golden-case-matrix/fixtures/matrix-ir-templates/${cell}.json`);
const HOST: HostCapabilities = { webgl2: true, floatTextures: true, highPrecisionFragment: true, anisotropyExtension: true, maxFragmentUniformVectors: 1024 };
const CAPTURED_AT = "2026-09-16T00:00:00Z";

function run(ctx: TestContext, b: CangjieRawDesignIR, sheet: unknown = loadSheetJson(ctx)) {
  return compileWithSheet({
    sheet,
    brief: b,
    validation: { allowDirty: !strictBinding() },
    g1Policy: read("config/g1-policy.json"),
    tierConfig: read("config/tier-mapping.json"),
    hostCapabilities: HOST,
    testCaseId: "E2E-CORE-CHAIN",
    capturedAt: CAPTURED_AT,
  });
}

describe("skill sheet -> Core pipeline (real, unmocked)", () => {
  it("the sheet consumed here is byte-identical to what the skill generator emits now", () => {
    const ctx = GOLDEN_CONTEXTS["MC-S01"];
    const r = spawnSync("node", [path.join(skillDir(), "scripts", "emit-sheet.mjs"), "--period", ctx.period, "--material", ctx.material, "--lighting", ctx.lighting, "--scene-type", ctx.scene_type], { encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual(loadSheetJson(ctx));
  });

  it("compiles a golden brief through the sheet: patches carry the skill's rule ids, the ledger verifies", () => {
    const ctx = GOLDEN_CONTEXTS["MC-T01"];
    const out = run(ctx, brief("MC-T01"));
    expect(out.normalization.status).toBe("PASS");
    expect(out.pipeline?.status).toBe("SUCCESS");
    if (out.pipeline?.status !== "SUCCESS" || !out.ledger) throw new Error("expected a successful compilation with a ledger");

    const sheetRuleIds = new Set(out.pack.grammarRulePack().rules.map((r) => r.ruleId));
    const patches = out.pipeline.validatedIR.patches;
    expect(patches.length).toBeGreaterThan(0);
    for (const p of patches) expect(sheetRuleIds.has(p.audit.ruleId)).toBe(true);

    expect(out.ledger.patches.map((e) => e.rule_id)).toEqual(patches.map((p) => p.audit.ruleId));
    for (const e of out.ledger.patches) {
      expect(e.decision_id).toMatch(/^D:/);
      expect(e.sources.length).toBeGreaterThanOrEqual(1);
    }
    expect(out.ledger.source_ref.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(out.ledger.source_ref.sheet_hash).toBe(out.pack.sheetHash);
    expect(out.ledger.chain.validatedIRHash).toBe(out.pipeline.hashChain.validatedIRHash);
    expect(() => verifyLedger(out.ledger!, out.pack)).not.toThrow();
    // the ValidatedDesignIR names the sheet-derived pack and the skill version
    expect(out.pipeline.validatedIR.meta.grammarPack).toBe(`aesthetic-sheet:${out.pack.sheet.decision_id}`);
    expect(out.pipeline.validatedIR.meta.grammarVersion).toBe(out.pack.provenance.skill_version);
  });

  it("the hash chain is bound to the sheet: the same brief under another context gets another input hash", () => {
    const a = run(GOLDEN_CONTEXTS["MC-T01"], brief("MC-T01"));
    const b = run(GOLDEN_CONTEXTS["MC-M01"], brief("MC-T01"));
    expect(a.pipeline?.status).toBe("SUCCESS");
    expect(b.pipeline?.status).toBe("SUCCESS");
    if (a.pipeline?.status !== "SUCCESS" || b.pipeline?.status !== "SUCCESS") return;
    expect(a.pipeline.hashChain.inputHash).not.toBe(b.pipeline.hashChain.inputHash);
    expect(sheetGrammarVersion(a.pack)).not.toBe(sheetGrammarVersion(b.pack));
  });

  it("is deterministic: same sheet + brief => same hash chain and patches", () => {
    const x = run(GOLDEN_CONTEXTS["MC-S01"], brief("MC-S01"));
    const y = run(GOLDEN_CONTEXTS["MC-S01"], brief("MC-S01"));
    if (x.pipeline?.status !== "SUCCESS" || y.pipeline?.status !== "SUCCESS") throw new Error("expected success");
    expect(x.pipeline.hashChain).toEqual(y.pipeline.hashChain);
    expect(x.pipeline.validatedIR.patches).toEqual(y.pipeline.validatedIR.patches);
  });

  it("seeds an aesthetic parameter the brief omits from the sheet's DESIGN_DEFAULT decision", () => {
    const ctx: TestContext = { period: "SONG", material: "STONE", lighting: "DIM", scene_type: "PALACE" };
    const b = brief("MC-S01");
    b.parameters = b.parameters.filter((p) => p.path !== "/composition/negativeSpaceRatio");
    const out = run(ctx, b);
    const seed = out.seeded.find((s) => s.path === "/composition/negativeSpaceRatio");
    expect(seed).toBeDefined();
    const target = packFor(ctx).designTarget("scene.composition.negativeSpaceRatio");
    expect(seed!.value).toBe(target!.target);
    expect(seed!.decision_id).toBe(target!.decision_id);
    expect(out.pipeline?.status).toBe("SUCCESS");
    if (out.pipeline?.status === "SUCCESS") expect(out.pipeline.rawIR.composition.negativeSpaceRatio.value).toBe(target!.target);
  });

  it("never overwrites what the brief states: the grammar judges it", () => {
    const out = run(GOLDEN_CONTEXTS["MC-S01"], brief("MC-S01"));
    expect(out.seeded.find((s) => s.path === "/composition/negativeSpaceRatio")).toBeUndefined();
  });

  it("fails closed before any compilation when the sheet is tampered with", () => {
    const ctx = GOLDEN_CONTEXTS["MC-S01"];
    const tampered = JSON.parse(JSON.stringify(loadSheetJson(ctx)));
    const band = tampered.constraints.find((c: { kind: string; payload: { semantics?: string } }) => c.kind === "PARAMETER_BAND" && c.payload.semantics === "PERIOD_BAND");
    band.payload.max = 0.99;
    expect(() => run(ctx, brief("MC-S01"), tampered)).toThrow(SheetRejectedError);
  });

  it("a ledger edited after sealing, or applied to another sheet, is rejected", () => {
    const out = run(GOLDEN_CONTEXTS["MC-T01"], brief("MC-T01"));
    const ledger = out.ledger!;
    const forged = { ...ledger, patches: ledger.patches.map((p, i) => (i === 0 ? { ...p, rule_id: "ANTI-AI-99" } : p)) };
    expect(() => verifyLedger(forged, out.pack)).toThrow(LedgerIntegrityError);
    const other = packFor(GOLDEN_CONTEXTS["MC-M01"]);
    expect(() => verifyLedger(ledger, other)).toThrow(LedgerIntegrityError);
  });
});
