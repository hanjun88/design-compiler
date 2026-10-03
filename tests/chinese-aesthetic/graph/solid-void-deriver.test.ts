/**
 * Solid-Void deriver — the interpretation parameters of the SOLID_VOID relation (peak and spread of
 * the negative-space fit, component limit and integrity weight of the void integrity) are the
 * OPERATION_POLICY GRAPH_SOLID_VOID decision of the AestheticConstraintSheet. The deriver reads them
 * through the DecisionPack; this file checks the relation's shape from the pack's own numbers and
 * proves that changing the decision changes the relation.
 */
import { deriveSolidVoid } from "../../../chinese-aesthetic/graph/derivers/solid-void";
import type { ObservableEvidenceSet } from "../../../chinese-aesthetic/extraction/types";
import type { AestheticNode } from "../../../chinese-aesthetic/graph/types";
import { NoDecisionPackError, setDefaultDecisionPackProvider, withDecisionPack } from "../../../skill-bridge/active-pack";
import { MissingDecisionError } from "../../../skill-bridge/decision-pack";
import { SheetRejectedError } from "../../../skill-bridge/errors";
import { OPERATION_REQUIREMENTS } from "../../../skill-bridge/requirements/operations";
import { DEFAULT_CONTEXT_BY_PERIOD, defaultPackFor } from "../../support/skill-packs";
import { freshPack, policyConstraint } from "../operations/helpers/fresh-pack";

const SUBJECT = "GRAPH_SOLID_VOID";
const KEYS = ["optimal_ratio", "ratio_spread", "component_limit", "integrity_weight"] as const;
type Key = (typeof KEYS)[number];

const node = (id: string, confidence: number): AestheticNode => ({ id, type: "SUBJECT", boundingRegion: null, energy: 0.5, evidenceRefs: ["e"], confidence });
const solid = node("node:subject:primary", 0.9);
const emptiness = node("node:void:negative-space", 0.7);

const evidence = (negRatio: number, components: number, largestVoid: number): ObservableEvidenceSet => {
  const field = (value: number, evidenceRef: string) => ({ value, confidence: 0.8, evidenceRef });
  return {
    pixel: {
      negativeSpaceRatio: field(negRatio, "pixel:negativeSpaceRatio"),
      negativeSpaceComponentCount: field(components, "pixel:negativeSpaceComponentCount"),
      largestVoidRegionRatio: field(largestVoid, "pixel:largestVoidRegionRatio"),
    },
  } as unknown as ObservableEvidenceSet;
};

const params = (pack = defaultPackFor("SONG")): Record<Key, number> =>
  Object.fromEntries(KEYS.map((k) => [k, pack.policy("OPERATION_POLICY", SUBJECT).num(k)])) as Record<Key, number>;

/** The relation magnitude by definition, from the decision's own numbers (rounded like the deriver does). */
function modelMagnitude(k: Record<Key, number>, negRatio: number, components: number, largestVoid: number): number {
  const ratioFit = Math.max(0, 1 - Math.abs(negRatio - k.optimal_ratio) / k.ratio_spread);
  const integrity = largestVoid * Math.max(0, 1 - components / k.component_limit);
  return Math.round(Math.min(1, ratioFit * ((1 - k.integrity_weight) + integrity * k.integrity_weight)) * 10000) / 10000;
}

const magnitude = (negRatio: number, components: number, largestVoid: number) =>
  deriveSolidVoid(evidence(negRatio, components, largestVoid), solid, emptiness).magnitude;

describe("deriveSolidVoid reads GRAPH_SOLID_VOID from the DecisionPack", () => {
  test("relation envelope: SOLID_VOID, mutual, provenance and min-confidence propagation", () => {
    const r = deriveSolidVoid(evidence(params().optimal_ratio, 1, 0.5), solid, emptiness);
    expect(r.relationType).toBe("SOLID_VOID");
    expect(r.polarity).toBe("MUTUAL");
    expect(r.sourceId).toBe(solid.id);
    expect(r.targetId).toBe(emptiness.id);
    expect(r.derivedFrom[0]).toBe("deriver:solid-void");
    expect(r.derivedFrom).toEqual(expect.arrayContaining(["pixel:negativeSpaceRatio", "pixel:negativeSpaceComponentCount", "pixel:largestVoidRegionRatio"]));
    expect(r.confidence).toBe(emptiness.confidence); // the weakest of the nodes and the evidence fields
  });

  test("the fit peaks at the optimal ratio: a whole, single void at the optimum interlocks fully", () => {
    const k = params();
    expect(magnitude(k.optimal_ratio, 0, 1)).toBeCloseTo(1, 4);
  });

  test("the fit is triangular: zero at optimal ± spread, linear in between", () => {
    const k = params();
    expect(magnitude(k.optimal_ratio + k.ratio_spread, 0, 1)).toBe(0);
    expect(magnitude(k.optimal_ratio - k.ratio_spread, 0, 1)).toBe(0);
    expect(magnitude(k.optimal_ratio + 2 * k.ratio_spread, 0, 1)).toBe(0);
    const half = magnitude(k.optimal_ratio + k.ratio_spread / 2, 0, 1);
    expect(half).toBeCloseTo(magnitude(k.optimal_ratio, 0, 1) / 2, 4);
    expect(magnitude(k.optimal_ratio - k.ratio_spread / 2, 0, 1)).toBeCloseTo(half, 4); // symmetric around the optimum
  });

  test("a void split into the component limit (or more) pieces has no integrity left: only the base weight remains", () => {
    const k = params();
    const base = 1 - k.integrity_weight;
    expect(magnitude(k.optimal_ratio, k.component_limit, 1)).toBeCloseTo(base, 4);
    expect(magnitude(k.optimal_ratio, k.component_limit * 2, 1)).toBeCloseTo(base, 4);
    expect(magnitude(k.optimal_ratio, 0, 0)).toBeCloseTo(base, 4); // no void region at all
  });

  test("magnitude follows the definition over a grid of evidence", () => {
    const k = params();
    const grid = Array.from({ length: 21 }, (_, i) => i / 20);
    for (const neg of grid) for (const comps of [0, 1, 3, k.component_limit - 1, k.component_limit, k.component_limit + 5]) for (const largest of grid) {
      expect(magnitude(neg, comps, largest)).toBeCloseTo(modelMagnitude(k, neg, comps, largest), 3);
    }
  });

  test("magnitude never leaves the unit scale and never grows with the distance from the optimum", () => {
    const k = params();
    let previous = Infinity;
    for (let i = 0; i <= 40; i++) {
      const neg = k.optimal_ratio + (i / 40) * k.ratio_spread * 2;
      const m = magnitude(neg, 1, 0.8);
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThanOrEqual(1);
      expect(m).toBeLessThanOrEqual(previous + 1e-9);
      previous = m;
    }
  });

  test("it is one global decision: every period's pack carries the same interpretation", () => {
    for (const period of ["TANG", "MING"] as const) expect(params(defaultPackFor(period))).toEqual(params(defaultPackFor("SONG")));
  });
});

