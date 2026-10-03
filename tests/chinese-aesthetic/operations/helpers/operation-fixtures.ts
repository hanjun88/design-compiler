/**
 * Fixtures for the design-operator tests.
 *
 * Every scenario number that depends on an aesthetic decision (an activation threshold, a clamp, a
 * period target) is DERIVED from the DecisionPack of the real skill sheet: "below the threshold" is
 * `below(threshold)`, "inside the clamp" is the middle of the pack's own bounds. Nothing here copies
 * a literal of the registry, so the tests keep describing the same scenario when the skill's
 * decisions are retuned. Plain fixture data (focal point, colour temperature of a bulb ...) stays literal.
 */
import type { RawDesignIR, RawEstimatedParameter, ParameterUnit } from "../../../../compiler-core/contracts";
import type { AestheticRelationshipGraph } from "../../../../chinese-aesthetic/graph/types";
import type { AestheticPeriod, DesignOperationContext } from "../../../../chinese-aesthetic/operations";
import { defaultPackFor } from "../../../support/skill-packs";

export const PERIODS: readonly AestheticPeriod[] = ["TANG", "SONG", "MING"];
export const NEGATIVE_SPACE = "scene.composition.negativeSpaceRatio";

/** An OPERATION_POLICY decision of the default pack of `period` (the pack the operators resolve without a scope). */
export const policy = (subject: string, period: AestheticPeriod = "SONG") =>
  defaultPackFor(period).policy("OPERATION_POLICY", subject);
export const num = (subject: string, key: string, period: AestheticPeriod = "SONG"): number =>
  policy(subject, period).num(key);

/** A value strictly inside "below threshold t" for any positive threshold. */
export const below = (t: number): number => t / 2;
/** A value strictly above threshold t that stays on the unit magnitude scale. */
export const above = (t: number): number => (t + 1) / 2;
/** The middle of a closed range. */
export const mid = (lo: number, hi: number): number => (lo + hi) / 2;

export function p<T>(value: T, unit: ParameterUnit = "scalar"): RawEstimatedParameter<T> {
  return { value, unit, confidence: 0.9, evidence: ["test-evidence"], source: "vision-estimation", status: "estimated" };
}

/** The effective negative-space band of the default pack of a period (what the operators are bounded by). */
export function negativeSpaceBand(period: AestheticPeriod) {
  const band = defaultPackFor(period).effectiveBand(NEGATIVE_SPACE);
  if (!band) throw new Error(`no effective ${NEGATIVE_SPACE} band for ${period}`);
  return band;
}

