/**
 * ADR-0001 (留白 / negative space) — the bounds of the two operators that write
 * /composition/negativeSpaceRatio are the EFFECTIVE BAND of the design context
 * (period band ∩ hard floor ∩ physical range, derived by the skill), never a number of the compiler.
 *
 * Before the closure both operators clamped to a fixed [0.05, 0.7] in every period. Now the bounds
 * come from the sheet and follow the period (and the hard floor of bright-tone landscape), and a
 * raising operator never lowers the ratio while a lowering operator never raises it.
 *
 * Expectations are derived from the packs of the real skill sheets; no band number is written here.
 */
import { withDecisionPack } from "../../../skill-bridge/active-pack";
import type { DecisionPack } from "../../../skill-bridge/decision-pack";
import { DEFAULT_CONTEXT_BY_PERIOD, packFor, type TestContext } from "../../support/skill-packs";
import extraContexts from "../../support/contexts.operations.json";
import {
  applyAllOperations,
  clamp,
  opEncloseBreathingField,
  opFrameSecondaryOcclusion,
  type AestheticPeriod,
  type DesignOperation,
} from "../../../chinese-aesthetic/operations";
import { NEGATIVE_SPACE, PERIODS, makeCtx, makeTestGraph, makeTestIR, relationOf } from "./helpers/operation-fixtures";

const ENCLOSE = "OP_ENCLOSE_BREATHING_FIELD";
const FRAME = "OP_FRAME_SECONDARY_OCCLUSION";

/** Bright-tone landscape: the only context family in which a HARD_FLOOR narrows the band (ADR-0001 rule 3). */
const HARD_FLOOR_CONTEXT = extraContexts[0] as TestContext;
const CONTEXTS: Array<{ name: string; ctx: TestContext }> = [
  ...PERIODS.map((period) => ({ name: `${period} default`, ctx: DEFAULT_CONTEXT_BY_PERIOD[period] })),
  { name: "bright landscape (hard floor)", ctx: HARD_FLOOR_CONTEXT },
];

const bandOf = (pack: DecisionPack) => {
  const b = pack.effectiveBand(NEGATIVE_SPACE);
  if (!b) throw new Error("no effective negative-space band");
  return b;
};

/** Runs an operator under the pack of `ctx` with an IR whose negative space is `ratio`. */
function run(op: DesignOperation, pack: DecisionPack, period: AestheticPeriod, ratio: number): number {
  const ir = makeTestIR(period);
  ir.composition.negativeSpaceRatio.value = ratio;
  const graph = makeTestGraph(period); // SOLID_VOID and OPEN_CLOSE below their thresholds: both operators are active
  const result = withDecisionPack(pack, () => op(makeCtx(ir, graph, period)));
  expect(result.trace.applied).toBe(true);
  return result.ir.composition.negativeSpaceRatio.value;
}

const SWEEP = Array.from({ length: 41 }, (_, i) => i / 40); // structural sweep of the whole [0, 1] share
const TOL = 1e-4; // the framing operator rounds the value it writes to 4 decimals

