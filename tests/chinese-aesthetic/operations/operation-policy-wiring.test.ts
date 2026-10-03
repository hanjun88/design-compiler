/**
 * The design operators take every aesthetic number from the OPERATION_POLICY decisions of the
 * AestheticConstraintSheet (through the DecisionPack). These tests prove the wiring from three sides:
 *
 *  1. manifest = reality: the keys the operators read at runtime are exactly the keys declared in
 *     skill-bridge/requirements/operations.ts (an undeclared read is a bug, a declared key nobody
 *     reads is noise);
 *  2. every declared key matters: changing a decision in the sheet changes what the operator does
 *     (no key is dead, no number of the same meaning is hard-coded next to it);
 *  3. fail closed: no pack, a pack of another period, a missing decision or a missing key never
 *     degrades into a local default.
 */
import {
  NoDecisionPackError,
  requireDecisionPack,
  setDefaultDecisionPackProvider,
  withDecisionPack,
} from "../../../skill-bridge/active-pack";
import { DecisionContextMismatchError, MissingDecisionError, type DecisionPack } from "../../../skill-bridge/decision-pack";
import { SheetRejectedError } from "../../../skill-bridge/errors";
import { REQUIRED_DECISIONS } from "../../../skill-bridge/requirements";
import { OPERATION_REQUIREMENTS } from "../../../skill-bridge/requirements/operations";
import type { AestheticConstraintSheet } from "../../../contracts/aesthetic-constraint-sheet/aesthetic-constraint-sheet.types";
import { DEFAULT_CONTEXT_BY_PERIOD, GOLDEN_CONTEXTS, defaultPackFor, loadSheetJson, type TestContext } from "../../support/skill-packs";
import extraContexts from "../../support/contexts.operations.json";
import {
  DESIGN_OPERATIONS,
  OPERATION_CATEGORIES,
  applyAllOperations,
  type AestheticPeriod,
  type DesignOperationId,
} from "../../../chinese-aesthetic/operations";
import { NEGATIVE_SPACE, PERIODS, makeCtx, makeTestGraph, makeTestIR } from "./helpers/operation-fixtures";
import { freshPack, policyConstraint } from "./helpers/fresh-pack";
import { makeProbes } from "./helpers/probes";

const OP_IDS = Object.keys(DESIGN_OPERATIONS) as DesignOperationId[];
const isOperator = (subject: string | undefined): subject is DesignOperationId => !!subject && subject.startsWith("OP_");
const OPERATOR_REQUIREMENTS = OPERATION_REQUIREMENTS.filter((r) => isOperator(r.subject));
const PROBES = makeProbes();
const SLOW_MS = 60_000; // each case builds and validates sheets and sweeps hundreds of probes

/** Every probe through one operator (or the whole chain) under `pack`, as comparable text. */
function sweep(pack: DecisionPack, period: AestheticPeriod, only?: DesignOperationId): string[] {
  return withDecisionPack(pack, () =>
    PROBES.map(({ ir, graph }) =>
      JSON.stringify(only ? DESIGN_OPERATIONS[only](makeCtx(ir, graph, period)) : applyAllOperations(makeCtx(ir, graph, period))),
    ),
  );
}

