/**
 * 3.4-C: the period prior bands really constrain the plan.
 *
 * The emitter used to look the operator's target value up under the LAST SEGMENT of its parameter path
 * ("negativeSpaceRatio") while every derived value lives under a `target…` key ("targetNegativeSpace"), so the
 * period clamp never fired and every provenance record claimed `to: 0`. These tests pin the repaired behaviour on
 * sheets emitted by the real skill generator; every expectation is read from the DecisionPack, none is a literal.
 */
import { compileAestheticExecutionPlan, primaryTargetKey } from "../../../chinese-aesthetic/compiler";
import type { AestheticIntentExtension, AestheticPrinciple } from "../../../chinese-aesthetic/intent/types";
import type { AestheticNodeType, AestheticRelationType, AestheticRelationshipGraph } from "../../../chinese-aesthetic/graph/types";
import type { AestheticPeriod } from "../../../chinese-aesthetic/operations/types";
import { defaultPackFor } from "../../support/skill-packs";

const PERIODS: AestheticPeriod[] = ["TANG", "SONG", "MING"];
const NODE_TYPES: AestheticNodeType[] = ["VOID", "SUBJECT", "BOUNDARY", "LIGHT", "MATERIAL"];
const RELATION_TYPES: AestheticRelationType[] = ["SOLID_VOID", "HOST_GUEST", "DENSE_SPARSE", "CENTER_EDGE", "NEAR_FAR", "HIGH_LOW", "HEAVY_LIGHT", "MOVE_STILL"];
const PRINCIPLES: AestheticPrinciple[] = [
  "COUNT_WHITE_AS_BLACK", "VOID_SOLID_INTERPLAY", "GUEST_HOST_COMITY", "POSITION_MANAGEMENT",
  "SCALE_PROPORTION", "MATERIAL_PATINA", "LIGHT_TEMPORALITY", "QI_YUN_CONTINUITY",
];

/** A graph whose every node energy and relation magnitude is `level` (evidence input, not an aesthetic judgement). */
function graphAt(level: number): AestheticRelationshipGraph {
  return {
    graphId: `g:clamp:${level}`,
    evidenceId: `e:clamp:${level}`,
    generatedAt: "2026-09-16T00:00:00Z",
    graphHash: "fnv1a:clamp",
    nodes: NODE_TYPES.map((type) => ({ id: `node:${type.toLowerCase()}`, type, boundingRegion: null, energy: level, evidenceRefs: ["fixture"], confidence: 0.9 })),
    relations: RELATION_TYPES.map((relationType) => ({ sourceId: "node:a", targetId: "node:b", relationType, magnitude: level, polarity: "MUTUAL" as const, derivedFrom: ["fixture"], confidence: 0.9 })),
    unmeasuredRelations: [],
    derivationPipeline: [],
    topologyAudit: { status: "PASS", noIsolatedNodes: true, polarAlignment: true, boundedEnergy: true, purityPenetration: true, violations: [] },
  };
}

function intent(period: AestheticPeriod): AestheticIntentExtension {
  return {
    system: "chinese-aesthetic@1.0.0",
    period,
    principles: PRINCIPLES,
    activeRelationships: RELATION_TYPES.map((relationType, i) => ({ relationType, sourceId: `node:s${i}`, targetId: `node:t${i}`, magnitude: 0.5 })),
    appliedOperations: [],
    antiPatternConformance: { gateReportRef: "fnv1a:gate", allAllowed: true },
    provenance: { evidenceHash: "sha256:ev", graphHash: "fnv1a:clamp", intentHash: "fnv1a:intent" },
  };
}

const compile = (period: AestheticPeriod, level: number) => compileAestheticExecutionPlan({ intent: intent(period), graph: graphAt(level), compiledAt: "2026-09-16T00:00:00Z" });

describe.each(PERIODS)("%s plan under the period prior bands", (period) => {
  const pack = defaultPackFor(period);
  const levels = [0, 0.5, 1];

  it.each(levels)("graph level %p: every operator target with a PERIOD_BAND lies inside it", (level) => {
    const out = compile(period, level);
    expect(out.success).toBe(true);
    const ops = out.plan!.operations;
    expect(ops.length).toBeGreaterThan(0);
    for (const op of ops) {
      const band = pack.periodBand(op.target);
      const key = primaryTargetKey(op.parameters);
      expect(key).toBeDefined();
      const value = op.parameters[key!];
      if (band && typeof value === "number") {
        expect(value).toBeGreaterThanOrEqual(band.min);
        expect(value).toBeLessThanOrEqual(band.max);
      }
    }
  });

  it.each(levels)("graph level %p: provenance records the value the plan really proposes (never a placeholder zero)", (level) => {
    const out = compile(period, level);
    for (const op of out.plan!.operations) {
      const key = primaryTargetKey(op.parameters)!;
      expect(op.provenance.parameterMutation[0].to).toEqual(op.parameters[key]);
      expect(op.provenance.parameterMutation[0].target).toBe(op.target);
    }
  });

  it("an extreme graph is clamped, and every clamp is declared on the operation, in the plan and in the stats", () => {
    const clamped = levels.flatMap((level) => compile(period, level).plan!.operations.filter((op) => op.periodConstraintApplied));
    for (const op of clamped) {
      const band = pack.periodBand(op.target)!;
      expect(band).toBeDefined();
      expect(op.periodConstraintApplied).toContain(band.rationale);
    }
    for (const level of levels) {
      const plan = compile(period, level).plan!;
      const declared = plan.operations.filter((op) => op.periodConstraintApplied).length;
      expect(plan.periodConstraintsApplied).toHaveLength(declared);
      expect(plan.stats.periodConstraintsApplied).toBe(declared);
    }
  });

  it("a target the sheet does not band is never clamped", () => {
    for (const level of levels) {
      for (const op of compile(period, level).plan!.operations) {
        if (!pack.periodBand(op.target)) expect(op.periodConstraintApplied).toBeUndefined();
      }
    }
  });

  it("the plan stays deterministic", () => {
    expect(compile(period, 0.5).plan!.planDigest).toBe(compile(period, 0.5).plan!.planDigest);
  });
});

it("at least one period constrains at least one derived target on the extreme graphs (the clamp is live, not decorative)", () => {
  const total = PERIODS.flatMap((p) => [0, 1].flatMap((level) => compile(p, level).plan!.operations.filter((op) => op.periodConstraintApplied))).length;
  expect(total).toBeGreaterThan(0);
});
