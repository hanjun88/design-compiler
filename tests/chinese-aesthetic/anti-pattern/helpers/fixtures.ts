/**
 * Fixtures of the anti-pattern gate tests.
 *
 * The gates decide on thresholds that belong to the skill (AestheticConstraintSheet, kind
 * ANTI_PATTERN_THRESHOLD). Nothing here types such a number: every value that sits on one side of a
 * threshold is derived from the DecisionPack of a sheet emitted by the real skill generator. A "benign"
 * value lies clearly on the compliant side of its threshold; a "triggered" value lies just beyond it
 * (or exactly on it, which a strict comparison must not trigger).
 */
import { DEFAULT_CONTEXT_BY_PERIOD, defaultPackFor, loadSheetJson, strictBinding, type TestContext } from "../../../support/skill-packs";
import { DecisionPack, type PolicyView } from "../../../../skill-bridge/decision-pack";
import { validateSheet } from "../../../../skill-bridge/sheet-validator";
import { REQUIRED_DECISIONS } from "../../../../skill-bridge/requirements";
import type { AestheticConstraintSheet, ConstraintOfKind } from "../../../../contracts/aesthetic-constraint-sheet/aesthetic-constraint-sheet.types";
import { mutate } from "../../../skill-bridge/helpers/sheet-tools";
import type { EvidenceField, ObservableEvidenceSet, PixelEvidence, MaterialEvidence } from "../../../../chinese-aesthetic/extraction/types";
import type { AestheticNode, AestheticNodeType, AestheticRelation, AestheticRelationType, AestheticRelationshipGraph } from "../../../../chinese-aesthetic/graph/types";

// ---------------------------------------------------------------------------
// decisions
// ---------------------------------------------------------------------------

export type GateSubject = "symbolic-stacking" | "unphysical-glow" | "dead-void" | "conflicted-hierarchy" | "toxic-saturation";

/** The context whose pack answers period-less lookups in the test environment (see tests/setup/pack-setup.ts). */
export const GATE_TEST_CONTEXT: TestContext = DEFAULT_CONTEXT_BY_PERIOD.SONG;

export const defaultGatePack = (): DecisionPack => defaultPackFor("SONG");

/** The ANTI_PATTERN_THRESHOLD decision of one gate. */
export const gatePolicy = (subject: GateSubject, pack: DecisionPack = defaultGatePack()): PolicyView => pack.policy("ANTI_PATTERN_THRESHOLD", subject);

/** A pack of the same real sheet in which one gate decision is changed (re-sealed, re-validated). */
export function packWith(subject: GateSubject, patch: { params?: Record<string, number>; enums?: Record<string, string>; lists?: Record<string, string[]> }): DecisionPack {
  const sheet = mutate(loadSheetJson(GATE_TEST_CONTEXT), (s) => {
    const c = s.constraints.find((x): x is ConstraintOfKind<"ANTI_PATTERN_THRESHOLD"> => x.kind === "ANTI_PATTERN_THRESHOLD" && x.payload.subject === subject);
    if (!c) throw new Error(`sheet has no ANTI_PATTERN_THRESHOLD ${subject}`);
    Object.assign(c.payload.params, patch.params ?? {});
    if (patch.enums) Object.assign((c.payload.enums ??= {}), patch.enums);
    if (patch.lists) Object.assign((c.payload.lists ??= {}), patch.lists);
  });
  return packOf(sheet);
}

/** A pack of a sheet transformed by `edit` (re-sealed); `requirements` defaults to the full manifest. */
export function packOfEdited(edit: (s: AestheticConstraintSheet) => void, requirements = REQUIRED_DECISIONS): DecisionPack {
  return packOf(mutate(loadSheetJson(GATE_TEST_CONTEXT), edit), requirements);
}

/** A fresh pack (empty usage ledger) of the unmodified real sheet. */
export const freshGatePack = (): DecisionPack => packOf(loadSheetJson(GATE_TEST_CONTEXT));

function packOf(sheet: AestheticConstraintSheet, requirements = REQUIRED_DECISIONS): DecisionPack {
  return DecisionPack.from(validateSheet(sheet, { allowDirty: !strictBinding() }), requirements);
}

// ---------------------------------------------------------------------------
// values relative to a threshold
// ---------------------------------------------------------------------------

/** Probing distance at a strict comparison. A structural constant of the tests, not an aesthetic value. */
export const EPS = 1e-6;
/** Smallest probe that satisfies `x > t`. */
export const justAbove = (t: number): number => t + EPS;
/** Smallest probe that satisfies `x < t`. */
export const justBelow = (t: number): number => t - EPS;
/** Clearly beyond `x > t`, whatever the scale of t. */
export const farAbove = (t: number): number => t * 2 + 1;
/** Clearly short of `x > t` (and clearly inside `x < t`), whatever the scale of t. */
export const farBelow = (t: number): number => t / 2;
/** Clearly above `t` while staying a share in [0, 1]. */
export const ratioAbove = (t: number): number => (t + 1) / 2;

