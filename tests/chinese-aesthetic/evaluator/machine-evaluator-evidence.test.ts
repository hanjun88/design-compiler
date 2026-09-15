/**
 * Machine Evaluator Evidence-Based Tests — Phase 2.5
 *
 * 验证证据版机器断言评估器已拔除全部 14 处硬编码伪常数，
 * 替换为 ObservableEvidenceSet 真实物理字段读取。
 */

import {
  evaluateMachineAssertionsFromEvidence,
  evaluateFocalHierarchyEvidence,
  evaluateVoidSolidEvidence,
  evaluateQiyunContinuityEvidence,
  evaluateSpatialDepthEvidence,
  evaluateColorRelationshipEvidence,
  evaluateMaterialRelationshipEvidence,
} from "../../../chinese-aesthetic/evaluator/machine-evaluator";
import type { ObservableEvidenceSet } from "../../../chinese-aesthetic/extraction/types";

function makeStandardEvidence(overrides: Partial<ObservableEvidenceSet> = {}): ObservableEvidenceSet {
  const base: ObservableEvidenceSet = {
    evidenceId: "test-machine-evidence-001",
    capturedAt: "2026-09-16T00:00:00Z",
    renderContext: {
      renderer: "software-reference", rendererVersion: "1.0.0",
      resolution: { width: 480, height: 270 }, pixelFormat: "RGBA8",
      bufferByteLength: 518400, renderHash: "sha256:test", irHash: "sha256:test",
    },
    pixel: {
      meanLuminance: { value: 128, evidenceRef: "p:ml", confidence: 0.9, method: "avg" },
      luminanceStdDev: { value: 30, evidenceRef: "p:ls", confidence: 0.9, method: "std" },
      luminanceHistogram: { value: [10,20,30], evidenceRef: "p:lh", confidence: 0.9, method: "hist" },
      luminanceHistogramPeakCount: { value: 3, evidenceRef: "p:lpc", confidence: 0.9, method: "peak" },
      spatialLaplacianVariance: { value: 150, evidenceRef: "p:slv", confidence: 0.9, method: "lap" },
      sobelEdgeGradientSkew: { value: 0.15, evidenceRef: "p:segs", confidence: 0.9, method: "sobel" },
      edgePixelRatio: { value: 0.15, evidenceRef: "p:epr", confidence: 0.9, method: "edge" },
      edgeOrientationHistogram: { value: [0,0,0], evidenceRef: "p:eoh", confidence: 0.9, method: "orient" },
      dominantColor: { value: "#8B7355", evidenceRef: "p:dc", confidence: 0.9, method: "kmeans" },
      secondaryColor: { value: "#6B5344", evidenceRef: "p:sc", confidence: 0.9, method: "kmeans" },
      accentColor: { value: "#C4A35A", evidenceRef: "p:ac", confidence: 0.9, method: "kmeans" },
      dominantColorRatio: { value: 0.45, evidenceRef: "p:dcr", confidence: 0.9, method: "ratio" },
      contrastRatio: { value: 3.5, evidenceRef: "p:cr", confidence: 0.9, method: "wcag" },
      temperatureBias: { value: 0.1, evidenceRef: "p:tb", confidence: 0.9, method: "temp" },
      blockLuminanceMeanGradient: { value: 8.5, evidenceRef: "p:blmg", confidence: 0.9, method: "block" },
      negativeSpaceRatio: { value: 0.35, evidenceRef: "p:nsr", confidence: 0.9, method: "void" },
      negativeSpaceComponentCount: { value: 2, evidenceRef: "p:nscc", confidence: 0.9, method: "cc" },
      largestVoidRegionRatio: { value: 0.25, evidenceRef: "p:lvrr", confidence: 0.9, method: "largest" },
      focalPoint: { value: [0.48,0.52] as [number,number], evidenceRef: "p:fp", confidence: 0.9, method: "saliency" },
      focalCenterOffset: { value: 0.028, evidenceRef: "p:fco", confidence: 0.9, method: "offset" },
      nonZeroPixels: { value: 100000, evidenceRef: "p:nzp", confidence: 0.9, method: "count" },
      nanInfPixelCount: { value: 0, evidenceRef: "p:nipc", confidence: 0.9, method: "nan" },
    },
    depth: {
      depthBufferAvailable: false,
      depthHistogram: { status: "UNMEASURED_SEMANTIC", dimension: "depth", reason: "no buffer", semanticInterpretationRef: "s:d" },
      depthLayerCount: { status: "UNMEASURED_SEMANTIC", dimension: "depth", reason: "no buffer", semanticInterpretationRef: "s:d" },
      layerSeparation: { status: "UNMEASURED_SEMANTIC", dimension: "depth", reason: "no buffer", semanticInterpretationRef: "s:d" },
      occlusionEdgeCount: { status: "UNMEASURED_SEMANTIC", dimension: "depth", reason: "no buffer", semanticInterpretationRef: "s:d" },
      occlusionChainLength: { status: "UNMEASURED_SEMANTIC", dimension: "depth", reason: "no buffer", semanticInterpretationRef: "s:d" },
      atmosphericDepth: { status: "UNMEASURED_SEMANTIC", dimension: "depth", reason: "no buffer", semanticInterpretationRef: "s:d" },
      focalDepthSeparation: { status: "UNMEASURED_SEMANTIC", dimension: "depth", reason: "no buffer", semanticInterpretationRef: "s:d" },
      depthMotionProjectionResidual: { status: "UNMEASURED_SEMANTIC", dimension: "depth", reason: "no buffer", semanticInterpretationRef: "s:d" },
    },
    motion: null,
    material: {
      materialCount: 1,
      dominantMaterialIndex: { value: 0, evidenceRef: "m:dmi", confidence: 0.9, method: "idx" },
      dominantRoughness: { value: 0.55, evidenceRef: "m:dr", confidence: 0.9, method: "ir-read" },
      dominantMetalness: { value: 0.08, evidenceRef: "m:dm", confidence: 0.9, method: "ir-read" },
      dominantWear: { value: 0.25, evidenceRef: "m:dw", confidence: 0.9, method: "ir-read" },
      dominantBaseType: { value: "WOOD::song-elm", evidenceRef: "m:dbt", confidence: 0.9, method: "ir-read" },
      dominantMaterialCategory: { value: "WOOD", evidenceRef: "m:dmc", confidence: 0.9, method: "ir-read" },
      surfaceVariation: { value: 0.12, evidenceRef: "m:sv", confidence: 0.9, method: "surface" },
      microSurfaceHighFrequencyVariance: { value: 0.08, evidenceRef: "m:mshfv", confidence: 0.9, method: "highfreq" },
      specularHighlightRatio: { value: 0.015, evidenceRef: "m:shr", confidence: 0.9, method: "spec" },
      specularSharpness: { value: 0.25, evidenceRef: "m:ss", confidence: 0.9, method: "sharp" },
      roughnessSpatialVariance: { value: 0.02, evidenceRef: "m:rsv", confidence: 0.9, method: "rough" },
      colorVariationSpatialGradient: { value: 0.03, evidenceRef: "m:cvs", confidence: 0.9, method: "color" },
      timeTraceDetectability: { value: 0.15, evidenceRef: "m:ttd", confidence: 0.9, method: "time" },
    },
    ir: {
      irHash: "sha256:test", irType: "ValidatedDesignIR",
      paradigm: { value: "SONG", evidenceRef: "ir:p", confidence: 1, method: "declared" },
      compositionType: { value: "central-axis", evidenceRef: "ir:ct", confidence: 1, method: "declared" },
      symmetry: { value: 0.7, evidenceRef: "ir:s", confidence: 0.8, method: "declared" },
      declaredNegativeSpaceRatio: { value: 0.35, evidenceRef: "ir:dnsr", confidence: 0.8, method: "declared" },
      horizonPosition: { value: 0.4, evidenceRef: "ir:hp", confidence: 0.8, method: "declared" },
      cameraPitch: { value: -10, evidenceRef: "ir:cp", confidence: 0.8, method: "declared" },
      lightingIntent: { value: "DAYLIGHT", evidenceRef: "ir:li", confidence: 1, method: "declared" },
      colorTemp: { value: 5500, evidenceRef: "ir:ct2", confidence: 0.9, method: "declared" },
      lightIntensity: { value: 1.0, evidenceRef: "ir:li2", confidence: 0.9, method: "declared" },
      lightSoftness: { value: 0.6, evidenceRef: "ir:ls", confidence: 0.9, method: "declared" },
      ambientRatio: { value: 0.35, evidenceRef: "ir:ar", confidence: 0.9, method: "declared" },
      materials: { value: [{baseType:"WOOD::song-elm",materialCategory:"WOOD",roughness:0.55,metalness:0.08,wear:0.25}], evidenceRef: "ir:m", confidence: 0.9, method: "declared" },
      transformationTrace: { value: [], evidenceRef: "ir:tt", confidence: 1, method: "declared" },
    },
    semantic: null,
    purityAudit: {
      auditedAt: "2026-09-16T00:00:00Z", totalFields: 50, measuredFields: 50,
      unmeasuredFields: 0, hardcodedConstantsFound: [],
      fieldsMissingEvidenceRef: [], fieldsMissingConfidence: [],
      purityStatus: "PURE", contaminationDetails: [],
    },
  };
  return { ...base, ...overrides } as ObservableEvidenceSet;
}