describe("ADR-0001: negative-space bounds of the design operators", () => {
  test.each(CONTEXTS)("$name: both operators are bounded by the effective band of the context", ({ ctx }) => {
    const pack = packFor(ctx);
    const band = bandOf(pack);
    for (const op of [ENCLOSE, FRAME]) {
      const policy = pack.policy("OPERATION_POLICY", op);
      expect(policy.num("negative_space_min")).toBe(band.min);
      expect(policy.num("negative_space_max")).toBe(band.max);
    }
  });

  test.each(CONTEXTS)("$name: the band is the intersection of the hard bands (period, hard floor, physical range)", ({ ctx }) => {
    const pack = packFor(ctx);
    const hard = pack.bands(NEGATIVE_SPACE).filter((b) => ["PERIOD_BAND", "HARD_FLOOR", "PHYSICAL_RANGE"].includes(b.semantics));
    expect(hard.length).toBeGreaterThan(1);
    const policy = pack.policy("OPERATION_POLICY", ENCLOSE);
    expect(policy.num("negative_space_min")).toBe(Math.max(...hard.map((b) => b.min)));
    expect(policy.num("negative_space_max")).toBe(Math.min(...hard.map((b) => b.max)));
  });

  test("the bounds follow the period and the hard floor instead of one global clamp", () => {
    const period = (p: AestheticPeriod) => packFor(DEFAULT_CONTEXT_BY_PERIOD[p]);
    for (const p of PERIODS) {
      const periodBand = period(p).periodBand(NEGATIVE_SPACE)!;
      const policy = period(p).policy("OPERATION_POLICY", ENCLOSE);
      expect(policy.num("negative_space_min")).toBe(periodBand.min);
      expect(policy.num("negative_space_max")).toBe(periodBand.max);
    }
    const songBand = bandOf(period("SONG"));
    const floorBand = bandOf(packFor(HARD_FLOOR_CONTEXT));
    expect(floorBand.min).toBeGreaterThan(songBand.min); // the hard floor narrows the same period's band from below
    expect(floorBand.max).toBe(songBand.max);
  });

  describe.each(CONTEXTS)("$name", ({ ctx }) => {
    const pack = packFor(ctx);
    const band = bandOf(pack);
    const period = ctx.period;

    test("OP_ENCLOSE_BREATHING_FIELD never lowers the ratio and never pushes it above the band", () => {
      for (const current of SWEEP) {
        const out = run(opEncloseBreathingField, pack, period, current);
        expect(out).toBeGreaterThanOrEqual(current); // a raising operator never lowers
        expect(out).toBeLessThanOrEqual(Math.max(current, band.max)); // never pushed above the band (an input already above stays)
        expect(out).toBeGreaterThanOrEqual(band.min); // lands inside the band, or at least on its floor
      }
    });

    test("OP_FRAME_SECONDARY_OCCLUSION never raises the ratio and never pushes it below the band", () => {
      for (const current of SWEEP) {
        const out = run(opFrameSecondaryOcclusion, pack, period, current);
        expect(out).toBeLessThanOrEqual(current + TOL); // a lowering operator never raises
        expect(out).toBeGreaterThanOrEqual(Math.min(current, band.min) - TOL); // never pushed below the band (an input already below stays)
        expect(out).toBeLessThanOrEqual(band.max + TOL);
      }
    });

    test("inputs inside the band stay inside it", () => {
      for (const current of SWEEP.filter((v) => v >= band.min && v <= band.max)) {
        for (const op of [opEncloseBreathingField, opFrameSecondaryOcclusion]) {
          const out = run(op, pack, period, current);
          expect(out).toBeGreaterThanOrEqual(band.min - TOL);
          expect(out).toBeLessThanOrEqual(band.max + TOL);
        }
      }
    });

    test("the edges bind: a raise from just under the ceiling lands on it, a lowering from just over the floor lands on it", () => {
      const nearCeiling = band.max - TOL;
      expect(run(opEncloseBreathingField, pack, period, nearCeiling)).toBe(band.max);
      const nearFloor = band.min + TOL;
      expect(run(opFrameSecondaryOcclusion, pack, period, nearFloor)).toBeCloseTo(band.min, 4);
    });

    test("out-of-band inputs are pulled toward the band only in the operator's own direction", () => {
      const delta = (op: string) => {
        const g = makeTestGraph(period);
        const magnitude = relationOf(g, op === ENCLOSE ? "SOLID_VOID" : "OPEN_CLOSE").magnitude;
        return (1 - magnitude) * pack.policy("OPERATION_POLICY", op).num(op === ENCLOSE ? "enclosure_gain" : "framing_gain");
      };
      // far below the band: enclosing raises (to the floor at least), framing leaves it
      const farBelow = band.min / 4;
      expect(run(opEncloseBreathingField, pack, period, farBelow)).toBe(clamp(farBelow + delta(ENCLOSE), band.min, band.max));
      expect(run(opFrameSecondaryOcclusion, pack, period, farBelow)).toBeCloseTo(farBelow, 4);
      // far above the band: framing lowers (to the ceiling at most), enclosing leaves it
      const farAbove = band.max + (1 - band.max) / 2;
      expect(run(opEncloseBreathingField, pack, period, farAbove)).toBe(farAbove);
      expect(run(opFrameSecondaryOcclusion, pack, period, farAbove)).toBeLessThan(farAbove);
    });

    test("the whole chain keeps an in-band ratio in band", () => {
      const ir = makeTestIR(period);
      const graph = makeTestGraph(period);
      const result = withDecisionPack(pack, () => applyAllOperations(makeCtx(ir, graph, period)));
      const out = result.ir.composition.negativeSpaceRatio.value;
      expect(out).toBeGreaterThanOrEqual(band.min - TOL);
      expect(out).toBeLessThanOrEqual(band.max + TOL);
    });
  });
});