// ---------------------------------------------------------------------------
// evidence
// ---------------------------------------------------------------------------

/** Reliability stamp of a synthetic measurement: test data, no gate decides on it. */
const MEASURED_CONFIDENCE = 0.9;
/** Value of evidence fields that no gate decides on. */
const FILLER = 1;

const measured = <T,>(value: T, ref: string, method = "test-measurement"): EvidenceField<T> => ({ value, evidenceRef: ref, confidence: MEASURED_CONFIDENCE, method });
const declared = <T,>(value: T, ref: string): EvidenceField<T> => ({ value, evidenceRef: ref, confidence: 1, method: "ir-declared" });
const read = <T,>(value: T, ref: string): EvidenceField<T> => ({ value, evidenceRef: ref, confidence: MEASURED_CONFIDENCE, method: "ir-read" });

const UNMEASURED_DEPTH = { status: "UNMEASURED_SEMANTIC", dimension: "depth", reason: "no depth buffer", semanticInterpretationRef: "semantic:depth" } as const;

/** A paradigm that the toxic-saturation decision does not exempt. */
export function unrelaxedParadigm(pack: DecisionPack = defaultGatePack()): string {
  const exempt = gatePolicy("toxic-saturation", pack).list("high_saturation_paradigms");
  const other = ["SONG", "MING", "TANG"].find((p) => !exempt.includes(p));
  if (!other) throw new Error("no period id left that is not an exempt paradigm");
  return other;
}

/** Midpoint of the period band of a scene parameter: a plausible declared value, derived from the sheet. */
const bandMid = (parameter: string, pack: DecisionPack): number => {
  const b = pack.periodBand(parameter);
  if (!b) throw new Error(`no period band for ${parameter}`);
  return (b.min + b.max) / 2;
};

export interface EvidencePatch {
  pixel?: Partial<{ [K in keyof PixelEvidence]: PixelEvidence[K] | undefined }>;
  material?: Partial<{ [K in keyof MaterialEvidence]: MaterialEvidence[K] | undefined }>;
  ir?: { paradigm?: string };
  depth?: { depthBufferAvailable?: boolean; atmosphericDepthMeasured?: boolean };
}

/**
 * Evidence on which every gate allows: each decisive measurement lies clearly on the compliant side of
 * its threshold. `patch` replaces measurements (an `undefined` value removes the field = UNMEASURED).
 */
