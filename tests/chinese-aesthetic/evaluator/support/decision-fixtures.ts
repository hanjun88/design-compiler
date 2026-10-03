/**
 * Fixtures for the evaluator / human-audit-ledger tests.
 *
 * No aesthetic number is declared here. Every verdict-relevant input is derived from the DecisionPack
 * under test (a threshold, a band edge, or a physical extreme such as 0 / 1), so the same suite can be
 * run against every period's real pack and against packs whose decisions were perturbed: if a
 * threshold were still a literal inside the evaluator, the perturbed pack would expose it.
 */
import type { AestheticConstraintSheet, ConstraintOfKind } from "../../../../contracts/aesthetic-constraint-sheet/aesthetic-constraint-sheet.types";
import type { ObservableEvidenceSet, EvidenceField, UnmeasuredSemantic } from "../../../../chinese-aesthetic/extraction/types";
import type { MachineAssertionReport } from "../../../../chinese-aesthetic/matrix/machine-assertions";
import { EVAL_SUBJECT, negativeSpaceBand } from "../../../../chinese-aesthetic/evaluator/decisions";
import { DecisionPack } from "../../../../skill-bridge/decision-pack";
import { validateSheet } from "../../../../skill-bridge/sheet-validator";
import { REQUIRED_DECISIONS } from "../../../../skill-bridge/requirements";
import { loadSheetJson, packFor, type TestContext } from "../../../support/skill-packs";
import { mutate } from "../../../skill-bridge/helpers/sheet-tools";

/** Smallest step used to step across a threshold (structural, not aesthetic). */
export const EPS = 1e-6;

/** Physical extremes / midpoint of a [0, 1] quantity (not aesthetic decisions). */
export const ZERO = 0;
export const ONE = 1;
export const MID = (ONE + ZERO) / 2;

export const PERIOD_CONTEXTS: Record<"TANG" | "SONG" | "MING", TestContext> = {
  TANG: { period: "TANG", material: "BRONZE", lighting: "DAYLIGHT", scene_type: "OBJECT_STUDY" },
  SONG: { period: "SONG", material: "STONE", lighting: "DIM", scene_type: "OBJECT_STUDY" },
  MING: { period: "MING", material: "WOOD", lighting: "DAYLIGHT", scene_type: "OBJECT_STUDY" },
};

export type VariantPack = { name: string; pack: DecisionPack };

const num = (pack: DecisionPack, subject: string, key: string): number => pack.policy("EVALUATION_ASSERTION", subject).num(key);
export const decided = num;
export const midpoint = (a: number, b: number): number => (a + b) / 2;

// ---------------------------------------------------------------------------------------------
// Pack variants built from REAL emitted sheets (never from invented decisions)
// ---------------------------------------------------------------------------------------------

const freshPack = (sheet: AestheticConstraintSheet, requirements: typeof REQUIRED_DECISIONS = REQUIRED_DECISIONS): DecisionPack =>
  DecisionPack.from(validateSheet(sheet, { allowDirty: true }), requirements);

/** A real sheet with an edit applied (every hash is recomputed so the edit is the only change). */
export function packWithEdit(ctx: TestContext, edit: (sheet: AestheticConstraintSheet) => void): DecisionPack {
  return freshPack(mutate(loadSheetJson(ctx), edit));
}

/**
 * A pack that lacks a decision: built WITHOUT the requirement manifest (which would reject the sheet
 * up front), so tests can prove that a missing decision is an error at read time and never a default.
 */
export function packLacking(ctx: TestContext, edit: (sheet: AestheticConstraintSheet) => void): DecisionPack {
  return freshPack(mutate(loadSheetJson(ctx), edit), []);
}

/** Every numeric parameter of every EVALUATION_ASSERTION decision scaled by `factor`. */
export function packWithScaledEvaluationParams(ctx: TestContext, factor: number): DecisionPack {
  return packWithEdit(ctx, (sheet) => {
    for (const c of sheet.constraints) {
      if (c.kind !== "EVALUATION_ASSERTION") continue;
      for (const k of Object.keys(c.payload.params)) c.payload.params[k] *= factor;
    }
  });
}

