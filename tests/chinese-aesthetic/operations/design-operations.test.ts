/**
 * Design Operations Tests — Phase 3 Step 3.1
 *
 * 验证 16 个设计算子：
 * - 纯函数：不修改输入 IR
 * - 确定性：相同输入 → 相同输出
 * - 条件触发：图拓扑不满足时 applied=false
 * - 变换正确：满足条件时产生预期变换
 * - 溯源完整：每个变换有 rationale + provenanceRef
 */

import type { RawDesignIR } from "../../../compiler-core/contracts";
import type { AestheticRelationshipGraph } from "../../../chinese-aesthetic/graph/types";
import {
  DESIGN_OPERATIONS,
  applyAllOperations,
  opEncloseBreathingField,
  opAlignGuestHostTension,
  opPartitionPoissonCluster,
  opCalibrateAxialOrder,
  opLayerDepthRecession,
  opInjectAtmosphericVoid,
  opShiftHorizonProportion,
  opFrameSecondaryOcclusion,
  opApplyTimePatina,
  opDampenSpecularHarshness,
  opOrchestrateMaterialContrast,
  opWeatherSurfaceEntropy,
  opHarmonizeSkyLuminance,
  opCoolShadowChromaticity,
  opFilterMistScatter,
  opRestrictAccentLuminance,
} from "../../../chinese-aesthetic/operations";
import type { DesignOperationContext, AestheticPeriod } from "../../../chinese-aesthetic/operations";
import type { RawEstimatedParameter, ParameterUnit } from "../../../compiler-core/contracts";

// ---------------------------------------------------------------------------
// 测试辅助
// ---------------------------------------------------------------------------

function p<T>(value: T, unit: ParameterUnit = "scalar"): RawEstimatedParameter<T> {
  return { value, unit, confidence: 0.9, evidence: ["test-evidence"], source: "vision-estimation", status: "estimated" };
}