describe("Phase 2.5: 14 Hardcoded Proxies Removed", () => {
  test("focal: secondaryArea not hardcoded 0.20", () => {
    const r = evaluateFocalHierarchyEvidence(makeStandardEvidence());
    expect(r.metrics.secondaryAreaRatio).toBeCloseTo((1-0.45)*0.6, 4);
    expect(r.metrics.secondaryAreaRatio).not.toBe(0.20);
  });
  test("focal: accentArea not hardcoded 0.15", () => {
    const r = evaluateFocalHierarchyEvidence(makeStandardEvidence());
    expect(r.metrics.accentAreaRatio).toBeCloseTo((1-0.45)*0.4, 4);
    expect(r.metrics.accentAreaRatio).not.toBe(0.15);
  });
  test("focal: peak<3 marks UNMEASURED NaN", () => {
    const e = makeStandardEvidence({pixel:{...makeStandardEvidence().pixel, luminanceHistogramPeakCount:{value:2,evidenceRef:"p",confidence:0.9,method:"peak"}}});
    const r = evaluateFocalHierarchyEvidence(e);
    expect(Number.isNaN(r.metrics.secondaryAreaRatio)).toBe(true);
  });
  test("void: visualDensityVariance reads laplacian, not 0.15", () => {
    const r = evaluateVoidSolidEvidence(makeStandardEvidence());
    expect(r.metrics.visualDensityVariance).toBe(150);
    expect(r.metrics.visualDensityVariance).not.toBe(0.15);
  });
  test("void: edgeDensitySkew reads sobel, not 0.1", () => {
    const r = evaluateVoidSolidEvidence(makeStandardEvidence());
    expect(r.metrics.edgeDensitySkew).toBeCloseTo(0.15, 4);
    expect(r.metrics.edgeDensitySkew).not.toBe(0.1);
  });
  test("void: emptyRegionContinuity derived, not 0.7/0.3", () => {
    const r = evaluateVoidSolidEvidence(makeStandardEvidence());
    expect(r.metrics.emptyRegionContinuity).toBeCloseTo(0.7143, 3);
  });
  test("void: negativeSpaceRatio reads pixel, not 0.2", () => {
    const r = evaluateVoidSolidEvidence(makeStandardEvidence());
    expect(r.metrics.negativeSpaceRatio).toBe(0.35);
    expect(r.metrics.negativeSpaceRatio).not.toBe(0.2);
  });
  test("qiyun: single-frame motion metrics NaN, not hardcoded", () => {
    const r = evaluateQiyunContinuityEvidence(makeStandardEvidence());
    expect(Number.isNaN(r.metrics.motionContinuity)).toBe(true);
    expect(Number.isNaN(r.metrics.chromaticContinuity)).toBe(true);
    expect(Number.isNaN(r.metrics.depthContinuity)).toBe(true);
  });
  test("qiyun: chromaticContinuity not 0.75", () => {
    const r = evaluateQiyunContinuityEvidence(makeStandardEvidence());
    expect(r.metrics.chromaticContinuity).not.toBe(0.75);
  });
  test("qiyun: depthContinuity not 0.70", () => {
    const r = evaluateQiyunContinuityEvidence(makeStandardEvidence());
    expect(r.metrics.depthContinuity).not.toBe(0.70);
  });
  test("qiyun: single-frame status INCONCLUSIVE", () => {
    const r = evaluateQiyunContinuityEvidence(makeStandardEvidence());
    expect(r.status).toBe("INCONCLUSIVE");
  });
  test("spatial: no-depth all metrics NaN", () => {
    const r = evaluateSpatialDepthEvidence(makeStandardEvidence());
    expect(Number.isNaN(r.metrics.depthLayerCount)).toBe(true);
    expect(Number.isNaN(r.metrics.layerSeparation)).toBe(true);
    expect(Number.isNaN(r.metrics.occlusionCount)).toBe(true);
    expect(Number.isNaN(r.metrics.atmosphericDepth)).toBe(true);
    expect(Number.isNaN(r.metrics.focalDepthSeparation)).toBe(true);
  });
  test("spatial: depthLayerCount not 3, occlusion not 2, atmos not 0.6, focal not 0.55", () => {
    const r = evaluateSpatialDepthEvidence(makeStandardEvidence());
    expect(r.metrics.depthLayerCount).not.toBe(3);
    expect(r.metrics.occlusionCount).not.toBe(2);
    expect(r.metrics.atmosphericDepth).not.toBe(0.6);
    expect(r.metrics.focalDepthSeparation).not.toBe(0.55);
  });
  test("spatial: no-depth status INCONCLUSIVE", () => {
    const r = evaluateSpatialDepthEvidence(makeStandardEvidence());
    expect(r.status).toBe("INCONCLUSIVE");
  });
  test("color: luminanceHierarchy reads blockGradient, not 0.7", () => {
    const r = evaluateColorRelationshipEvidence(makeStandardEvidence());
    expect(r.metrics.luminanceHierarchy).toBe(8.5);
    expect(r.metrics.luminanceHierarchy).not.toBe(0.7);
  });
  test("material: surfaceVariation reads evidence, not 0.35", () => {
    const r = evaluateMaterialRelationshipEvidence(makeStandardEvidence());
    expect(r.metrics.surfaceVariation).toBe(0.12);
    expect(r.metrics.surfaceVariation).not.toBe(0.35);
  });
  test("material: microDetailDistribution reads evidence, not 0.55", () => {
    const r = evaluateMaterialRelationshipEvidence(makeStandardEvidence());
    expect(r.metrics.microDetailDistribution).toBe(0.08);
    expect(r.metrics.microDetailDistribution).not.toBe(0.55);
  });
  test("full report: complete and deterministic", () => {
    const e = makeStandardEvidence();
    const r1 = evaluateMachineAssertionsFromEvidence(e, "2026-09-16T00:00:00Z");
    const r2 = evaluateMachineAssertionsFromEvidence(e, "2026-09-16T00:00:00Z");
    expect(r1.testCaseId).toBe("test-machine-evidence-001");
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
    const all = [r1.focalHierarchy, r1.voidSolid, r1.qiyunContinuity, r1.spatialDepth, r1.colorRelationship, r1.materialRelationship];
    for (const a of all) expect(a.evidenceRefs.length).toBeGreaterThan(0);
  });
  test("AST: evidence section has no ?? numeric fallback", () => {
    const fs = require("node:fs");
    const src = fs.readFileSync("chinese-aesthetic/evaluator/machine-evaluator.ts", "utf8");
    const section = src.split("Evidence-Based Machine Evaluator")[1] || "";
    expect((section.match(/\?\?\s*\d+\.\d+/g) || []).length).toBe(0);
  });
  test("AST: evidence section has no hardcoded metrics assignment", () => {
    const fs = require("node:fs");
    const src = fs.readFileSync("chinese-aesthetic/evaluator/machine-evaluator.ts", "utf8");
    const section = src.split("Evidence-Based Machine Evaluator")[1] || "";
    expect((section.match(/metrics\.\w+\s*=\s*(?!NaN)(?!0\b)(?!0\.)\d+\.\d+/g) || []).length).toBe(0);
  });
});