/**
 * The void-ratio PERIOD_BAND with both edges moved by `moveEachEdge` x its width: positive narrows,
 * negative widens (kept inside the physical range [0, 1]). Keep the move small: the sheet validator
 * rejects a band that would exclude the repair targets of the skill's own grammar rules.
 */
export function packWithMovedVoidBand(ctx: TestContext, moveEachEdge: number): DecisionPack {
  return packWithEdit(ctx, (sheet) => {
    for (const c of sheet.constraints) {
      if (c.kind !== "PARAMETER_BAND" || c.payload.semantics !== "PERIOD_BAND" || c.payload.parameter !== "scene.composition.negativeSpaceRatio") continue;
      const width = c.payload.max - c.payload.min;
      c.payload.min = Math.max(ZERO, c.payload.min + width * moveEachEdge);
      c.payload.max = Math.min(ONE, c.payload.max - width * moveEachEdge);
    }
  });
}

/** The real sheet plus a HARD_FLOOR on the void ratio at `floor` (shaped like the skill's own hard-floor rule). */
export function packWithVoidFloor(ctx: TestContext, floorOf: (band: { min: number; max: number }) => number): DecisionPack {
  return packWithEdit(ctx, (sheet) => {
    const periodBand = sheet.constraints.find(
      (c): c is ConstraintOfKind<"PARAMETER_BAND"> =>
        c.kind === "PARAMETER_BAND" && c.payload.semantics === "PERIOD_BAND" && c.payload.parameter === "scene.composition.negativeSpaceRatio",
    );
    if (!periodBand) throw new Error("fixture: the sheet has no void-ratio period band");
    const floor = JSON.parse(JSON.stringify(periodBand)) as typeof periodBand;
    floor.rule_id = "UT-HARD-FLOOR";
    floor.decision_id = `D:UT-HARD-FLOOR:${periodBand.decision_id.split(":").slice(2).join(":")}`;
    floor.payload.semantics = "HARD_FLOOR";
    floor.payload.min = floorOf({ min: periodBand.payload.min, max: periodBand.payload.max });
    sheet.constraints.push(floor);
  });
}

/** The same pack variants every threshold test runs against. */
export function variantPacks(): VariantPack[] {
  return [
    { name: "TANG (real sheet)", pack: packFor(PERIOD_CONTEXTS.TANG) },
    { name: "SONG (real sheet)", pack: packFor(PERIOD_CONTEXTS.SONG) },
    { name: "MING (real sheet)", pack: packFor(PERIOD_CONTEXTS.MING) },
    { name: "SONG, every evaluation parameter scaled", pack: packWithScaledEvaluationParams(PERIOD_CONTEXTS.SONG, 0.8) },
    { name: "TANG, every evaluation parameter scaled", pack: packWithScaledEvaluationParams(PERIOD_CONTEXTS.TANG, 1.15) },
    { name: "MING, void band widened", pack: packWithMovedVoidBand(PERIOD_CONTEXTS.MING, -0.2) },
    { name: "SONG, void band narrowed", pack: packWithMovedVoidBand(PERIOD_CONTEXTS.SONG, 0.1) },
  ];
}

// ---------------------------------------------------------------------------------------------
// Observable evidence (machine evaluator, evidence path)
// ---------------------------------------------------------------------------------------------

const ef = <T>(value: T): EvidenceField<T> => ({ value, evidenceRef: "fixture:ref", confidence: 1, method: "fixture" });
const unmeasured: UnmeasuredSemantic = { status: "UNMEASURED_SEMANTIC", dimension: "depth", reason: "no depth buffer", semanticInterpretationRef: "fixture:depth" };

export type EvidenceEdit = (e: ObservableEvidenceSet) => void;

/**
 * Evidence whose every verdict-relevant measurement sits comfortably inside the passing region of
 * `pack`; tests then move exactly one measurement across its threshold.
 */