export function makeEvidence(patch: EvidencePatch = {}, pack: DecisionPack = defaultGatePack()): ObservableEvidenceSet {
  const dv = gatePolicy("dead-void", pack);
  const ts = gatePolicy("toxic-saturation", pack);
  const ug = gatePolicy("unphysical-glow", pack);
  const pixel: PixelEvidence = {
    meanLuminance: measured(FILLER, "pixel:mean-luminance"),
    // above both "low tonal variation" cut-offs (dead void and toxic saturation)
    luminanceStdDev: measured(Math.max(farAbove(dv.num("luminance_std_below")), farAbove(ts.num("luminance_std_below"))), "pixel:luminance-std"),
    luminanceHistogram: measured([FILLER], "pixel:luminance-hist"),
    luminanceHistogramPeakCount: measured(FILLER, "pixel:luminance-peaks"),
    spatialLaplacianVariance: measured(farAbove(dv.num("laplacian_variance_below")), "pixel:laplacian-variance"),
    sobelEdgeGradientSkew: measured(FILLER, "pixel:sobel-skew"),
    edgePixelRatio: measured(FILLER, "pixel:edge-ratio"),
    edgeOrientationHistogram: measured([FILLER], "pixel:edge-orient"),
    dominantColor: measured("#808080", "pixel:dominant-color"),
    secondaryColor: measured("#606060", "pixel:secondary-color"),
    accentColor: measured("#A0A0A0", "pixel:accent-color"),
    dominantColorRatio: measured(farBelow(ts.num("dominant_color_ratio_above")), "pixel:dominant-ratio"),
    contrastRatio: measured(farBelow(ts.num("contrast_ratio_above")), "pixel:contrast-ratio"),
    temperatureBias: measured(farBelow(ts.num("temperature_bias_abs_above")), "pixel:temp-bias"),
    blockLuminanceMeanGradient: measured(farAbove(dv.num("block_luminance_gradient_below")), "pixel:block-gradient"),
    negativeSpaceRatio: measured(farBelow(dv.num("candidate_void_ratio_above")), "pixel:void-ratio"),
    negativeSpaceComponentCount: measured(FILLER, "pixel:void-components"),
    largestVoidRegionRatio: measured(farBelow(dv.num("dominant_void_region_ratio_above")), "pixel:largest-void"),
    focalPoint: measured<[number, number]>([FILLER, FILLER], "pixel:focal-point"),
    focalCenterOffset: measured(FILLER, "pixel:focal-offset"),
    nonZeroPixels: measured(FILLER, "pixel:nonzero"),
    nanInfPixelCount: measured(0, "pixel:nan-inf"),
  };
  const material: MaterialEvidence = {
    materialCount: 1,
    dominantMaterialIndex: measured(0, "material:dominant-index"),
    dominantRoughness: read(bandMid("scene.material.roughness", pack), "ir:material-roughness"),
    dominantMetalness: read(FILLER, "ir:material-metalness"),
    dominantWear: read(FILLER, "ir:material-wear"),
    dominantBaseType: read("WOOD::fixture", "ir:material-base-type"),
    dominantMaterialCategory: read("WOOD", "ir:material-category"),
    // a textured surface with soft, small highlights
    surfaceVariation: measured(farAbove(ug.num("surface_variation_below")), "material:surface-variation"),
    microSurfaceHighFrequencyVariance: measured(farAbove(ug.num("micro_surface_variance_below")), "material:micro-variance"),
    specularHighlightRatio: measured(farBelow(ug.num("specular_highlight_ratio_above")), "material:specular-ratio"),
    specularSharpness: measured(farBelow(ug.num("specular_sharpness_above")), "material:specular-sharpness"),
    roughnessSpatialVariance: measured(FILLER, "material:roughness-variance"),
    colorVariationSpatialGradient: measured(FILLER, "material:color-variation"),
    timeTraceDetectability: measured(FILLER, "material:time-trace"),
  };
  const base: ObservableEvidenceSet = {
    evidenceId: "test-evidence-001",
    capturedAt: "2026-09-16T00:00:00Z",
    renderContext: {
      renderer: "software-reference",
      rendererVersion: "1.0.0",
      resolution: { width: FILLER, height: FILLER },
      pixelFormat: "RGBA8",
      bufferByteLength: FILLER,
      renderHash: "sha256:test-render-hash",
      irHash: "sha256:test-ir-hash",
    },
    pixel,
    depth: {
      depthBufferAvailable: false,
      depthHistogram: UNMEASURED_DEPTH,
      depthLayerCount: UNMEASURED_DEPTH,
      layerSeparation: UNMEASURED_DEPTH,
      occlusionEdgeCount: UNMEASURED_DEPTH,
      occlusionChainLength: UNMEASURED_DEPTH,
      atmosphericDepth: UNMEASURED_DEPTH,
      focalDepthSeparation: UNMEASURED_DEPTH,
      depthMotionProjectionResidual: UNMEASURED_DEPTH,
    },
    motion: null,
    material,
    ir: {
      irHash: "sha256:test-ir-hash",
      irType: "ValidatedDesignIR",
      paradigm: declared(unrelaxedParadigm(pack), "ir:paradigm"),
      compositionType: declared("central-axis", "ir:composition"),
      symmetry: declared(bandMid("scene.composition.axialSymmetry", pack), "ir:symmetry"),
      declaredNegativeSpaceRatio: declared(bandMid("scene.composition.negativeSpaceRatio", pack), "ir:void-ratio"),
      horizonPosition: declared(FILLER, "ir:horizon"),
      cameraPitch: declared(FILLER, "ir:camera-pitch"),
      lightingIntent: declared("DAYLIGHT", "ir:lighting"),
      colorTemp: declared(FILLER, "ir:color-temp"),
      lightIntensity: declared(FILLER, "ir:light-intensity"),
      lightSoftness: declared(FILLER, "ir:light-softness"),
      ambientRatio: declared(FILLER, "ir:ambient-ratio"),
      materials: declared([{ baseType: "WOOD::fixture", materialCategory: "WOOD", roughness: bandMid("scene.material.roughness", pack), metalness: FILLER, wear: FILLER }], "ir:materials"),
      transformationTrace: declared([], "ir:transform-trace"),
    },
    semantic: null,
    purityAudit: {
      auditedAt: "2026-09-16T00:00:00Z",
      totalFields: FILLER,
      measuredFields: FILLER,
      unmeasuredFields: 0,
      hardcodedConstantsFound: [],
      fieldsMissingEvidenceRef: [],
      fieldsMissingConfidence: [],
      purityStatus: "PURE",
      contaminationDetails: [],
    },
  };

  const out: ObservableEvidenceSet = { ...base, pixel: { ...base.pixel }, material: { ...base.material }, depth: { ...base.depth }, ir: { ...base.ir } };
  for (const [k, v] of Object.entries(patch.pixel ?? {})) {
    if (v === undefined) delete (out.pixel as unknown as Record<string, unknown>)[k];
    else (out.pixel as unknown as Record<string, unknown>)[k] = v;
  }
  for (const [k, v] of Object.entries(patch.material ?? {})) {
    if (v === undefined) delete (out.material as unknown as Record<string, unknown>)[k];
    else (out.material as unknown as Record<string, unknown>)[k] = v;
  }
  if (patch.ir?.paradigm !== undefined) out.ir.paradigm = declared(patch.ir.paradigm, "ir:paradigm");
  if (patch.depth) {
    out.depth.depthBufferAvailable = patch.depth.depthBufferAvailable ?? out.depth.depthBufferAvailable;
    if (patch.depth.atmosphericDepthMeasured) out.depth.atmosphericDepth = measured(FILLER, "depth:atmospheric");
  }
  return out;
}

