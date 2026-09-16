/**
 * Phase 3.4.1: Aesthetic-to-Runtime Adapter Tests
 *
 * 测试覆盖：
 * - ADAPTER-01: Determinism（相同输入 → 字节级相同输出）
 * - ADAPTER-02: ABI Protection（不修改 Core Compiler / ABI）
 * - ADAPTER-03: Provenance Chain（100% 指令可溯源）
 * - ADAPTER-04: Domain Validity（参数范围校验）
 * - ADAPTER-05: Explicit Block（不支持算子显式 BLOCKED）
 * - ADAPTER-06: Byte Idempotency（链式防伪）
 * - ADAPTER-07: Core Immutability（历史只读）
 */

import type { AestheticExecutionPlan, PlanOperation } from "../../../chinese-aesthetic/compiler/types";
import type { AestheticRelationshipGraph } from "../../../chinese-aesthetic/graph/types";
import type { AestheticIntentExtension } from "../../../chinese-aesthetic/intent/types";
import {
  compileAestheticExecutionPlan,
} from "../../../chinese-aesthetic/compiler";
import {
  adaptAestheticToRuntime,
  verifyAdapterDeterminism,
  OPERATION_MAPPINGS,
  PARAMETER_RANGE_CONSTRAINTS,
} from "../../../chinese-aesthetic/adapter";

// ---------------------------------------------------------------------------
// 测试辅助：构造 Graph
// ---------------------------------------------------------------------------

function makeGraph(): AestheticRelationshipGraph {
  return {
    graphId: "g:test:cyber-chinese-01",
    evidenceId: "e:douyin-7654799674842749382",
    generatedAt: "2026-09-16T00:00:00Z",
    graphHash: "fnv1a:testhash001",
    derivationPipeline: ["pixel-extraction", "graph-derivation", "topology-audit"],
    nodes: [
      { id: "node:subject:primary", type: "SUBJECT", boundingRegion: [0.3, 0.2, 0.4, 0.6], energy: 0.473, evidenceRefs: ["pixel:saliency"], confidence: 0.85 },
      { id: "node:void:negative-space", type: "VOID", boundingRegion: null, energy: 0.016, evidenceRefs: ["pixel:negative-space"], confidence: 0.85 },
      { id: "node:space:composition", type: "SPACE", boundingRegion: [0, 0, 1, 1], energy: 0.7, evidenceRefs: ["pixel:blocks"], confidence: 1 },
      { id: "node:light:luminance-field", type: "LIGHT", boundingRegion: null, energy: 0.315, evidenceRefs: ["pixel:luma"], confidence: 1 },
      { id: "node:material:dominant", type: "MATERIAL", boundingRegion: null, energy: 0.48, evidenceRefs: ["pixel:material"], confidence: 0.9 },
      { id: "node:axis:symmetry", type: "AXIS", boundingRegion: null, energy: 0.5, evidenceRefs: ["pixel:axis"], confidence: 0.9 },
      { id: "node:boundary:edges", type: "BOUNDARY", boundingRegion: null, energy: 1.0, evidenceRefs: ["pixel:sobel"], confidence: 0.95 },
      { id: "node:scale:hierarchy", type: "SCALE", boundingRegion: null, energy: 0.025, evidenceRefs: ["pixel:scale"], confidence: 0.8 },
      { id: "node:time:patina", type: "TIME", boundingRegion: null, energy: 0.403, evidenceRefs: ["pixel:time"], confidence: 0.7 },
      { id: "node:view:camera", type: "VIEW", boundingRegion: null, energy: 0.0, evidenceRefs: ["ir:camera"], confidence: 0.8 },
      { id: "node:motion:optical-flow", type: "MOTION", boundingRegion: null, energy: 0.506, evidenceRefs: ["motion:optical-flow"], confidence: 0.85 },
    ],
    relations: [
      { sourceId: "node:subject:primary", targetId: "node:space:composition", relationType: "HOST_GUEST", magnitude: 0.6, polarity: "FORWARD", derivedFrom: ["d:host-guest"], confidence: 0.85 },
      { sourceId: "node:subject:primary", targetId: "node:void:negative-space", relationType: "SOLID_VOID", magnitude: 0.3, polarity: "MUTUAL", derivedFrom: ["d:solid-void"], confidence: 0.8 },
      { sourceId: "node:boundary:edges", targetId: "node:void:negative-space", relationType: "DENSE_SPARSE", magnitude: 0.9, polarity: "MUTUAL", derivedFrom: ["d:dense-sparse"], confidence: 0.9 },
      { sourceId: "node:axis:symmetry", targetId: "node:boundary:edges", relationType: "CENTER_EDGE", magnitude: 0.5, polarity: "MUTUAL", derivedFrom: ["d:center-edge"], confidence: 0.85 },
      { sourceId: "node:motion:optical-flow", targetId: "node:space:composition", relationType: "MOVE_STILL", magnitude: 0.5, polarity: "MUTUAL", derivedFrom: ["d:move-still"], confidence: 0.85 },
      { sourceId: "node:light:luminance-field", targetId: "node:void:negative-space", relationType: "HIGH_LOW", magnitude: 0.4, polarity: "MUTUAL", derivedFrom: ["d:high-low"], confidence: 0.8 },
      { sourceId: "node:material:dominant", targetId: "node:light:luminance-field", relationType: "HEAVY_LIGHT", magnitude: 0.35, polarity: "MUTUAL", derivedFrom: ["d:heavy-light"], confidence: 0.8 },
    ],
    unmeasuredRelations: [],
    topologyAudit: { status: "PASS", noIsolatedNodes: true, polarAlignment: true, boundedEnergy: true, purityPenetration: true, violations: [] },
  };
}