/** A design IR whose every operator-relevant value sits inside the pack's own clamps. */
export function makeTestIR(period: AestheticPeriod = "SONG", overrides: Partial<RawDesignIR> = {}): RawDesignIR {
  const n = (subject: string, key: string) => num(subject, key, period);
  const ns = negativeSpaceBand(period);
  const base: RawDesignIR = {
    $schema: "test-schema",
    meta: { sourceType: "image", aspectRatio: "16:9", timestamp: "2026-09-16T00:00:00Z" },
    composition: {
      focalPoint: p([0.5, 0.5], "vector2"),
      negativeSpaceRatio: p(mid(ns.min, ns.max), "ratio"),
      depthLayerCount: p(0, "scalar"),
      symmetry: p(mid(n("OP_PARTITION_POISSON_CLUSTER", "symmetry_min"), n("OP_PARTITION_POISSON_CLUSTER", "symmetry_max")), "ratio"),
    },
    camera: {
      fov: p(50, "degrees"),
      shotSize: p("medium", "scalar"),
      angle: p(0, "degrees"),
      height: p(1.6, "ratio"),
    },
    lighting: {
      keyLight: {
        azimuth: p(45, "degrees"),
        elevation: p(30, "degrees"),
        colorTemp: p(5500, "scalar"),
        intensity: p(mid(n("OP_HARMONIZE_SKY_LUMINANCE", "intensity_min"), n("OP_HARMONIZE_SKY_LUMINANCE", "intensity_max")), "ratio"),
        softness: p(mid(n("OP_DAMPEN_SPECULAR_HARSHNESS", "softness_min"), n("OP_DAMPEN_SPECULAR_HARSHNESS", "softness_max")), "ratio"),
      },
      ambientRatio: p(mid(n("OP_INJECT_ATMOSPHERIC_VOID", "ambient_min"), n("OP_INJECT_ATMOSPHERIC_VOID", "ambient_max")), "ratio"),
      rimLightPresent: p(true, "scalar"),
    },
    materials: [
      {
        role: "dominant",
        baseType: p("WOOD::test", "scalar"),
        roughness: p(mid(n("OP_APPLY_TIME_PATINA", "roughness_min"), n("OP_APPLY_TIME_PATINA", "roughness_max")), "ratio"),
        metalness: p(0.1, "ratio"),
        wear: p(mid(n("OP_APPLY_TIME_PATINA", "wear_min"), n("OP_APPLY_TIME_PATINA", "wear_max")), "ratio"),
      },
      {
        role: "secondary",
        baseType: p("STONE::test", "scalar"),
        roughness: p(mid(n("OP_APPLY_TIME_PATINA", "roughness_min"), n("OP_APPLY_TIME_PATINA", "roughness_max")), "ratio"),
        metalness: p(0.05, "ratio"),
        wear: p(mid(n("OP_APPLY_TIME_PATINA", "wear_min"), n("OP_APPLY_TIME_PATINA", "wear_max")), "ratio"),
      },
    ],
    color: {
      dominant: p("#8B7355", "hex"),
      secondary: p("#6B5344", "hex"),
      accent: p("#C4A35A", "hex"),
      contrastRatio: p(3.5, "ratio"),
      temperatureBias: p(0, "ratio"),
    },
    provenance: {
      extractorVersion: "test",
      inferenceExecutionMs: 100,
      rawIntegrityStatus: "READY",
      hashManifest: { algorithm: "SHA-256", canonicalization: "RFC8785" },
      inputHash: "test-input",
      rawIRHash: "test-ir",
    },
  };
  return JSON.parse(JSON.stringify({ ...base, ...overrides })) as RawDesignIR;
}

/**
 * A relationship graph in which every operator driven by "a relation below a threshold" is active
 * (host/guest ratio, SOLID_VOID, DENSE_SPARSE, HIGH_LOW, OPEN_CLOSE, MATERIAL and TIME energy are all
 * below their thresholds, NEAR_FAR is unmeasured), while the operators driven by "a value at or above
 * a threshold" (HEAVY_LIGHT, LIGHT energy, BOUNDARY energy) are inactive: tests switch those on explicitly.
 */