export function neutralEvidence(pack: DecisionPack, edit?: EvidenceEdit): ObservableEvidenceSet {
  const focal = EVAL_SUBJECT.focalHierarchy;
  const band = negativeSpaceBand(pack);
  const voidRatio = midpoint(band.min, band.max);
  const evidence: ObservableEvidenceSet = {
    evidenceId: "fixture-evidence",
    capturedAt: "2026-09-16T00:00:00Z",
    renderContext: { renderer: "fixture", rendererVersion: "1", resolution: { width: 1, height: 1 }, pixelFormat: "RGBA8", bufferByteLength: 4, renderHash: "sha256:fixture", irHash: "sha256:fixture" },
    pixel: {
      meanLuminance: ef(MID), luminanceStdDev: ef(MID), luminanceHistogram: ef([ONE]),
      luminanceHistogramPeakCount: ef(decided(pack, focal, "min_luminance_peaks_for_tiers")),
      spatialLaplacianVariance: ef(MID), sobelEdgeGradientSkew: ef(MID), edgePixelRatio: ef(MID), edgeOrientationHistogram: ef([ONE]),
      dominantColor: ef("#101010"), secondaryColor: ef("#202020"), accentColor: ef("#303030"),
      dominantColorRatio: ef(midpoint(decided(pack, focal, "min_dominant_area_ratio"), decided(pack, focal, "max_dominant_area_ratio"))),
      contrastRatio: ef(decided(pack, EVAL_SUBJECT.colorRelationship, "min_contrast_ratio") * 2),
      temperatureBias: ef(ZERO), blockLuminanceMeanGradient: ef(MID),
      negativeSpaceRatio: ef(voidRatio), negativeSpaceComponentCount: ef(ONE), largestVoidRegionRatio: ef(voidRatio),
      focalPoint: ef<[number, number]>([MID, MID]), focalCenterOffset: ef(ZERO), nonZeroPixels: ef(ONE), nanInfPixelCount: ef(ZERO),
    },
    depth: {
      depthBufferAvailable: true,
      depthHistogram: unmeasured,
      depthLayerCount: ef(decided(pack, EVAL_SUBJECT.spatialDepth, "min_depth_layer_count")),
      layerSeparation: ef(ONE), occlusionEdgeCount: ef(ONE), occlusionChainLength: unmeasured, atmosphericDepth: ef(ONE), focalDepthSeparation: ef(ONE),
      depthMotionProjectionResidual: ef(ONE),
    },
    motion: {
      framePairCount: 2,
      opticalFlowDirectionCoherence: ef(ONE), opticalFlowAmplitudeStability: ef(ONE), globalDisplacementMean: ef<[number, number]>([ZERO, ZERO]), globalDisplacementStdDev: ef(ZERO),
      cameraMotionSmoothness: ef(ONE), luminanceContinuity: ef(ONE), chromaticContinuity: ef(ONE), colorHistogramBhattacharyyaDistance: ef(ZERO),
      motionContinuity: ef(ONE), rhythmChangePointCount: ef(ZERO), motionSpeedCoefficientOfVariation: ef(ZERO),
    },
    material: {
      materialCount: 1, dominantMaterialIndex: ef(ZERO),
      dominantRoughness: ef(MID), dominantMetalness: ef(MID), dominantWear: ef(MID), dominantBaseType: ef("WOOD"), dominantMaterialCategory: ef("WOOD"),
      surfaceVariation: ef(MID), microSurfaceHighFrequencyVariance: ef(MID), specularHighlightRatio: ef(MID), specularSharpness: ef(MID),
      roughnessSpatialVariance: ef(MID), colorVariationSpatialGradient: ef(MID), timeTraceDetectability: ef(MID),
    },
    ir: {
      irHash: "sha256:fixture", irType: "ValidatedDesignIR",
      paradigm: ef("FIXTURE"), compositionType: ef("fixture"), symmetry: ef(MID), declaredNegativeSpaceRatio: ef(voidRatio),
      horizonPosition: ef(MID), cameraPitch: ef(ZERO), lightingIntent: ef("DAYLIGHT"), colorTemp: ef(ONE), lightIntensity: ef(ONE), lightSoftness: ef(MID), ambientRatio: ef(MID),
      materials: ef([]), transformationTrace: ef([]),
    },
    semantic: null,
    purityAudit: { auditedAt: "2026-09-16T00:00:00Z", totalFields: 0, measuredFields: 0, unmeasuredFields: 0, hardcodedConstantsFound: [], fieldsMissingEvidenceRef: [], fieldsMissingConfidence: [], purityStatus: "PURE", contaminationDetails: [] },
  };
  edit?.(evidence);
  return evidence;
}