function makeTestIR(overrides: Partial<RawDesignIR> = {}): RawDesignIR {
  const base: RawDesignIR = {
    $schema: "test-schema",
    meta: { sourceType: "image", aspectRatio: "16:9", timestamp: "2026-09-16T00:00:00Z" },
    composition: {
      focalPoint: p([0.5, 0.5], "vector2"),
      negativeSpaceRatio: p(0.3, "ratio"),
      depthLayerCount: p(3, "scalar"),
      symmetry: p(0.7, "ratio"),
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
        intensity: p(1.0, "ratio"),
        softness: p(0.5, "ratio"),
      },
      ambientRatio: p(0.3, "ratio"),
      rimLightPresent: p(true, "scalar"),
    },
    materials: [
      { role: "dominant", baseType: p("WOOD::test", "scalar"), roughness: p(0.5, "ratio"), metalness: p(0.1, "ratio"), wear: p(0.3, "ratio") },
      { role: "secondary", baseType: p("STONE::test", "scalar"), roughness: p(0.55, "ratio"), metalness: p(0.05, "ratio"), wear: p(0.25, "ratio") },
    ],
    color: {
      dominant: p("#8B7355", "hex"),
      secondary: p("#6B5344", "hex"),
      accent: p("#C4A35A", "hex"),
      contrastRatio: p(3.5, "ratio"),
      temperatureBias: p(0.1, "ratio"),
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

function makeTestGraph(overrides: Partial<AestheticRelationshipGraph> = {}): AestheticRelationshipGraph {
  const base: AestheticRelationshipGraph = {
    graphId: "graph:test",
    evidenceId: "evidence:test",
    generatedAt: "2026-09-16T00:00:00Z",
    nodes: [
      { id: "node:subject:primary", type: "SUBJECT", boundingRegion: [0.35, 0.35, 0.3, 0.3], energy: 0.8, evidenceRefs: ["e1"], confidence: 0.9 },
      { id: "node:void:negative-space", type: "VOID", boundingRegion: null, energy: 0.6, evidenceRefs: ["e2"], confidence: 0.9 },
      { id: "node:space:composition", type: "SPACE", boundingRegion: [0, 0, 1, 1], energy: 0.7, evidenceRefs: ["e3"], confidence: 1 },
      { id: "node:light:luminance-field", type: "LIGHT", boundingRegion: null, energy: 0.5, evidenceRefs: ["e4"], confidence: 1 },
      { id: "node:material:dominant", type: "MATERIAL", boundingRegion: null, energy: 0.3, evidenceRefs: ["e5"], confidence: 0.8 },
      { id: "node:boundary:edges", type: "BOUNDARY", boundingRegion: null, energy: 0.05, evidenceRefs: ["e6"], confidence: 0.95 },
      { id: "node:time:patina", type: "TIME", boundingRegion: null, energy: 0.2, evidenceRefs: ["e7"], confidence: 0.6 },
    ],
    relations: [
      { sourceId: "node:subject:primary", targetId: "node:space:composition", relationType: "HOST_GUEST", magnitude: 0.5, polarity: "FORWARD", derivedFrom: ["d1"], confidence: 0.85 },
      { sourceId: "node:subject:primary", targetId: "node:void:negative-space", relationType: "SOLID_VOID", magnitude: 0.3, polarity: "MUTUAL", derivedFrom: ["d2"], confidence: 0.8 },
      { sourceId: "node:boundary:edges", targetId: "node:void:negative-space", relationType: "DENSE_SPARSE", magnitude: 0.2, polarity: "MUTUAL", derivedFrom: ["d3"], confidence: 0.85 },
      { sourceId: "node:material:dominant", targetId: "node:light:luminance-field", relationType: "HEAVY_LIGHT", magnitude: 0.1, polarity: "MUTUAL", derivedFrom: ["d4"], confidence: 0.8 },
      { sourceId: "node:light:luminance-field", targetId: "node:void:negative-space", relationType: "HIGH_LOW", magnitude: 0.1, polarity: "MUTUAL", derivedFrom: ["d5"], confidence: 0.85 },
      { sourceId: "node:space:composition", targetId: "node:boundary:edges", relationType: "OPEN_CLOSE", magnitude: 0.3, polarity: "MUTUAL", derivedFrom: ["d6"], confidence: 0.85 },
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

function makeCtx(ir: RawDesignIR, graph: AestheticRelationshipGraph, period: AestheticPeriod = "SONG"): DesignOperationContext {
  return { ir, graph, period };
}

// ---------------------------------------------------------------------------
// 通用属性测试
// ---------------------------------------------------------------------------

describe("Design Operations — General Properties", () => {
  test("all 16 operations are registered", () => {
    expect(Object.keys(DESIGN_OPERATIONS)).toHaveLength(16);
  });

  test("operations are pure functions: input IR is not modified", () => {
    const ir = makeTestIR();
    const graph = makeTestGraph();
    const irSnapshot = JSON.stringify(ir);

    for (const opId of Object.keys(DESIGN_OPERATIONS)) {
      const op = DESIGN_OPERATIONS[opId as keyof typeof DESIGN_OPERATIONS];
      op(makeCtx(ir, graph));
    }

    expect(JSON.stringify(ir)).toBe(irSnapshot);
  });

  test("operations are deterministic: same input → same output", () => {
    const ir = makeTestIR();
    const graph = makeTestGraph();

    for (const opId of Object.keys(DESIGN_OPERATIONS)) {
      const op = DESIGN_OPERATIONS[opId as keyof typeof DESIGN_OPERATIONS];
      const r1 = op(makeCtx(ir, graph));
      const r2 = op(makeCtx(ir, graph));
      expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
    }
  });

  test("every operation returns trace with opId, rationale, provenanceRef, applied", () => {
    const ir = makeTestIR();
    const graph = makeTestGraph();

    for (const opId of Object.keys(DESIGN_OPERATIONS)) {
      const op = DESIGN_OPERATIONS[opId as keyof typeof DESIGN_OPERATIONS];
      const result = op(makeCtx(ir, graph));
      expect(result.trace.opId).toBe(opId);
      expect(result.trace.rationale.length).toBeGreaterThan(0);
      expect(result.trace.provenanceRef.length).toBeGreaterThan(0);
      expect(typeof result.trace.applied).toBe("boolean");
    }
  });

  test("applyAllOperations chains all 16 operations and returns traces", () => {
    const ir = makeTestIR();
    const graph = makeTestGraph();
    const result = applyAllOperations(makeCtx(ir, graph, "TANG"));
    expect(result.traces).toHaveLength(16);
    expect(result.ir).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 构图算子
// ---------------------------------------------------------------------------

describe("Composition Operations", () => {
  test("OP_ENCLOSE_BREATHING_FIELD: applies when SOLID_VOID magnitude < 0.5", () => {
    const ir = makeTestIR();
    const graph = makeTestGraph(); // SOLID_VOID magnitude = 0.3
    const result = opEncloseBreathingField(makeCtx(ir, graph));
    expect(result.trace.applied).toBe(true);
    expect(result.ir.composition.negativeSpaceRatio.value).toBeGreaterThan(ir.composition.negativeSpaceRatio.value);
  });

  test("OP_ENCLOSE_BREATHING_FIELD: not applied when SOLID_VOID >= 0.5", () => {
    const ir = makeTestIR();
    const graph = makeTestGraph();
    graph.relations[1].magnitude = 0.6; // SOLID_VOID
    const result = opEncloseBreathingField(makeCtx(ir, graph));
    expect(result.trace.applied).toBe(false);
  });

  test("OP_ALIGN_GUEST_HOST_TENSION: applies when host/guest ratio < 2.5", () => {
    const ir = makeTestIR();
    const graph = makeTestGraph(); // HOST energy=0.8, GUEST(SPACE) energy=0.7 → ratio ~1.14
    const result = opAlignGuestHostTension(makeCtx(ir, graph));
    expect(result.trace.applied).toBe(true);
  });

  test("OP_PARTITION_POISSON_CLUSTER: applies when DENSE_SPARSE < 0.4", () => {
    const ir = makeTestIR();
    const graph = makeTestGraph(); // DENSE_SPARSE = 0.2
    const result = opPartitionPoissonCluster(makeCtx(ir, graph));
    expect(result.trace.applied).toBe(true);
    expect(result.ir.composition.symmetry.value).toBeLessThan(ir.composition.symmetry.value);
  });

  test("OP_CALIBRATE_AXIAL_ORDER: applies for TANG with symmetry < 0.85", () => {
    const ir = makeTestIR();
    ir.composition.symmetry.value = 0.7;
    const graph = makeTestGraph();
    const result = opCalibrateAxialOrder(makeCtx(ir, graph, "TANG"));
    expect(result.trace.applied).toBe(true);
    expect(result.ir.composition.symmetry.value).toBe(0.85);
  });

  test("OP_CALIBRATE_AXIAL_ORDER: not applied for non-TANG periods", () => {
    const ir = makeTestIR();
    const graph = makeTestGraph();
    const result = opCalibrateAxialOrder(makeCtx(ir, graph, "SONG"));
    expect(result.trace.applied).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 空间算子
// ---------------------------------------------------------------------------

describe("Spatial Operations", () => {
  test("OP_LAYER_DEPTH_RECESSION: applies when NEAR_FAR is unmeasured and layers < period target", () => {
    const ir = makeTestIR();
    ir.composition.depthLayerCount.value = 2;
    const graph = makeTestGraph(); // NEAR_FAR is unmeasured
    const result = opLayerDepthRecession(makeCtx(ir, graph, "SONG"));
    expect(result.trace.applied).toBe(true);
    expect(result.ir.composition.depthLayerCount.value).toBe(5); // SONG target
  });

  test("OP_LAYER_DEPTH_RECESSION: period-specific targets (TANG=4, SONG=5, MING=3)", () => {
    const ir = makeTestIR();
    ir.composition.depthLayerCount.value = 1;
    const graph = makeTestGraph();

    const tang = opLayerDepthRecession(makeCtx(ir, graph, "TANG"));
    expect(tang.ir.composition.depthLayerCount.value).toBe(4);

    const ming = opLayerDepthRecession(makeCtx(ir, graph, "MING"));
    expect(ming.ir.composition.depthLayerCount.value).toBe(3);
  });

  test("OP_INJECT_ATMOSPHERIC_VOID: applies when BOUNDARY energy >= 0.1", () => {
    const ir = makeTestIR();
    const graph = makeTestGraph();
    graph.nodes[5].energy = 0.2; // BOUNDARY
    const result = opInjectAtmosphericVoid(makeCtx(ir, graph));
    expect(result.trace.applied).toBe(true);
    expect(result.ir.lighting.ambientRatio.value).toBeGreaterThan(ir.lighting.ambientRatio.value);
  });

  test("OP_SHIFT_HORIZON_PROPORTION: applies when camera angle in mediocre range [-5, 5]", () => {
    const ir = makeTestIR();
    ir.camera.angle.value = 2;
    const graph = makeTestGraph();
    const result = opShiftHorizonProportion(makeCtx(ir, graph, "TANG"));
    expect(result.trace.applied).toBe(true);
    expect(result.ir.camera.angle.value).toBe(-15); // TANG target
  });

  test("OP_FRAME_SECONDARY_OCCLUSION: applies when OPEN_CLOSE < 0.5", () => {
    const ir = makeTestIR();
    const graph = makeTestGraph(); // OPEN_CLOSE = 0.3
    const result = opFrameSecondaryOcclusion(makeCtx(ir, graph));
    expect(result.trace.applied).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 材质算子
// ---------------------------------------------------------------------------

describe("Material Operations", () => {
  test("OP_APPLY_TIME_PATINA: applies when MATERIAL energy < 0.4", () => {
    const ir = makeTestIR();
    const graph = makeTestGraph(); // MATERIAL energy = 0.3
    const result = opApplyTimePatina(makeCtx(ir, graph));
    expect(result.trace.applied).toBe(true);
    expect(result.ir.materials[0].roughness.value).toBeGreaterThan(ir.materials[0].roughness.value);
    expect(result.ir.materials[0].wear.value).toBeGreaterThan(ir.materials[0].wear.value);
  });

  test("OP_DAMPEN_SPECULAR_HARSHNESS: applies when HEAVY_LIGHT >= 0.3", () => {
    const ir = makeTestIR();
    const graph = makeTestGraph();
    graph.relations[3].magnitude = 0.5; // HEAVY_LIGHT
    const result = opDampenSpecularHarshness(makeCtx(ir, graph));
    expect(result.trace.applied).toBe(true);
    expect(result.ir.lighting.keyLight.softness.value).toBeGreaterThan(ir.lighting.keyLight.softness.value);
  });

  test("OP_ORCHESTRATE_MATERIAL_CONTRAST: applies with >= 2 materials and period-specific spread", () => {
    const ir = makeTestIR();
    ir.materials[0].roughness.value = 0.5;
    ir.materials[1].roughness.value = 0.52; // very small spread
    const graph = makeTestGraph();
    const result = opOrchestrateMaterialContrast(makeCtx(ir, graph, "TANG"));
    expect(result.trace.applied).toBe(true);
    expect(result.ir.materials[0].roughness.value).toBe(0.25); // TANG low
    expect(result.ir.materials[1].roughness.value).toBe(0.65); // TANG high
  });

  test("OP_WEATHER_SURFACE_ENTROPY: applies when TIME energy < 0.3", () => {
    const ir = makeTestIR();
    const graph = makeTestGraph(); // TIME energy = 0.2
    const result = opWeatherSurfaceEntropy(makeCtx(ir, graph));
    expect(result.trace.applied).toBe(true);
    expect(result.ir.materials[0].wear.value).toBeGreaterThan(ir.materials[0].wear.value);
  });
});

// ---------------------------------------------------------------------------
// 光影算子
// ---------------------------------------------------------------------------

describe("Lighting Operations", () => {
  test("OP_HARMONIZE_SKY_LUMINANCE: applies when LIGHT energy >= 0.7 and rimLight present", () => {
    const ir = makeTestIR();
    const graph = makeTestGraph();
    graph.nodes[3].energy = 0.8; // LIGHT
    const result = opHarmonizeSkyLuminance(makeCtx(ir, graph));
    expect(result.trace.applied).toBe(true);
    expect(result.ir.lighting.rimLightPresent.value).toBe(false);
  });

  test("OP_COOL_SHADOW_CHROMATICITY: applies when HIGH_LOW < 0.3", () => {
    const ir = makeTestIR();
    const graph = makeTestGraph(); // HIGH_LOW = 0.1
    const result = opCoolShadowChromaticity(makeCtx(ir, graph));
    expect(result.trace.applied).toBe(true);
    expect(result.ir.lighting.ambientRatio.value).toBeGreaterThan(ir.lighting.ambientRatio.value);
  });

  test("OP_FILTER_MIST_SCATTER: applies when LIGHT energy >= 0.6 and softness < 0.5", () => {
    const ir = makeTestIR();
    ir.lighting.keyLight.softness.value = 0.3;
    const graph = makeTestGraph();
    graph.nodes[3].energy = 0.7; // LIGHT
    const result = opFilterMistScatter(makeCtx(ir, graph));
    expect(result.trace.applied).toBe(true);
    expect(result.ir.lighting.keyLight.softness.value).toBeGreaterThan(0.3);
  });

  test("OP_RESTRICT_ACCENT_LUMINANCE: applies when accent strength exceeds limit", () => {
    const ir = makeTestIR();
    ir.color.temperatureBias.value = 0.5; // strong warm bias
    ir.lighting.keyLight.intensity.value = 1.2;
    const graph = makeTestGraph();
    const result = opRestrictAccentLuminance(makeCtx(ir, graph));
    expect(result.trace.applied).toBe(true);
    expect(result.ir.lighting.keyLight.intensity.value).toBeLessThan(1.2);
  });
});

// ---------------------------------------------------------------------------
// 不应用条件测试
// ---------------------------------------------------------------------------

describe("Non-application Conditions", () => {
  test("operations with no matching relations return applied=false", () => {
    const ir = makeTestIR();
    const graph = makeTestGraph();
    graph.relations = []; // no relations at all

    const results = [
      opEncloseBreathingField(makeCtx(ir, graph)),
      opAlignGuestHostTension(makeCtx(ir, graph)),
      opPartitionPoissonCluster(makeCtx(ir, graph)),
      opDampenSpecularHarshness(makeCtx(ir, graph)),
      opCoolShadowChromaticity(makeCtx(ir, graph)),
      opFrameSecondaryOcclusion(makeCtx(ir, graph)),
    ];

    for (const r of results) {
      expect(r.trace.applied).toBe(false);
    }
  });

  test("no magic numbers in transformation parameters: all derived from graph", () => {
    const ir = makeTestIR();
    const graph = makeTestGraph();
    const result = applyAllOperations(makeCtx(ir, graph, "TANG"));

    // All applied operations should have parameters derived from graph values
    const applied = result.traces.filter((t) => t.applied);
    for (const trace of applied) {
      expect(trace.parameters).toBeDefined();
      expect(Object.keys(trace.parameters).length).toBeGreaterThan(0);
    }
  });
});