describe("the decision, not the code, defines the relation", () => {
  const evidences: Array<[number, number, number]> = [];
  for (const neg of [0.05, 0.2, 0.35, 0.5, 0.65, 0.8]) for (const comps of [0, 2, 6, 12]) for (const largest of [0.2, 0.6, 1]) evidences.push([neg, comps, largest]);
  const sweep = (pack = freshPack(DEFAULT_CONTEXT_BY_PERIOD.SONG)) => withDecisionPack(pack, () => evidences.map(([n, c, l]) => magnitude(n, c, l)));
  const baseline = sweep();

  test.each([...KEYS])("%s changes the relation", (key) => {
    const pack = freshPack(DEFAULT_CONTEXT_BY_PERIOD.SONG, (s) => { policyConstraint(s, SUBJECT).payload.params[key] *= 1.5; });
    expect(sweep(pack)).not.toEqual(baseline);
  });

  test("a retuned spread is followed exactly", () => {
    const k = params();
    const wide = freshPack(DEFAULT_CONTEXT_BY_PERIOD.SONG, (s) => { policyConstraint(s, SUBJECT).payload.params.ratio_spread = k.ratio_spread * 2; });
    withDecisionPack(wide, () => {
      expect(magnitude(k.optimal_ratio + k.ratio_spread, 0, 1)).toBeCloseTo(0.5, 4); // inside the doubled spread
      expect(magnitude(k.optimal_ratio + k.ratio_spread * 2, 0, 1)).toBe(0);
    });
  });

  test("the keys the deriver reads are exactly the keys the manifest declares", () => {
    const pack = freshPack(DEFAULT_CONTEXT_BY_PERIOD.TANG);
    withDecisionPack(pack, () => magnitude(0.4, 2, 0.5));
    const read = pack.usage().filter((u) => u.kind === "OPERATION_POLICY" && u.subject === SUBJECT).map((u) => u.key).sort();
    const declared = OPERATION_REQUIREMENTS.find((r) => r.subject === SUBJECT)!.params!.slice().sort();
    expect(read).toEqual(declared);
    expect(declared).toEqual([...KEYS].sort());
  });
});

describe("fail closed", () => {
  test("a sheet without GRAPH_SOLID_VOID is rejected when the pack is built; a bare pack throws when the deriver reads", () => {
    const without = (s: Parameters<typeof policyConstraint>[0]) => { s.constraints = s.constraints.filter((c) => !(c.kind === "OPERATION_POLICY" && c.payload.subject === SUBJECT)); };
    expect(() => freshPack(DEFAULT_CONTEXT_BY_PERIOD.SONG, without)).toThrow(SheetRejectedError);
    const bare = freshPack(DEFAULT_CONTEXT_BY_PERIOD.SONG, without, []);
    expect(() => withDecisionPack(bare, () => magnitude(0.4, 1, 0.5))).toThrow(MissingDecisionError);
  });

  test("without any pack the deriver refuses to run (no local default)", () => {
    setDefaultDecisionPackProvider(null);
    try {
      expect(() => magnitude(0.4, 1, 0.5)).toThrow(NoDecisionPackError);
    } finally {
      // pack-setup's provider for the test environment: SONG answers a period-less lookup
      setDefaultDecisionPackProvider((period) => (period === undefined ? defaultPackFor("SONG") : period === "TANG" || period === "SONG" || period === "MING" ? defaultPackFor(period) : undefined));
    }
    expect(() => magnitude(0.4, 1, 0.5)).not.toThrow();
  });
});