/** A measured evidence field (for patches). */
export const field = <T,>(value: T, ref: string): EvidenceField<T> => measured(value, ref);

// ---------------------------------------------------------------------------
// relationship graphs
// ---------------------------------------------------------------------------

/** Node energy (a normalized share) of nodes whose energy no gate decides on; also the top energy of graded subjects. */
export const NEUTRAL_ENERGY = FILLER;

export const node = (id: string, type: AestheticNodeType, energy: number = NEUTRAL_ENERGY): AestheticNode => ({
  id, type, energy, confidence: MEASURED_CONFIDENCE, evidenceRefs: [`ref:${id}`], boundingRegion: null,
});

export const relation = (sourceId: string, targetId: string, relationType: AestheticRelationType): AestheticRelation => ({
  sourceId, targetId, relationType, magnitude: NEUTRAL_ENERGY, polarity: "MUTUAL", confidence: MEASURED_CONFIDENCE, derivedFrom: ["test:deriver"],
});

export function makeGraph(nodes: AestheticNode[], relations: AestheticRelation[]): AestheticRelationshipGraph {
  return {
    graphId: "graph:test-evidence-001",
    evidenceId: "test-evidence-001",
    generatedAt: "2026-09-16T00:00:00Z",
    graphHash: "fnv1a:test1234",
    nodes,
    relations,
    unmeasuredRelations: [],
    topologyAudit: { status: "PASS", noIsolatedNodes: true, polarAlignment: true, boundedEnergy: true, purityPenetration: true, violations: [] },
    derivationPipeline: ["instantiate", "derive", "audit", "hash"],
  };
}

/** n nodes n0..n(n-1); n0 is the only SUBJECT, the others are SPACE nodes. */
export const nodesOf = (n: number): AestheticNode[] => Array.from({ length: n }, (_, i) => node(`n${i}`, i === 0 ? "SUBJECT" : "SPACE"));

/** Directed edges between node indices. */
export const edgesOf = (edges: Array<[from: number, to: number, type?: AestheticRelationType]>): AestheticRelation[] =>
  edges.map(([from, to, type]) => relation(`n${from}`, `n${to}`, type ?? "SOLID_VOID"));

/**
 * A complex but well-connected composition: as many nodes as the symbolic-stacking decision calls "many",
 * a ring over all of them, a host-guest edge, and enough edges converging on one node to count as
 * convergence. No stacking signal other than the node count applies.
 */
export function connectedComposition(pack: DecisionPack = defaultGatePack()): AestheticRelationshipGraph {
  const t = gatePolicy("symbolic-stacking", pack);
  const hub = t.num("convergence_in_degree_min");
  // "many" nodes, and room for `hub` distinct sources besides n0 / the hub node n1
  const n = Math.max(t.num("many_nodes_min"), hub + 3);
  const ring: Array<[number, number]> = Array.from({ length: n }, (_, i) => [i, (i + 1) % n]);
  const converging: Array<[number, number]> = Array.from({ length: hub }, (_, k) => [2 + k, 1]);
  const graph = makeGraph(nodesOf(n), [...edgesOf([...ring, ...converging]), ...edgesOf([[0, 1, "HOST_GUEST"]])]);
  // enough relations that the average degree is not low: chords from n0 until it is not
  const low = t.num("low_average_degree_below");
  for (let chord = 2; (2 * graph.relations.length) / n < low; chord++) graph.relations.push(...edgesOf([[0, 1 + (chord % (n - 1))]]));
  return graph;
}