describe("manifest = what the operators actually read", () => {
  test("the operator manifest declares one OPERATION_POLICY per operator (and the SOLID_VOID interpretation)", () => {
    expect(OPERATOR_REQUIREMENTS.map((r) => r.subject).sort()).toEqual([...OP_IDS].sort());
    for (const r of OPERATION_REQUIREMENTS) expect(r.kind).toBe("OPERATION_POLICY");
    expect(OPERATION_REQUIREMENTS.some((r) => r.subject === "GRAPH_SOLID_VOID")).toBe(true);
    expect(REQUIRED_DECISIONS).toEqual(expect.arrayContaining([...OPERATION_REQUIREMENTS]));
  });

  test("every key an operator reads is declared, and every declared key is read", () => {
    const read = new Set<string>();
    for (const period of PERIODS) {
      const pack = freshPack(DEFAULT_CONTEXT_BY_PERIOD[period]);
      sweep(pack, period);
      for (const id of OP_IDS) sweep(pack, period, id);
      for (const u of pack.usage()) if (u.kind === "OPERATION_POLICY" && isOperator(u.subject)) read.add(`${u.subject}.${u.key}`);
    }
    const declared = new Set(
      OPERATOR_REQUIREMENTS.flatMap((r) => [...(r.params ?? []), ...(r.flags ?? []), ...(r.enums ?? []), ...(r.vectors ?? [])].map((k) => `${r.subject}.${k}`)),
    );
    expect([...read].sort()).toEqual([...declared].sort());
  }, SLOW_MS);

  test("a sheet without the policy of an operator is rejected when the pack is built", () => {
    for (const id of OP_IDS) {
      const without = (s: AestheticConstraintSheet) => { s.constraints = s.constraints.filter((c) => !(c.kind === "OPERATION_POLICY" && c.payload.subject === id)); };
      expect(() => freshPack(DEFAULT_CONTEXT_BY_PERIOD.TANG, without)).toThrow(SheetRejectedError);
      expect(() => freshPack(DEFAULT_CONTEXT_BY_PERIOD.TANG, without)).toThrow(new RegExp(`OPERATION_POLICY ${id}`));
    }
  });

  test("a sheet that lacks any declared key of an operator policy is rejected", () => {
    for (const r of OPERATOR_REQUIREMENTS) {
      for (const key of [...(r.params ?? [])]) {
        const dropKey = (s: AestheticConstraintSheet) => { delete policyConstraint(s, r.subject!).payload.params[key]; };
        expect(() => freshPack(DEFAULT_CONTEXT_BY_PERIOD.SONG, dropKey)).toThrow(new RegExp(`${r.subject}.params.${key}`));
      }
      for (const key of r.flags ?? []) {
        const dropFlag = (s: AestheticConstraintSheet) => { delete policyConstraint(s, r.subject!).payload.flags![key]; };
        expect(() => freshPack(DEFAULT_CONTEXT_BY_PERIOD.SONG, dropFlag)).toThrow(new RegExp(`${r.subject}.flags.${key}`));
      }
    }
  });
});

describe("every declared key changes what its operator does", () => {
  /** The value a key is moved to: a collapsed clamp (min <-> max), a flipped flag, or a 1.5x number. */
  function perturb(subject: string, kind: "params" | "flags", key: string, s: AestheticConstraintSheet): void {
    const payload = policyConstraint(s, subject).payload;
    if (kind === "flags") { payload.flags![key] = !payload.flags![key]; return; }
    const params = payload.params;
    const partner = key.endsWith("_max") ? key.replace(/_max$/, "_min") : key.endsWith("_min") ? key.replace(/_min$/, "_max") : undefined;
    params[key] = partner && partner in params ? params[partner] : params[key] === 0 ? 1 : params[key] * 1.5;
  }

  const period: AestheticPeriod = "TANG"; // the period in which every operator (also the period-gated one) is active
  const ctx = DEFAULT_CONTEXT_BY_PERIOD[period];
  const baseline = new Map<DesignOperationId, string[]>();
  const base = (id: DesignOperationId) => { if (!baseline.has(id)) baseline.set(id, sweep(freshPack(ctx), period, id)); return baseline.get(id)!; };

  const cases = OPERATOR_REQUIREMENTS.flatMap((r) => [
    ...(r.params ?? []).map((key) => ({ subject: r.subject as DesignOperationId, kind: "params" as const, key })),
    ...(r.flags ?? []).map((key) => ({ subject: r.subject as DesignOperationId, kind: "flags" as const, key })),
  ]);

  test("the manifest has keys to check", () => {
    expect(cases.length).toBeGreaterThan(OP_IDS.length);
  });

  test.each(cases)("$subject / $key", ({ subject, kind, key }) => {
    const changed = sweep(freshPack(ctx, (s) => perturb(subject, kind, key, s)), period, subject);
    expect(changed).not.toEqual(base(subject));
  }, SLOW_MS);

  test("changing one operator's policy leaves every other operator untouched", () => {
    const target: DesignOperationId = "OP_APPLY_TIME_PATINA";
    const pack = freshPack(ctx, (s) => { policyConstraint(s, target).payload.params.patina_gain *= 2; });
    for (const id of OP_IDS.filter((x) => x !== target)) expect(sweep(pack, period, id)).toEqual(base(id));
  }, SLOW_MS);
});