// ---------------------------------------------------------------------------------------------
// Machine report (semantic evaluator input)
// ---------------------------------------------------------------------------------------------

export type ReportMetrics = {
  focalCenterOffset: number; dominanceSeparation: number;
  negativeSpaceRatio: number; emptyRegionContinuity: number;
  motionContinuity: number; opticalFlowCoherence: number; cameraMotionSmoothness: number; luminanceContinuity: number;
  depthLayerCount: number; layerSeparation: number; atmosphericDepth: number;
  contrastRatio: number; accentIsolation: number;
  microDetailDistribution: number; dominantWear: number;
};

const assertion = <M extends Record<string, unknown>>(assertionId: string, metrics: M) => ({
  assertionId, culturalDimension: "fixture", status: "PASS" as const, metrics, evidenceRefs: ["fixture:ref"], method: "fixture",
});

/** A MachineAssertionReport built from flat metrics (what the semantic evaluator reads). */
export function reportOf(m: ReportMetrics): MachineAssertionReport {
  return {
    testCaseId: "fixture-report",
    evaluatedAt: "2026-09-16T00:00:00Z",
    passRate: ONE,
    focalHierarchy: assertion("focal-hierarchy", { focalCenterOffset: m.focalCenterOffset, dominantAreaRatio: MID, secondaryAreaRatio: MID, accentAreaRatio: MID, dominanceSeparation: m.dominanceSeparation }),
    voidSolid: assertion("void-solid-ratio", { negativeSpaceRatio: m.negativeSpaceRatio, subjectSpaceRatio: ONE - m.negativeSpaceRatio, emptyRegionContinuity: m.emptyRegionContinuity, visualDensityVariance: MID, edgeDensitySkew: MID }),
    qiyunContinuity: assertion("qiyun-continuity", { motionContinuity: m.motionContinuity, opticalFlowCoherence: m.opticalFlowCoherence, cameraMotionSmoothness: m.cameraMotionSmoothness, luminanceContinuity: m.luminanceContinuity, chromaticContinuity: MID, depthContinuity: MID }),
    spatialDepth: assertion("spatial-depth-layers", { depthLayerCount: m.depthLayerCount, layerSeparation: m.layerSeparation, occlusionCount: ONE, atmosphericDepth: m.atmosphericDepth, focalDepthSeparation: MID }),
    colorRelationship: assertion("color-relationship", { dominant: "#101010", secondary: "#202020", accent: "#303030", contrastRatio: m.contrastRatio, temperatureBias: ZERO, luminanceHierarchy: MID, accentIsolation: m.accentIsolation }),
    materialRelationship: assertion("material-relationship", { dominantRoughness: MID, dominantMetalness: MID, dominantWear: m.dominantWear, surfaceVariation: MID, microDetailDistribution: m.microDetailDistribution }),
  };
}

/** Metrics that satisfy every semantic condition of `pack` (every threshold met, void ratio inside the band). */
export function satisfyingMetrics(pack: DecisionPack): ReportMetrics {
  const band = negativeSpaceBand(pack);
  const e = (subject: string, key: string) => decided(pack, subject, key);
  return {
    focalCenterOffset: ZERO,
    dominanceSeparation: ONE,
    negativeSpaceRatio: midpoint(band.min, band.max),
    emptyRegionContinuity: ONE,
    motionContinuity: ONE,
    opticalFlowCoherence: ONE,
    cameraMotionSmoothness: ONE,
    luminanceContinuity: ONE,
    depthLayerCount: Math.max(e(EVAL_SUBJECT.xushiXiangsheng, "min_depth_layer_count"), e(EVAL_SUBJECT.cengciYuanjin, "min_depth_layer_count")),
    layerSeparation: ONE,
    atmosphericDepth: ONE,
    contrastRatio: midpoint(e(EVAL_SUBJECT.hanxuYuliubai, "min_contrast_ratio"), e(EVAL_SUBJECT.hanxuYuliubai, "max_contrast_ratio")),
    accentIsolation: ZERO,
    microDetailDistribution: ONE,
    dominantWear: MID,
  };
}