// ---------------------------------------------------------------------------
// 测试辅助：构造 Intent
// ---------------------------------------------------------------------------

function makeIntent(): AestheticIntentExtension {
  const graph = makeGraph();
  return {
    system: "chinese-aesthetic@1.0.0",
    period: "SONG",
    principles: ["VOID_SOLID_INTERPLAY", "COUNT_WHITE_AS_BLACK", "LIGHT_TEMPORALITY", "QI_YUN_CONTINUITY"],
    activeRelationships: graph.relations.map((r) => ({
      relationType: r.relationType,
      sourceId: r.sourceId,
      targetId: r.targetId,
      magnitude: r.magnitude,
    })),
    appliedOperations: [],
    antiPatternConformance: { gateReportRef: "fnv1a:gate001", allAllowed: true },
    provenance: { evidenceHash: "sha256:ev001", graphHash: "fnv1a:testhash001", intentHash: "fnv1a:intent001" },
  };
}

// ---------------------------------------------------------------------------
// 测试辅助：编译 AestheticExecutionPlan
// ---------------------------------------------------------------------------

function compilePlan(): AestheticExecutionPlan {
  const graph = makeGraph();
  const intent = makeIntent();
  const result = compileAestheticExecutionPlan({ intent, graph, compiledAt: "2026-09-16T00:00:00Z" });
  expect(result.success).toBe(true);
  return result.plan!;
}

// ---------------------------------------------------------------------------
// ADAPTER-01: Determinism
// ---------------------------------------------------------------------------

describe("ADAPTER-01: Determinism（确定性）", () => {
  test("相同 AestheticExecutionPlan 两次适配产生字节级相同的 deterministicDigest", () => {
    const aestheticPlan = compilePlan();
    const verification = verifyAdapterDeterminism({ aestheticPlan, compiledAt: "2026-09-16T00:00:00Z" });
    expect(verification.deterministic).toBe(true);
    expect(verification.firstDigest).toBe(verification.secondDigest);
  });

  test("适配结果包含非空 deterministicDigest", () => {
    const aestheticPlan = compilePlan();
    const result = adaptAestheticToRuntime({ aestheticPlan, compiledAt: "2026-09-16T00:00:00Z" });
    expect(result.plan).toBeDefined();
    expect(result.plan!.deterministicDigest).toMatch(/^fnv1a:/);
    expect(result.plan!.deterministicDigest.length).toBeGreaterThan(10);
  });
});

// ---------------------------------------------------------------------------
// ADAPTER-02: ABI Protection
// ---------------------------------------------------------------------------

describe("ADAPTER-02: ABI Protection（ABI 保护）", () => {
  test("适配器输出包含 planVersion 字段", () => {
    const aestheticPlan = compilePlan();
    const result = adaptAestheticToRuntime({ aestheticPlan, compiledAt: "2026-09-16T00:00:00Z" });
    expect(result.plan!.planVersion).toBe("1.0.0");
  });

  test("适配器不修改输入的 AestheticExecutionPlan", () => {
    const aestheticPlan = compilePlan();
    const originalDigest = aestheticPlan.planDigest;
    const originalOpCount = aestheticPlan.operations.length;

    adaptAestheticToRuntime({ aestheticPlan, compiledAt: "2026-09-16T00:00:00Z" });

    expect(aestheticPlan.planDigest).toBe(originalDigest);
    expect(aestheticPlan.operations.length).toBe(originalOpCount);
  });
});