describe("the sheet decides per period, the code never branches on a period name", () => {
  test("period tables resolve to the period's own decision", () => {
    for (const period of PERIODS) {
      const pack = defaultPackFor(period);
      const layers = pack.policy("OPERATION_POLICY", "OP_LAYER_DEPTH_RECESSION").num("target_layers");
      const ir = makeTestIR(period);
      ir.composition.depthLayerCount.value = 0;
      expect(DESIGN_OPERATIONS.OP_LAYER_DEPTH_RECESSION(makeCtx(ir, makeTestGraph(period), period)).ir.composition.depthLayerCount.value).toBe(layers);
    }
  });

  test("a retuned sheet retunes the operator: the period target is read, not remembered", () => {
    const period: AestheticPeriod = "MING";
    const pack = freshPack(DEFAULT_CONTEXT_BY_PERIOD[period], (s) => { policyConstraint(s, "OP_LAYER_DEPTH_RECESSION").payload.params.target_layers = 9; });
    const ir = makeTestIR(period);
    ir.composition.depthLayerCount.value = 0;
    const out = withDecisionPack(pack, () => DESIGN_OPERATIONS.OP_LAYER_DEPTH_RECESSION(makeCtx(ir, makeTestGraph(period), period)));
    expect(out.ir.composition.depthLayerCount.value).toBe(9);
  });

  test("the period gate of the axial calibration is a sheet flag: enabling it enables another period", () => {
    const period = PERIODS.find((p) => !defaultPackFor(p).policy("OPERATION_POLICY", "OP_CALIBRATE_AXIAL_ORDER").flag("applies_to_period"))!;
    const pack = freshPack(DEFAULT_CONTEXT_BY_PERIOD[period], (s) => { policyConstraint(s, "OP_CALIBRATE_AXIAL_ORDER").payload.flags!.applies_to_period = true; });
    const ir = makeTestIR(period);
    ir.composition.symmetry.value = 0;
    const out = withDecisionPack(pack, () => DESIGN_OPERATIONS.OP_CALIBRATE_AXIAL_ORDER(makeCtx(ir, makeTestGraph(period), period)));
    expect(out.trace.applied).toBe(true);
    expect(out.ir.composition.symmetry.value).toBe(pack.policy("OPERATION_POLICY", "OP_CALIBRATE_AXIAL_ORDER").num("axial_symmetry_target"));
  });
});

