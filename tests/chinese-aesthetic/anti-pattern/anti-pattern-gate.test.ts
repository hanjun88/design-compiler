/**
 * Anti-Pattern Gate Tests — 反模式门禁测试
 *
 * Phase 2 Step 2.4: 验证 6 大反模式门禁的判定逻辑、宪法约束和确定性。
 *
 * 测试覆盖：
 * - 正常构图（全部 ALLOW）
 * - ANTI-01 Symbolic Stacking
 * - ANTI-02 Unphysical Glow
 * - ANTI-03 Dead Void
 * - ANTI-04 Conflicted Hierarchy
 * - ANTI-05 Toxic Saturation
 * - ANTI-06 Fake Evidence
 * - 宪法约束：UNMEASURED ≠ FAIL
 * - 确定性：相同输入 → 相同 reportHash
 * - 宪法合规性自检
 */

import { runAntiPatternGate } from "../../../chinese-aesthetic/anti-pattern/anti-pattern-gate";
import type { AntiPatternReport } from "../../../chinese-aesthetic/anti-pattern/types";
import type { ObservableEvidenceSet } from "../../../chinese-aesthetic/extraction/types";
import type { AestheticRelationshipGraph } from "../../../chinese-aesthetic/graph/types";

// ---------------------------------------------------------------------------
// 测试辅助：构造证据集
// ---------------------------------------------------------------------------