// ---------------------------------------------------------------------------
// ADAPTER-03: Provenance Chain
// ---------------------------------------------------------------------------

describe("ADAPTER-03: Provenance Chain（溯源链）", () => {
  test("100% 运行时指令包含 sourceAestheticOp", () => {
    const aestheticPlan = compilePlan();
    const result = adaptAestheticToRuntime({ aestheticPlan, compiledAt: "2026-09-16T00:00:00Z" });
    expect(result.plan!.instructions.length).toBeGreaterThan(0);
    for (const inst of result.plan!.instructions) {
      expect(inst.sourceAestheticOp).toBeDefined();
      expect(typeof inst.sourceAestheticOp).toBe("string");
    }
  });

  test("100% 运行时指令包含 principleRef 和 relationRef", () => {
    const aestheticPlan = compilePlan();
    const result = adaptAestheticToRuntime({ aestheticPlan, compiledAt: "2026-09-16T00:00:00Z" });
    for (const inst of result.plan!.instructions) {
      expect(inst.metadata.principleRef).toBeDefined();
      expect(inst.metadata.relationRef).toBeDefined();
      expect(inst.metadata.relationRef).toContain("--[");
      expect(inst.metadata.relationRef).toContain("]-->");
    }
  });

  test("100% 运行时指令包含 provenanceHash", () => {
    const aestheticPlan = compilePlan();
    const result = adaptAestheticToRuntime({ aestheticPlan, compiledAt: "2026-09-16T00:00:00Z" });
    for (const inst of result.plan!.instructions) {
      expect(inst.metadata.provenanceHash).toMatch(/^fnv1a:/);
    }
  });

  test("运行时指令的 sourceAestheticOp 能在原始 AestheticExecutionPlan 中找到", () => {
    const aestheticPlan = compilePlan();
    const result = adaptAestheticToRuntime({ aestheticPlan, compiledAt: "2026-09-16T00:00:00Z" });
    const originalOpIds = new Set(aestheticPlan.operations.filter((op) => !op.skippedReason).map((op) => op.operationId));
    for (const inst of result.plan!.instructions) {
      expect(originalOpIds.has(inst.sourceAestheticOp)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// ADAPTER-04: Domain Validity
// ---------------------------------------------------------------------------

describe("ADAPTER-04: Domain Validity（参数域有效性）", () => {
  test("所有输出参数经由 Parameter Guard 校验", () => {
    const aestheticPlan = compilePlan();
    const result = adaptAestheticToRuntime({ aestheticPlan, compiledAt: "2026-09-16T00:00:00Z" });
    expect(result.plan!.stats.parameterValidations).toBeGreaterThan(0);
    expect(result.plan!.stats.parameterValidationPassed).toBeGreaterThan(0);
  });

  test("越界参数被钳制到安全区间", () => {
    // 构造一个带有越界参数的 AestheticExecutionPlan
    const aestheticPlan = compilePlan();
    // 修改第一个操作的参数为越界值
    const appliedOps = aestheticPlan.operations.filter((op) => !op.skippedReason);
    if (appliedOps.length > 0) {
      const op = appliedOps[0];
      const paramKey = Object.keys(op.parameters)[0];
      if (paramKey && typeof op.parameters[paramKey] === "number") {
        op.parameters[paramKey] = 999.0; // 越界
      }
    }

    const result = adaptAestheticToRuntime({ aestheticPlan, compiledAt: "2026-09-16T00:00:00Z" });
    // 越界参数应该被钳制或 BLOCKED，不应该出现在最终指令中
    for (const inst of result.plan!.instructions) {
      if (typeof inst.value === "number") {
        const constraint = PARAMETER_RANGE_CONSTRAINTS.find((c) => c.targetPath === inst.targetPath);
        if (constraint && constraint.min !== undefined && constraint.max !== undefined) {
          expect(inst.value).toBeGreaterThanOrEqual(constraint.min);
          expect(inst.value).toBeLessThanOrEqual(constraint.max);
        }
      }
    }
  });

  test("PARAMETER_RANGE_CONSTRAINTS 覆盖全部 16 个算子的目标路径", () => {
    const targetPaths = new Set(Object.values(OPERATION_MAPPINGS).map((m) => m.targetPath));
    const constrainedPaths = new Set(PARAMETER_RANGE_CONSTRAINTS.map((c) => c.targetPath));
    for (const path of targetPaths) {
      expect(constrainedPaths.has(path)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// ADAPTER-05: Explicit Block
// ---------------------------------------------------------------------------

describe("ADAPTER-05: Explicit Block（显式阻断）", () => {
  test("OPERATION_MAPPINGS 包含全部 16 个算子", () => {
    const allOpIds = [
      "OP_ENCLOSE_BREATHING_FIELD", "OP_ALIGN_GUEST_HOST_TENSION", "OP_PARTITION_POISSON_CLUSTER", "OP_CALIBRATE_AXIAL_ORDER",
      "OP_LAYER_DEPTH_RECESSION", "OP_INJECT_ATMOSPHERIC_VOID", "OP_SHIFT_HORIZON_PROPORTION", "OP_FRAME_SECONDARY_OCCLUSION",
      "OP_APPLY_TIME_PATINA", "OP_DAMPEN_SPECULAR_HARSHNESS", "OP_ORCHESTRATE_MATERIAL_CONTRAST", "OP_WEATHER_SURFACE_ENTROPY",
      "OP_HARMONIZE_SKY_LUMINANCE", "OP_COOL_SHADOW_CHROMATICITY", "OP_FILTER_MIST_SCATTER", "OP_RESTRICT_ACCENT_LUMINANCE",
    ];
    for (const opId of allOpIds) {
      expect(OPERATION_MAPPINGS[opId as keyof typeof OPERATION_MAPPINGS]).toBeDefined();
    }
  });

  test("当前全部 16 个算子均被标记为 supported", () => {
    for (const mapping of Object.values(OPERATION_MAPPINGS)) {
      expect(mapping.supported).toBe(true);
    }
  });

  test("cyber-chinese-01 适配结果中无 BLOCKED 操作", () => {
    const aestheticPlan = compilePlan();
    const result = adaptAestheticToRuntime({ aestheticPlan, compiledAt: "2026-09-16T00:00:00Z" });
    expect(result.blockedCount).toBe(0);
    expect(result.plan!.blockedOperations.length).toBe(0);
  });

  test("BLOCKED 操作包含完整的溯源信息", () => {
    // 构造一个不支持的算子（通过修改 operationId）
    const aestheticPlan = compilePlan();
    const appliedOps = aestheticPlan.operations.filter((op) => !op.skippedReason);
    if (appliedOps.length > 0) {
      // 将第一个操作的 operationId 改为一个不存在的值
      (appliedOps[0] as PlanOperation).operationId = "OP_NONEXISTENT" as never;
    }

    const result = adaptAestheticToRuntime({ aestheticPlan, compiledAt: "2026-09-16T00:00:00Z" });
    // 不存在的算子应该被 BLOCKED
    expect(result.blockedCount).toBeGreaterThan(0);
    for (const blocked of result.plan!.blockedOperations) {
      expect(blocked.operationId).toBeDefined();
      expect(blocked.reason).toBeDefined();
      expect(blocked.code).toBe("UNSUPPORTED_OPERATION");
      expect(blocked.provenance.principleRef).toBeDefined();
      expect(blocked.provenance.relationRef).toBeDefined();
      expect(blocked.provenance.provenanceHash).toMatch(/^fnv1a:/);
    }
  });
});

// ---------------------------------------------------------------------------
// ADAPTER-06: Byte Idempotency
// ---------------------------------------------------------------------------

describe("ADAPTER-06: Byte Idempotency（字节幂等）", () => {
  test("sourcePlanDigest 正确记录来源 AestheticExecutionPlan 的摘要", () => {
    const aestheticPlan = compilePlan();
    const result = adaptAestheticToRuntime({ aestheticPlan, compiledAt: "2026-09-16T00:00:00Z" });
    expect(result.plan!.sourcePlanDigest).toBe(aestheticPlan.planDigest);
  });

  test("sourcePlanId 正确记录来源计划标识", () => {
    const aestheticPlan = compilePlan();
    const result = adaptAestheticToRuntime({ aestheticPlan, compiledAt: "2026-09-16T00:00:00Z" });
    expect(result.plan!.sourcePlanId).toBe(aestheticPlan.planId);
  });

  test("executionId 包含 period 和 sourcePlanId 信息", () => {
    const aestheticPlan = compilePlan();
    const result = adaptAestheticToRuntime({ aestheticPlan, compiledAt: "2026-09-16T00:00:00Z" });
    expect(result.plan!.executionId).toContain("song");
    expect(result.plan!.executionId).toContain("douyin-7654799674842749382");
  });
});

// ---------------------------------------------------------------------------
// ADAPTER-07: Core Immutability
// ---------------------------------------------------------------------------

describe("ADAPTER-07: Core Immutability（核心不可变）", () => {
  test("适配器输出不包含 Core Compiler 的 RuntimeExecutionPlan 字段", () => {
    const aestheticPlan = compilePlan();
    const result = adaptAestheticToRuntime({ aestheticPlan, compiledAt: "2026-09-16T00:00:00Z" });
    const planJson = JSON.stringify(result.plan);
    // 不应该包含 Core Compiler 的 negotiation / runtimePlan / assetManifest 字段
    expect(planJson).not.toContain("negotiation");
    expect(planJson).not.toContain("runtimePlan");
    expect(planJson).not.toContain("assetManifest");
  });

  test("适配器输出不包含 chineseScore 或 aestheticScore", () => {
    const aestheticPlan = compilePlan();
    const result = adaptAestheticToRuntime({ aestheticPlan, compiledAt: "2026-09-16T00:00:00Z" });
    const planJson = JSON.stringify(result.plan);
    expect(planJson).not.toContain("chineseScore");
    expect(planJson).not.toContain("aestheticScore");
  });
});

// ---------------------------------------------------------------------------
// E2E: cyber-chinese-01 实测转换
// ---------------------------------------------------------------------------

describe("E2E: cyber-chinese-01 实测转换", () => {
  test("cyber-chinese-01 SONG 范式完整转换成功", () => {
    const aestheticPlan = compilePlan();
    const result = adaptAestheticToRuntime({ aestheticPlan, compiledAt: "2026-09-16T00:00:00Z" });
    expect(result.success).toBe(true);
    expect(result.plan).toBeDefined();
    expect(result.plan!.instructions.length).toBeGreaterThan(0);
    expect(result.blockedCount).toBe(0);
  });

  test("OP_ENCLOSE_BREATHING_FIELD 正确映射到 negativeSpaceRatio", () => {
    const aestheticPlan = compilePlan();
    const result = adaptAestheticToRuntime({ aestheticPlan, compiledAt: "2026-09-16T00:00:00Z" });
    const breathingInst = result.plan!.instructions.find(
      (inst) => inst.sourceAestheticOp === "OP_ENCLOSE_BREATHING_FIELD",
    );
    expect(breathingInst).toBeDefined();
    expect(breathingInst!.targetPath).toBe("scene.composition.negativeSpaceRatio");
    expect(breathingInst!.type).toBe("MUTATE_PROPERTY");
  });

  test("光照算子正确映射到 lighting 路径", () => {
    const aestheticPlan = compilePlan();
    const result = adaptAestheticToRuntime({ aestheticPlan, compiledAt: "2026-09-16T00:00:00Z" });
    const lightingInsts = result.plan!.instructions.filter((inst) =>
      inst.targetPath.startsWith("scene.lighting."),
    );
    expect(lightingInsts.length).toBeGreaterThan(0);
    for (const inst of lightingInsts) {
      expect(inst.metadata.principleRef).toBe("LIGHT_TEMPORALITY");
    }
  });

  test("指令按 seq 单调递增编号", () => {
    const aestheticPlan = compilePlan();
    const result = adaptAestheticToRuntime({ aestheticPlan, compiledAt: "2026-09-16T00:00:00Z" });
    const insts = result.plan!.instructions;
    for (let i = 0; i < insts.length; i++) {
      expect(insts[i].seq).toBe(i);
    }
  });

  test("stats 统计正确", () => {
    const aestheticPlan = compilePlan();
    const result = adaptAestheticToRuntime({ aestheticPlan, compiledAt: "2026-09-16T00:00:00Z" });
    const stats = result.plan!.stats;
    expect(stats.totalInstructions).toBe(result.plan!.instructions.length);
    expect(stats.blockedCount).toBe(result.plan!.blockedOperations.length);
    expect(stats.parameterValidations).toBeGreaterThan(0);
    expect(stats.parameterValidationPassed).toBeLessThanOrEqual(stats.parameterValidations);
  });
});