export function makeTestGraph(period: AestheticPeriod = "SONG", overrides: Partial<AestheticRelationshipGraph> = {}): AestheticRelationshipGraph {
  const n = (subject: string, key: string) => num(subject, key, period);
  const hostEnergy = 0.8;
  const guestEnergy = hostEnergy / below(n("OP_ALIGN_GUEST_HOST_TENSION", "target_ratio")); // ratio = target / 2
  const base: AestheticRelationshipGraph = {
    graphId: "graph:test",
    evidenceId: "evidence:test",
    generatedAt: "2026-09-16T00:00:00Z",
    nodes: [
      { id: "node:subject:primary", type: "SUBJECT", boundingRegion: [0.35, 0.35, 0.3, 0.3], energy: hostEnergy, evidenceRefs: ["e1"], confidence: 0.9 },
      { id: "node:void:negative-space", type: "VOID", boundingRegion: null, energy: 0.6, evidenceRefs: ["e2"], confidence: 0.9 },
      { id: "node:space:composition", type: "SPACE", boundingRegion: [0, 0, 1, 1], energy: guestEnergy, evidenceRefs: ["e3"], confidence: 1 },
      { id: "node:light:luminance-field", type: "LIGHT", boundingRegion: null, energy: below(Math.min(n("OP_HARMONIZE_SKY_LUMINANCE", "light_energy_conflict"), n("OP_FILTER_MIST_SCATTER", "hard_light_energy_min"))), evidenceRefs: ["e4"], confidence: 1 },
      { id: "node:material:dominant", type: "MATERIAL", boundingRegion: null, energy: below(n("OP_APPLY_TIME_PATINA", "material_energy_varied")), evidenceRefs: ["e5"], confidence: 0.8 },
      { id: "node:boundary:edges", type: "BOUNDARY", boundingRegion: null, energy: below(n("OP_INJECT_ATMOSPHERIC_VOID", "boundary_energy_min")), evidenceRefs: ["e6"], confidence: 0.95 },
      { id: "node:time:patina", type: "TIME", boundingRegion: null, energy: below(n("OP_WEATHER_SURFACE_ENTROPY", "time_energy_weathered")), evidenceRefs: ["e7"], confidence: 0.6 },
    ],
    relations: [
      { sourceId: "node:subject:primary", targetId: "node:space:composition", relationType: "HOST_GUEST", magnitude: 0.5, polarity: "FORWARD", derivedFrom: ["d1"], confidence: 0.85 },
      { sourceId: "node:subject:primary", targetId: "node:void:negative-space", relationType: "SOLID_VOID", magnitude: below(n("OP_ENCLOSE_BREATHING_FIELD", "solid_void_enclosed_magnitude")), polarity: "MUTUAL", derivedFrom: ["d2"], confidence: 0.8 },
      { sourceId: "node:boundary:edges", targetId: "node:void:negative-space", relationType: "DENSE_SPARSE", magnitude: below(n("OP_PARTITION_POISSON_CLUSTER", "dense_sparse_contrast_magnitude")), polarity: "MUTUAL", derivedFrom: ["d3"], confidence: 0.85 },
      { sourceId: "node:material:dominant", targetId: "node:light:luminance-field", relationType: "HEAVY_LIGHT", magnitude: below(n("OP_DAMPEN_SPECULAR_HARSHNESS", "heavy_light_harsh_magnitude")), polarity: "MUTUAL", derivedFrom: ["d4"], confidence: 0.8 },
      { sourceId: "node:light:luminance-field", targetId: "node:void:negative-space", relationType: "HIGH_LOW", magnitude: below(n("OP_COOL_SHADOW_CHROMATICITY", "high_low_differentiated_magnitude")), polarity: "MUTUAL", derivedFrom: ["d5"], confidence: 0.85 },
      { sourceId: "node:space:composition", targetId: "node:boundary:edges", relationType: "OPEN_CLOSE", magnitude: below(n("OP_FRAME_SECONDARY_OCCLUSION", "open_close_contained_magnitude")), polarity: "MUTUAL", derivedFrom: ["d6"], confidence: 0.85 },
    ],
    unmeasuredRelations: [
      { relationType: "MOVE_STILL", reason: "Single-frame input", semanticInterpretationRef: "s:motion" },
      { relationType: "NEAR_FAR", reason: "No depth buffer", semanticInterpretationRef: "s:depth" },
    ],
    topologyAudit: { noIsolatedNodes: true, polarAlignment: true, boundedEnergy: true, purityPenetration: true, violations: [], status: "PASS" },
    graphHash: "fnv1a:test",
    derivationPipeline: [],
  };
  return JSON.parse(JSON.stringify({ ...base, ...overrides })) as AestheticRelationshipGraph;
}

export const nodeOf = (g: AestheticRelationshipGraph, type: string) => g.nodes.find((x) => x.type === type)!;
export const relationOf = (g: AestheticRelationshipGraph, type: string) => g.relations.find((x) => x.relationType === type)!;

export function makeCtx(ir: RawDesignIR, graph: AestheticRelationshipGraph, period: AestheticPeriod = "SONG"): DesignOperationContext {
  return { ir, graph, period };
}