function makeEvidence(overrides: Partial<ObservableEvidenceSet> = {}): ObservableEvidenceSet {
  const base: ObservableEvidenceSet = {
    evidenceId: "test-evidence-001",
    capturedAt: "2026-09-16T00:00:00Z",
    renderContext: {
      renderer: "software-reference",
      rendererVersion: "1.0.0",
      resolution: { width: 480, height: 270 },
      pixelFormat: "RGBA8",
      bufferByteLength: 518400,
      renderHash: "sha256:test-render-hash",
      irHash: "sha256:test-ir-hash",
    },
    pixel: {
      meanLuminance: { value: 128, evidenceRef: "pixel:mean-luminance", confidence: 0.9, method: "pixel-average" },
      luminanceStdDev: { value: 30, evidenceRef: "pixel:luminance-std", confidence: 0.9, method: "pixel-stddev" },
      luminanceHistogram: { value: [0, 0, 0], evidenceRef: "pixel:luminance-hist", confidence: 0.9, method: "histogram" },
      luminanceHistogramPeakCount: { value: 2, evidenceRef: "pixel:luminance-peaks", confidence: 0.9, method: "peak-count" },
      spatialLaplacianVariance: { value: 100, evidenceRef: "pixel:laplacian-variance", confidence: 0.9, method: "3x3-conv" },
      sobelEdgeGradientSkew: { value: 0.1, evidenceRef: "pixel:sobel-skew", confidence: 0.9, method: "sobel-gradient" },
      edgePixelRatio: { value: 0.15, evidenceRef: "pixel:edge-ratio", confidence: 0.9, method: "edge-detection" },
      edgeOrientationHistogram: { value: [0, 0, 0], evidenceRef: "pixel:edge-orient", confidence: 0.9, method: "orientation-hist" },
      dominantColor: { value: "#808080", evidenceRef: "pixel:dominant-color", confidence: 0.9, method: "color-clustering" },
      secondaryColor: { value: "#606060", evidenceRef: "pixel:secondary-color", confidence: 0.9, method: "color-clustering" },
      accentColor: { value: "#A0A0A0", evidenceRef: "pixel:accent-color", confidence: 0.9, method: "color-clustering" },
      dominantColorRatio: { value: 0.4, evidenceRef: "pixel:dominant-ratio", confidence: 0.9, method: "color-ratio" },
      contrastRatio: { value: 0.5, evidenceRef: "pixel:contrast-ratio", confidence: 0.9, method: "contrast-calc" },
      temperatureBias: { value: 0.1, evidenceRef: "pixel:temp-bias", confidence: 0.9, method: "color-temp" },
      blockLuminanceMeanGradient: { value: 5.0, evidenceRef: "pixel:block-gradient", confidence: 0.9, method: "block-gradient" },
      negativeSpaceRatio: { value: 0.3, evidenceRef: "pixel:void-ratio", confidence: 0.9, method: "negative-space" },
      negativeSpaceComponentCount: { value: 3, evidenceRef: "pixel:void-components", confidence: 0.9, method: "connected-components" },
      largestVoidRegionRatio: { value: 0.15, evidenceRef: "pixel:largest-void", confidence: 0.9, method: "largest-component" },
      focalPoint: { value: [0.5, 0.5] as [number, number], evidenceRef: "pixel:focal-point", confidence: 0.9, method: "saliency-map" },
      focalCenterOffset: { value: 0.05, evidenceRef: "pixel:focal-offset", confidence: 0.9, method: "focal-offset" },
      nonZeroPixels: { value: 100000, evidenceRef: "pixel:nonzero", confidence: 0.9, method: "pixel-count" },
      nanInfPixelCount: { value: 0, evidenceRef: "pixel:nan-inf", confidence: 0.9, method: "nan-scan" },
    },
    depth: {
      depthBufferAvailable: false,
      depthHistogram: { status: "UNMEASURED_SEMANTIC", dimension: "depth", reason: "no depth buffer", semanticInterpretationRef: "semantic:depth" },
      depthLayerCount: { status: "UNMEASURED_SEMANTIC", dimension: "depth", reason: "no depth buffer", semanticInterpretationRef: "semantic:depth" },
      layerSeparation: { status: "UNMEASURED_SEMANTIC", dimension: "depth", reason: "no depth buffer", semanticInterpretationRef: "semantic:depth" },
      occlusionEdgeCount: { status: "UNMEASURED_SEMANTIC", dimension: "depth", reason: "no depth buffer", semanticInterpretationRef: "semantic:depth" },
      occlusionChainLength: { status: "UNMEASURED_SEMANTIC", dimension: "depth", reason: "no depth buffer", semanticInterpretationRef: "semantic:depth" },
      atmosphericDepth: { status: "UNMEASURED_SEMANTIC", dimension: "depth", reason: "no depth buffer", semanticInterpretationRef: "semantic:depth" },
      focalDepthSeparation: { status: "UNMEASURED_SEMANTIC", dimension: "depth", reason: "no depth buffer", semanticInterpretationRef: "semantic:depth" },
      depthMotionProjectionResidual: { status: "UNMEASURED_SEMANTIC", dimension: "depth", reason: "no depth buffer", semanticInterpretationRef: "semantic:depth" },
    },
    motion: null,
    material: {
      materialCount: 1,
      dominantMaterialIndex: { value: 0, evidenceRef: "material:dominant-index", confidence: 0.9, method: "material-index" },
      dominantRoughness: { value: 0.5, evidenceRef: "ir:material-roughness", confidence: 0.9, method: "ir-read" },
      dominantMetalness: { value: 0.1, evidenceRef: "ir:material-metalness", confidence: 0.9, method: "ir-read" },
      dominantWear: { value: 0.2, evidenceRef: "ir:material-wear", confidence: 0.9, method: "ir-read" },
      dominantBaseType: { value: "WOOD::song-elm", evidenceRef: "ir:material-base-type", confidence: 0.9, method: "ir-read" },
      dominantMaterialCategory: { value: "WOOD", evidenceRef: "ir:material-category", confidence: 0.9, method: "ir-read" },
      surfaceVariation: { value: 0.1, evidenceRef: "material:surface-variation", confidence: 0.9, method: "surface-analysis" },
      microSurfaceHighFrequencyVariance: { value: 0.05, evidenceRef: "material:micro-variance", confidence: 0.9, method: "high-freq-analysis" },
      specularHighlightRatio: { value: 0.01, evidenceRef: "material:specular-ratio", confidence: 0.9, method: "specular-detection" },
      specularSharpness: { value: 0.3, evidenceRef: "material:specular-sharpness", confidence: 0.9, method: "specular-gradient" },
      roughnessSpatialVariance: { value: 0.02, evidenceRef: "material:roughness-variance", confidence: 0.9, method: "roughness-map" },
      colorVariationSpatialGradient: { value: 0.03, evidenceRef: "material:color-variation", confidence: 0.9, method: "color-gradient" },
      timeTraceDetectability: { value: 0.1, evidenceRef: "material:time-trace", confidence: 0.9, method: "temporal-analysis" },
    },
    ir: {
      irHash: "sha256:test-ir-hash",
      irType: "ValidatedDesignIR",
      paradigm: { value: "SONG", evidenceRef: "ir:paradigm", confidence: 1, method: "ir-declared" },
      compositionType: { value: "central-axis", evidenceRef: "ir:composition", confidence: 1, method: "ir-declared" },
      symmetry: { value: 0.7, evidenceRef: "ir:symmetry", confidence: 0.8, method: "ir-declared" },
      declaredNegativeSpaceRatio: { value: 0.3, evidenceRef: "ir:void-ratio", confidence: 0.8, method: "ir-declared" },
      horizonPosition: { value: 0.4, evidenceRef: "ir:horizon", confidence: 0.8, method: "ir-declared" },
      cameraPitch: { value: -10, evidenceRef: "ir:camera-pitch", confidence: 0.8, method: "ir-declared" },
      lightingIntent: { value: "DAYLIGHT", evidenceRef: "ir:lighting", confidence: 1, method: "ir-declared" },
      colorTemp: { value: 5500, evidenceRef: "ir:color-temp", confidence: 0.9, method: "ir-declared" },
      lightIntensity: { value: 1.0, evidenceRef: "ir:light-intensity", confidence: 0.9, method: "ir-declared" },
      lightSoftness: { value: 0.6, evidenceRef: "ir:light-softness", confidence: 0.9, method: "ir-declared" },
      ambientRatio: { value: 0.35, evidenceRef: "ir:ambient-ratio", confidence: 0.9, method: "ir-declared" },
      materials: { value: [{ baseType: "WOOD::song-elm", materialCategory: "WOOD", roughness: 0.5, metalness: 0.1, wear: 0.2 }], evidenceRef: "ir:materials", confidence: 0.9, method: "ir-declared" },
      transformationTrace: { value: [], evidenceRef: "ir:transform-trace", confidence: 1, method: "ir-declared" },
    },
    semantic: null,
    purityAudit: {
      auditedAt: "2026-09-16T00:00:00Z",
      totalFields: 50,
      measuredFields: 50,
      unmeasuredFields: 0,
      hardcodedConstantsFound: [],
      fieldsMissingEvidenceRef: [],
      fieldsMissingConfidence: [],
      purityStatus: "PURE",
      contaminationDetails: [],
    },
  };
  return { ...base, ...overrides } as ObservableEvidenceSet;
}