describe("what the skill emits for the operators", () => {
  const contexts: TestContext[] = [...Object.values(GOLDEN_CONTEXTS), ...(extraContexts as TestContext[])];
  const NS_OPS = new Set<string>(["OP_ENCLOSE_BREATHING_FIELD", "OP_FRAME_SECONDARY_OCCLUSION"]);
  const NS_KEYS = new Set(["negative_space_min", "negative_space_max"]);

  test("the role of every operator policy is the category of the operator", () => {
    for (const ctx of contexts) {
      const sheet = loadSheetJson(ctx);
      for (const id of OP_IDS) {
        expect(policyConstraint(sheet, id).role).toBe(OPERATION_CATEGORIES[id]);
      }
    }
  });

  test("operator policies depend on the period only; negative-space bounds additionally on the band of the context", () => {
    const decisions = (ctx: TestContext) => {
      const sheet = loadSheetJson(ctx);
      return Object.fromEntries(OP_IDS.map((id) => {
        const { params, flags } = policyConstraint(sheet, id).payload;
        const kept = Object.fromEntries(Object.entries(params).filter(([k]) => !(NS_OPS.has(id) && NS_KEYS.has(k))));
        return [id, { params: kept, flags }];
      }));
    };
    for (const period of PERIODS) {
      const ofPeriod = contexts.filter((c) => c.period === period);
      expect(ofPeriod.length).toBeGreaterThan(0);
      for (const c of ofPeriod) expect(decisions(c)).toEqual(decisions(ofPeriod[0]));
    }
  });

  test("the SOLID_VOID interpretation is one global decision (the deriver reads it without a period)", () => {
    const params = (ctx: TestContext) => policyConstraint(loadSheetJson(ctx), "GRAPH_SOLID_VOID").payload.params;
    for (const ctx of contexts) expect(params(ctx)).toEqual(params(contexts[0]));
  });

  test("every operator decision carries provenance, a confidence and a rationale", () => {
    for (const id of OP_IDS) {
      const c = policyConstraint(loadSheetJson(DEFAULT_CONTEXT_BY_PERIOD.SONG), id);
      expect(c.provenance.sources.length).toBeGreaterThan(0);
      expect(c.confidence).toBeGreaterThan(0);
      expect(c.confidence).toBeLessThanOrEqual(1);
      expect(c.payload.rationale.length).toBeGreaterThan(0);
    }
  });

  test("the negative-space bounds of the two operators record their derivation from the band decisions", () => {
    for (const ctx of contexts) {
      const sheet = loadSheetJson(ctx);
      for (const id of NS_OPS) {
        const derivation = policyConstraint(sheet, id).provenance.derivation;
        expect(derivation).toBeDefined();
        expect(derivation!.formula).toContain(NEGATIVE_SPACE);
        expect(derivation!.inputs.length).toBeGreaterThan(0);
        for (const input of derivation!.inputs) expect(sheet.constraints.some((c) => c.decision_id === input && c.kind === "PARAMETER_BAND")).toBe(true);
      }
    }
  });
});

describe("fail closed: no silent default, no fallback", () => {
  const ir = () => makeTestIR("SONG");
  const graph = () => makeTestGraph("SONG");

  test("an operator outside any pack scope and without a process-wide provider refuses to run", () => {
    // pack-setup installs the default provider for the whole test environment; restore an equivalent one afterwards
    setDefaultDecisionPackProvider(null);
    try {
      for (const id of OP_IDS) expect(() => DESIGN_OPERATIONS[id](makeCtx(ir(), graph(), "SONG"))).toThrow(NoDecisionPackError);
    } finally {
      setDefaultDecisionPackProvider((period) => (period === undefined ? defaultPackFor("SONG") : (PERIODS as readonly string[]).includes(period) ? defaultPackFor(period as AestheticPeriod) : undefined));
    }
    expect(() => requireDecisionPack("SONG")).not.toThrow();
  });

  test("a pack of another period is a context mismatch, never a fallback", () => {
    const tang = defaultPackFor("TANG");
    for (const id of OP_IDS) {
      expect(() => withDecisionPack(tang, () => DESIGN_OPERATIONS[id](makeCtx(ir(), graph(), "SONG")))).toThrow(DecisionContextMismatchError);
    }
  });

  test("a pack without the operator's policy throws MissingDecisionError", () => {
    for (const id of OP_IDS) {
      const bare = freshPack(DEFAULT_CONTEXT_BY_PERIOD.SONG, (s) => { s.constraints = s.constraints.filter((c) => !(c.kind === "OPERATION_POLICY" && c.payload.subject === id)); }, []);
      expect(() => withDecisionPack(bare, () => DESIGN_OPERATIONS[id](makeCtx(ir(), graph(), "SONG")))).toThrow(MissingDecisionError);
    }
  });

  test("a pack whose policy lacks a key throws MissingDecisionError for the operator that needs it", () => {
    const id: DesignOperationId = "OP_FRAME_SECONDARY_OCCLUSION";
    const bare = freshPack(DEFAULT_CONTEXT_BY_PERIOD.SONG, (s) => { delete policyConstraint(s, id).payload.params.framing_gain; }, []);
    expect(() => withDecisionPack(bare, () => DESIGN_OPERATIONS[id](makeCtx(ir(), graph(), "SONG")))).toThrow(MissingDecisionError);
  });
});