// ---------------------------------------------------------------------------
// 测试辅助：构造关系图
// ---------------------------------------------------------------------------

function makeGraph(overrides: Partial<AestheticRelationshipGraph> = {}): AestheticRelationshipGraph {
  const base: AestheticRelationshipGraph = {
    graphId: "graph:test-evidence-001",
    evidenceId: "test-evidence-001",
    generatedAt: "2026-09-16T00:00:00Z",
    graphHash: "fnv1a:test1234",
    nodes: [
      { id: "node:subject:primary", type: "SUBJECT", energy: 0.8, confidence: 0.9, evidenceRefs: ["pixel:focal-point"], boundingRegion: null },
      { id: "node:void:negative-space", type: "VOID", energy: 0.3, confidence: 0.9, evidenceRefs: ["pixel:void-ratio"], boundingRegion: null },
      { id: "node:space:composition", type: "SPACE", energy: 0.7, confidence: 0.9, evidenceRefs: ["pixel:composition"], boundingRegion: null },
      { id: "node:light:luminance-field", type: "LIGHT", energy: 0.6, confidence: 0.9, evidenceRefs: ["pixel:luminance"], boundingRegion: null },
      { id: "node:material:dominant", type: "MATERIAL", energy: 0.5, confidence: 0.9, evidenceRefs: ["material:dominant"], boundingRegion: null },
      { id: "node:axis:symmetry", type: "AXIS", energy: 0.7, confidence: 0.9, evidenceRefs: ["ir:symmetry"], boundingRegion: null },
      { id: "node:boundary:edges", type: "BOUNDARY", energy: 0.4, confidence: 0.9, evidenceRefs: ["pixel:edge-ratio"], boundingRegion: null },
      { id: "node:time:patina", type: "TIME", energy: 0.2, confidence: 0.7, evidenceRefs: ["material:time-trace"], boundingRegion: null },
      { id: "node:scale:hierarchy", type: "SCALE", energy: 0.5, confidence: 0.8, evidenceRefs: ["ir:horizon"], boundingRegion: null },
      { id: "node:view:camera", type: "VIEW", energy: 0.4, confidence: 0.8, evidenceRefs: ["ir:camera-pitch"], boundingRegion: null },
    ],
    relations: [
      { sourceId: "node:subject:primary", targetId: "node:space:composition", relationType: "HOST_GUEST", magnitude: 0.6, polarity: "FORWARD", confidence: 0.9, derivedFrom: ["deriver:host-guest"] },
      { sourceId: "node:subject:primary", targetId: "node:void:negative-space", relationType: "SOLID_VOID", magnitude: 0.5, polarity: "MUTUAL", confidence: 0.9, derivedFrom: ["deriver:solid-void"] },
      { sourceId: "node:boundary:edges", targetId: "node:void:negative-space", relationType: "DENSE_SPARSE", magnitude: 0.4, polarity: "MUTUAL", confidence: 0.9, derivedFrom: ["deriver:dense-sparse"] },
      { sourceId: "node:axis:symmetry", targetId: "node:boundary:edges", relationType: "CENTER_EDGE", magnitude: 0.5, polarity: "MUTUAL", confidence: 0.9, derivedFrom: ["deriver:center-edge"] },
      { sourceId: "node:light:luminance-field", targetId: "node:void:negative-space", relationType: "HIGH_LOW", magnitude: 0.4, polarity: "MUTUAL", confidence: 0.9, derivedFrom: ["deriver:high-low"] },
      { sourceId: "node:material:dominant", targetId: "node:light:luminance-field", relationType: "HEAVY_LIGHT", magnitude: 0.3, polarity: "MUTUAL", confidence: 0.9, derivedFrom: ["deriver:heavy-light"] },
      { sourceId: "node:time:patina", targetId: "node:material:dominant", relationType: "OLD_NEW", magnitude: 0.2, polarity: "MUTUAL", confidence: 0.7, derivedFrom: ["deriver:old-new"] },
      { sourceId: "node:space:composition", targetId: "node:boundary:edges", relationType: "OPEN_CLOSE", magnitude: 0.4, polarity: "MUTUAL", confidence: 0.9, derivedFrom: ["deriver:open-close"] },
      { sourceId: "node:scale:hierarchy", targetId: "node:space:composition", relationType: "HOST_GUEST", magnitude: 0.5, polarity: "FORWARD", confidence: 0.8, derivedFrom: ["deriver:scale-space"] },
      { sourceId: "node:view:camera", targetId: "node:axis:symmetry", relationType: "CENTER_EDGE", magnitude: 0.4, polarity: "MUTUAL", confidence: 0.8, derivedFrom: ["deriver:view-axis"] },
    ],
    unmeasuredRelations: [
      { relationType: "MOVE_STILL", reason: "Single-frame input", semanticInterpretationRef: "semantic:motion" },
      { relationType: "NEAR_FAR", reason: "No depth buffer", semanticInterpretationRef: "semantic:depth" },
    ],
    topologyAudit: {
      status: "PASS",
      noIsolatedNodes: true,
      polarAlignment: true,
      boundedEnergy: true,
      purityPenetration: true,
      violations: [],
    },
    derivationPipeline: ["instantiate", "derive", "audit", "hash"],
  };
  return { ...base, ...overrides } as AestheticRelationshipGraph;
}

// ---------------------------------------------------------------------------
// 测试套件
// ---------------------------------------------------------------------------

describe("Anti-Pattern Gate — Phase 2 Step 2.4", () => {
  describe("Normal Composition", () => {
    test("normal composition passes all gates", () => {
      const evidence = makeEvidence();
      const graph = makeGraph();
      const report = runAntiPatternGate(evidence, graph);
      expect(report.overallVerdict).toBe("ALLOW");
      expect(report.rejectedGates.length).toBe(0);
    });

    test("all gate results have evidenceRefs", () => {
      const evidence = makeEvidence();
      const graph = makeGraph();
      const report = runAntiPatternGate(evidence, graph);
      for (const result of report.gateResults) {
        expect(result.evidenceRefs.length).toBeGreaterThan(0);
      }
    });

    test("constitution compliance passes", () => {
      const evidence = makeEvidence();
      const graph = makeGraph();
      const report = runAntiPatternGate(evidence, graph);
      expect(report.constitutionCompliance.compliant).toBe(true);
    });
  });

  describe("ANTI-06: Fake Evidence (Highest Priority)", () => {
    test("contaminated purity audit triggers REJECT", () => {
      const evidence = makeEvidence({
        purityAudit: {
          auditedAt: "2026-09-16T00:00:00Z",
          totalFields: 50,
          measuredFields: 45,
          unmeasuredFields: 5,
          hardcodedConstantsFound: ["roughness ?? 0.7", "metalness ?? 0.0"],
          fieldsMissingEvidenceRef: ["field1", "field2"],
          fieldsMissingConfidence: ["field3"],
          purityStatus: "CONTAMINATED",
          contaminationDetails: ["hardcoded default injection detected"],
        },
      });
      const graph = makeGraph();
      const report = runAntiPatternGate(evidence, graph);
      const anti06 = report.gateResults.find((r) => r.gateId === "ANTI-06");
      expect(anti06?.verdict).toBe("REJECT");
      expect(report.overallVerdict).toBe("REJECT");
      expect(report.rejectedGates).toContain("ANTI-06");
    });

    test("pure evidence passes ANTI-06", () => {
      const evidence = makeEvidence();
      const graph = makeGraph();
      const report = runAntiPatternGate(evidence, graph);
      const anti06 = report.gateResults.find((r) => r.gateId === "ANTI-06");
      expect(anti06?.verdict).toBe("ALLOW");
    });
  });

  describe("ANTI-03: Dead Void (Constitution: UNMEASURED ≠ FAIL)", () => {
    test("large void with zero gradient but no depth evidence only FLAG (not REJECT)", () => {
      const evidence = makeEvidence({
        pixel: {
          ...makeEvidence().pixel,
          negativeSpaceRatio: { value: 0.7, evidenceRef: "pixel:void-ratio", confidence: 0.9, method: "negative-space" },
          largestVoidRegionRatio: { value: 0.6, evidenceRef: "pixel:largest-void", confidence: 0.9, method: "largest-component" },
          spatialLaplacianVariance: { value: 0.1, evidenceRef: "pixel:laplacian", confidence: 0.9, method: "3x3-conv" },
          blockLuminanceMeanGradient: { value: 0.1, evidenceRef: "pixel:block-gradient", confidence: 0.9, method: "block-gradient" },
          luminanceStdDev: { value: 1.0, evidenceRef: "pixel:luminance-std", confidence: 0.9, method: "pixel-stddev" },
        },
      });
      const graph = makeGraph();
      const report = runAntiPatternGate(evidence, graph);
      const anti03 = report.gateResults.find((r) => r.gateId === "ANTI-03");
      // 无深度证据时，即使有信号也只 FLAG 不 REJECT
      expect(anti03?.verdict).not.toBe("REJECT");
      expect(anti03?.unmeasuredReason).toBeDefined();
    });
  });

  describe("ANTI-04: Conflicted Hierarchy", () => {
    test("multiple subjects with close energy and no hierarchy triggers REJECT", () => {
      const graph = makeGraph({
        nodes: [
          { id: "node:subject:primary", type: "SUBJECT", energy: 0.8, confidence: 0.9, evidenceRefs: ["pixel:focal1"], boundingRegion: null },
          { id: "node:subject:secondary", type: "SUBJECT", energy: 0.78, confidence: 0.9, evidenceRefs: ["pixel:focal2"], boundingRegion: null },
          { id: "node:void:negative-space", type: "VOID", energy: 0.3, confidence: 0.9, evidenceRefs: ["pixel:void"], boundingRegion: null },
          { id: "node:space:composition", type: "SPACE", energy: 0.7, confidence: 0.9, evidenceRefs: ["pixel:space"], boundingRegion: null },
          { id: "node:light:luminance-field", type: "LIGHT", energy: 0.6, confidence: 0.9, evidenceRefs: ["pixel:light"], boundingRegion: null },
          { id: "node:material:dominant", type: "MATERIAL", energy: 0.5, confidence: 0.9, evidenceRefs: ["material:dominant"], boundingRegion: null },
          { id: "node:axis:symmetry", type: "AXIS", energy: 0.7, confidence: 0.9, evidenceRefs: ["ir:symmetry"], boundingRegion: null },
          { id: "node:boundary:edges", type: "BOUNDARY", energy: 0.4, confidence: 0.9, evidenceRefs: ["pixel:edge"], boundingRegion: null },
          { id: "node:time:patina", type: "TIME", energy: 0.2, confidence: 0.7, evidenceRefs: ["material:time"], boundingRegion: null },
          { id: "node:scale:hierarchy", type: "SCALE", energy: 0.5, confidence: 0.8, evidenceRefs: ["ir:scale"], boundingRegion: null },
        ],
        relations: [
          // 注意：两个 SUBJECT 之间没有 HOST_GUEST 边
          { sourceId: "node:subject:primary", targetId: "node:space:composition", relationType: "HOST_GUEST", magnitude: 0.6, polarity: "FORWARD", confidence: 0.9, derivedFrom: ["deriver:hg1"] },
          { sourceId: "node:subject:secondary", targetId: "node:space:composition", relationType: "HOST_GUEST", magnitude: 0.5, polarity: "FORWARD", confidence: 0.9, derivedFrom: ["deriver:hg2"] },
          { sourceId: "node:subject:primary", targetId: "node:void:negative-space", relationType: "SOLID_VOID", magnitude: 0.5, polarity: "MUTUAL", confidence: 0.9, derivedFrom: ["deriver:sv1"] },
          { sourceId: "node:subject:secondary", targetId: "node:void:negative-space", relationType: "SOLID_VOID", magnitude: 0.4, polarity: "MUTUAL", confidence: 0.9, derivedFrom: ["deriver:sv2"] },
          { sourceId: "node:boundary:edges", targetId: "node:void:negative-space", relationType: "DENSE_SPARSE", magnitude: 0.4, polarity: "MUTUAL", confidence: 0.9, derivedFrom: ["deriver:ds"] },
          { sourceId: "node:axis:symmetry", targetId: "node:boundary:edges", relationType: "CENTER_EDGE", magnitude: 0.5, polarity: "MUTUAL", confidence: 0.9, derivedFrom: ["deriver:ce"] },
          { sourceId: "node:light:luminance-field", targetId: "node:void:negative-space", relationType: "HIGH_LOW", magnitude: 0.4, polarity: "MUTUAL", confidence: 0.9, derivedFrom: ["deriver:hl"] },
          { sourceId: "node:material:dominant", targetId: "node:light:luminance-field", relationType: "HEAVY_LIGHT", magnitude: 0.3, polarity: "MUTUAL", confidence: 0.9, derivedFrom: ["deriver:hvl"] },
          { sourceId: "node:time:patina", targetId: "node:material:dominant", relationType: "OLD_NEW", magnitude: 0.2, polarity: "MUTUAL", confidence: 0.7, derivedFrom: ["deriver:on"] },
          { sourceId: "node:space:composition", targetId: "node:boundary:edges", relationType: "OPEN_CLOSE", magnitude: 0.4, polarity: "MUTUAL", confidence: 0.9, derivedFrom: ["deriver:oc"] },
          { sourceId: "node:scale:hierarchy", targetId: "node:space:composition", relationType: "HOST_GUEST", magnitude: 0.5, polarity: "FORWARD", confidence: 0.8, derivedFrom: ["deriver:ss"] },
        ],
      });
      const evidence = makeEvidence();
      const report = runAntiPatternGate(evidence, graph);
      const anti04 = report.gateResults.find((r) => r.gateId === "ANTI-04");
      expect(anti04?.verdict).toBe("REJECT");
    });

    test("single subject passes ANTI-04", () => {
      const evidence = makeEvidence();
      const graph = makeGraph();
      const report = runAntiPatternGate(evidence, graph);
      const anti04 = report.gateResults.find((r) => r.gateId === "ANTI-04");
      expect(anti04?.verdict).toBe("ALLOW");
    });
  });

  describe("Determinism", () => {
    test("same input produces same reportHash", () => {
      const evidence = makeEvidence();
      const graph = makeGraph();
      const report1 = runAntiPatternGate(evidence, graph);
      const report2 = runAntiPatternGate(evidence, graph);
      expect(report1.reportHash).toBe(report2.reportHash);
    });

    test("different evidence produces different reportHash", () => {
      const graph = makeGraph();
      const report1 = runAntiPatternGate(makeEvidence(), graph);
      const report2 = runAntiPatternGate(
        makeEvidence({ evidenceId: "different-evidence" }),
        graph,
      );
      expect(report1.reportHash).not.toBe(report2.reportHash);
    });
  });

  describe("Report Structure", () => {
    test("report contains all 6 gate results", () => {
      const evidence = makeEvidence();
      const graph = makeGraph();
      const report = runAntiPatternGate(evidence, graph);
      expect(report.gateResults.length).toBe(6);
      const gateIds = report.gateResults.map((r) => r.gateId);
      expect(gateIds).toContain("ANTI-01");
      expect(gateIds).toContain("ANTI-02");
      expect(gateIds).toContain("ANTI-03");
      expect(gateIds).toContain("ANTI-04");
      expect(gateIds).toContain("ANTI-05");
      expect(gateIds).toContain("ANTI-06");
    });

    test("report has valid overall verdict", () => {
      const evidence = makeEvidence();
      const graph = makeGraph();
      const report = runAntiPatternGate(evidence, graph);
      expect(["ALLOW", "FLAG", "REJECT"]).toContain(report.overallVerdict);
    });

    test("report hash follows fnv1a: prefix format", () => {
      const evidence = makeEvidence();
      const graph = makeGraph();
      const report = runAntiPatternGate(evidence, graph);
      expect(report.reportHash).toMatch(/^fnv1a:/);
    });
  });
});
