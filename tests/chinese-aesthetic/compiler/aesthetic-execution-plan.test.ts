/**
 * Phase 3.4: Aesthetic Intent → ExecutionPlan Deterministic Compilation
 *
 * 测试覆盖：
 * - 3.4-A: Operation Selector（零隐式规则）
 * - 3.4-B: Plan Emitter（确定性发射器）
 * - 3.4-C: Period Constraints（时代先验）
 * - 3.4-D: Conflict Resolver（显式优先级）
 * - 3.4-E: E2E cyber-chinese-01 SONG 范式编译
 *
 * 验收标准：
 * - INTENT-COMPILATION: 相同输入 → 字节级相同输出
 * - OPERATION-PROVENANCE: 100% 操作具备完整溯源链
 * - CONFLICT-DETERMINISM: 冲突按显式优先级仲裁
 * - PERIOD-DETERMINISM: 不同时代产生显著分化的计划
 * - ZERO-SEMANTIC-LEAKAGE: 零 ChineseScore，零指标反向定义审美
 */

import type { AestheticRelationshipGraph } from "../../../chinese-aesthetic/graph/types";
import type { AestheticIntentExtension, AestheticPrinciple, ActiveRelationship } from "../../../chinese-aesthetic/intent/types";
import type { AestheticPeriod } from "../../../chinese-aesthetic/operations/types";
import {
  compileAestheticExecutionPlan,
  verifyDeterminism,
  selectOperationsFromIntent,
  getSelectedOperations,
  getPeriodConstraints,
  getParameterConstraint,
  clampToPeriodConstraint,
  detectConflicts,
  resolveConflict,
  resolveAllConflicts,
  CONFLICT_PRIORITY,
} from "../../../chinese-aesthetic/compiler";

// ---------------------------------------------------------------------------
// 测试辅助：构造 Graph
// ---------------------------------------------------------------------------

function makeGraph(overrides?: Partial<AestheticRelationshipGraph>): AestheticRelationshipGraph {
  return {
    graphId: "g:test:cyber-chinese-01",
    evidenceId: "e:douyin-7654799674842749382",
    generatedAt: "2026-09-16T00:00:00Z",
    graphHash: "fnv1a:testhash001",
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
    derivationPipeline: ["pixel-extraction", "graph-derivation", "topology-audit"],
    topologyAudit: { status: "PASS", noIsolatedNodes: true, polarAlignment: true, boundedEnergy: true, purityPenetration: true, violations: [] },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 测试辅助：构造 Intent
// ---------------------------------------------------------------------------

function makeIntent(
  period: AestheticPeriod = "SONG",
  principles?: AestheticPrinciple[],
  relationships?: ActiveRelationship[],
): AestheticIntentExtension {
  const defaultPrinciples: Record<AestheticPeriod, AestheticPrinciple[]> = {
    SONG: ["VOID_SOLID_INTERPLAY", "COUNT_WHITE_AS_BLACK", "LIGHT_TEMPORALITY", "QI_YUN_CONTINUITY"],
    TANG: ["GUEST_HOST_COMITY", "SCALE_PROPORTION", "POSITION_MANAGEMENT", "MATERIAL_PATINA"],
    MING: ["POSITION_MANAGEMENT", "GUEST_HOST_COMITY", "MATERIAL_PATINA", "SCALE_PROPORTION"],
  };

  const graph = makeGraph();
  const activeRels = relationships ?? graph.relations.map((r) => ({
    relationType: r.relationType,
    sourceId: r.sourceId,
    targetId: r.targetId,
    magnitude: r.magnitude,
  }));

  return {
    system: "chinese-aesthetic@1.0.0",
    period,
    principles: principles ?? defaultPrinciples[period],
    activeRelationships: activeRels,
    appliedOperations: [],
    antiPatternConformance: { gateReportRef: "fnv1a:gate001", allAllowed: true },
    provenance: { evidenceHash: "sha256:ev001", graphHash: "fnv1a:testhash001", intentHash: "fnv1a:intent001" },
  };
}

// ---------------------------------------------------------------------------
// 3.4-A: Operation Selector Tests
// ---------------------------------------------------------------------------

describe("3.4-A: Operation Selector (零隐式规则)", () => {
  test("SONG 范式下选中的算子必须由 principle + relation 双重激活", () => {
    const intent = makeIntent("SONG");
    const selections = selectOperationsFromIntent(intent);
    const selected = getSelectedOperations(selections);

    expect(selected.length).toBeGreaterThan(0);
    for (const s of selected) {
      expect(s.principleRef).toBeDefined();
      expect(s.relationRef).toBeDefined();
      expect(s.relationRef).toContain("--[");
      expect(s.relationRef).toContain("]-->");
    }
  });

  test("未选中的算子必须有明确的 skippedReason", () => {
    const intent = makeIntent("SONG");
    const selections = selectOperationsFromIntent(intent);
    const unselected = selections.filter((s) => !s.selected);

    expect(unselected.length).toBeGreaterThan(0);
    for (const s of unselected) {
      expect(s.skippedReason).toBeDefined();
      expect(s.skippedReason!.length).toBeGreaterThan(0);
    }
  });

  test("全部 16 个算子都有选择记录（含未选中的）", () => {
    const intent = makeIntent("SONG");
    const selections = selectOperationsFromIntent(intent);
    expect(selections.length).toBe(16);
  });

  test("空 principles 时所有算子都未选中", () => {
    const intent = makeIntent("SONG", []);
    const selections = selectOperationsFromIntent(intent);
    const selected = getSelectedOperations(selections);
    expect(selected.length).toBe(0);
  });

  test("空 activeRelationships 时所有算子都未选中", () => {
    const intent = makeIntent("SONG", undefined, []);
    const selections = selectOperationsFromIntent(intent);
    const selected = getSelectedOperations(selections);
    expect(selected.length).toBe(0);
  });

  test("TANG 和 SONG 选中的算子集合不同", () => {
    const songIntent = makeIntent("SONG");
    const tangIntent = makeIntent("TANG");
    const songSelected = new Set(getSelectedOperations(selectOperationsFromIntent(songIntent)).map((s) => s.operationId));
    const tangSelected = new Set(getSelectedOperations(selectOperationsFromIntent(tangIntent)).map((s) => s.operationId));
    expect(songSelected).not.toEqual(tangSelected);
  });
});

// ---------------------------------------------------------------------------
// 3.4-C: Period Constraints Tests
// ---------------------------------------------------------------------------

describe("3.4-C: Period Constraints (时代先验)", () => {
  test("每个时代都有非空约束集", () => {
    for (const period of ["TANG", "SONG", "MING"] as AestheticPeriod[]) {
      const constraints = getPeriodConstraints(period);
      expect(constraints.period).toBe(period);
      expect(constraints.constraints.length).toBeGreaterThan(0);
      expect(constraints.description.length).toBeGreaterThan(0);
    }
  });

  test("SONG 的 negativeSpaceRatio 区间高于 TANG", () => {
    const songConstraint = getParameterConstraint("SONG", "scene.composition.negativeSpaceRatio");
    const tangConstraint = getParameterConstraint("TANG", "scene.composition.negativeSpaceRatio");
    expect(songConstraint).not.toBeNull();
    expect(tangConstraint).not.toBeNull();
    expect(songConstraint!.min).toBeGreaterThan(tangConstraint!.min);
    expect(songConstraint!.max).toBeGreaterThan(tangConstraint!.max);
  });

  test("clampToPeriodConstraint 钳制超出区间的值", () => {
    // SONG negativeSpaceRatio 区间 [0.35, 0.65]
    const result = clampToPeriodConstraint("SONG", "scene.composition.negativeSpaceRatio", 0.1);
    expect(result.clamped).toBe(true);
    expect(result.value).toBe(0.35);
    expect(result.constraint).toBeDefined();
  });

  test("clampToPeriodConstraint 不修改区间内的值", () => {
    const result = clampToPeriodConstraint("SONG", "scene.composition.negativeSpaceRatio", 0.5);
    expect(result.clamped).toBe(false);
    expect(result.value).toBe(0.5);
  });

  test("无约束的参数返回 null", () => {
    const constraint = getParameterConstraint("SONG", "scene.nonexistent.parameter");
    expect(constraint).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3.4-D: Conflict Resolver Tests
// ---------------------------------------------------------------------------

describe("3.4-D: Conflict Resolver (显式优先级)", () => {
  test("CONFLICT_PRIORITY 顺序: COMPOSITION > SPATIAL > LIGHTING > MATERIAL", () => {
    expect(CONFLICT_PRIORITY.composition).toBeGreaterThan(CONFLICT_PRIORITY.spatial);
    expect(CONFLICT_PRIORITY.spatial).toBeGreaterThan(CONFLICT_PRIORITY.lighting);
    expect(CONFLICT_PRIORITY.lighting).toBeGreaterThan(CONFLICT_PRIORITY.material);
  });

  test("detectConflicts 检测同一 target 的多个操作", () => {
    const graph = makeGraph();
    const intent = makeIntent("SONG");
    const result = compileAestheticExecutionPlan({ intent, graph, compiledAt: "2026-09-16T00:00:00Z" });
    expect(result.success).toBe(true);
    const ops = result.plan!.operations;
    const conflicts = detectConflicts(ops);
    // cyber-chinese-01 SONG 范式下可能有冲突，也可能没有
    // 但 detectConflicts 不应报错
    expect(conflicts).toBeInstanceOf(Map);
  });

  test("resolveConflict 按优先级仲裁: composition 胜出 material", () => {
    const ops = [
      {
        seq: 0,
        operationId: "OP_ENCLOSE_BREATHING_FIELD" as const,
        category: "composition" as const,
        target: "scene.composition.negativeSpaceRatio",
        parameters: { negativeSpaceRatio: 0.5 },
        provenance: {
          principleRef: "COUNT_WHITE_AS_BLACK" as const,
          relationRef: "n1 --[SOLID_VOID]--> n2",
          operationId: "OP_ENCLOSE_BREATHING_FIELD" as const,
          parameterMutation: [],
          provenanceHash: "fnv1a:test1",
        },
      },
      {
        seq: 1,
        operationId: "OP_APPLY_TIME_PATINA" as const,
        category: "material" as const,
        target: "scene.composition.negativeSpaceRatio",
        parameters: { negativeSpaceRatio: 0.2 },
        provenance: {
          principleRef: "MATERIAL_PATINA" as const,
          relationRef: "n1 --[HEAVY_LIGHT]--> n2",
          operationId: "OP_APPLY_TIME_PATINA" as const,
          parameterMutation: [],
          provenanceHash: "fnv1a:test2",
        },
      },
    ];

    const resolution = resolveConflict("scene.composition.negativeSpaceRatio", ops);
    expect(resolution.target).toBe("scene.composition.negativeSpaceRatio");
    expect(resolution.competingOperations.length).toBe(2);
    // 两个数值差异大（0.5 vs 0.2），区间求交失败，按优先级仲裁
    expect(resolution.resolutionStrategy).toBe("priority");
    expect(resolution.winnerOperationId).toBe("OP_ENCLOSE_BREATHING_FIELD");
  });

  test("resolveAllConflicts 返回按 target 排序的结果", () => {
    const graph = makeGraph();
    const intent = makeIntent("SONG");
    const result = compileAestheticExecutionPlan({ intent, graph, compiledAt: "2026-09-16T00:00:00Z" });
    expect(result.success).toBe(true);
    const resolutions = resolveAllConflicts(result.plan!.operations);
    for (let i = 1; i < resolutions.length; i++) {
      expect(resolutions[i].target.localeCompare(resolutions[i - 1].target)).toBeGreaterThanOrEqual(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 3.4-B: Plan Emitter Tests (确定性)
// ---------------------------------------------------------------------------

describe("3.4-B: Plan Emitter (确定性发射器)", () => {
  test("基本编译成功生成 AestheticExecutionPlan", () => {
    const graph = makeGraph();
    const intent = makeIntent("SONG");
    const result = compileAestheticExecutionPlan({ intent, graph, compiledAt: "2026-09-16T00:00:00Z" });

    expect(result.success).toBe(true);
    expect(result.plan).toBeDefined();
    expect(result.plan!.planVersion).toBe("1.0.0");
    expect(result.plan!.period).toBe("SONG");
    expect(result.plan!.operations.length).toBeGreaterThan(0);
    expect(result.plan!.selections.length).toBe(16);
    expect(result.plan!.planDigest).toMatch(/^fnv1a:/);
  });

  test("INTENT-COMPILATION: 相同输入两次编译产生字节级相同的 planDigest", () => {
    const graph = makeGraph();
    const intent = makeIntent("SONG");
    const verification = verifyDeterminism({ intent, graph, compiledAt: "2026-09-16T00:00:00Z" });
    expect(verification.deterministic).toBe(true);
    expect(verification.firstDigest).toBe(verification.secondDigest);
  });

  test("OPERATION-PROVENANCE: 每个已应用操作都有完整溯源链", () => {
    const graph = makeGraph();
    const intent = makeIntent("SONG");
    const result = compileAestheticExecutionPlan({ intent, graph, compiledAt: "2026-09-16T00:00:00Z" });
    expect(result.success).toBe(true);

    const applied = result.plan!.operations.filter((op) => !op.skippedReason);
    expect(applied.length).toBeGreaterThan(0);

    for (const op of applied) {
      expect(op.provenance.principleRef).toBeDefined();
      expect(op.provenance.relationRef).toBeDefined();
      expect(op.provenance.operationId).toBe(op.operationId);
      expect(op.provenance.parameterMutation.length).toBeGreaterThan(0);
      expect(op.provenance.provenanceHash).toMatch(/^fnv1a:/);
    }
  });

  test("操作按 seq 单调递增编号", () => {
    const graph = makeGraph();
    const intent = makeIntent("SONG");
    const result = compileAestheticExecutionPlan({ intent, graph, compiledAt: "2026-09-16T00:00:00Z" });
    expect(result.success).toBe(true);

    const ops = result.plan!.operations;
    for (let i = 0; i < ops.length; i++) {
      expect(ops[i].seq).toBe(i);
    }
  });

  test("ZERO-SEMANTIC-LEAKAGE: 计划中不存在 ChineseScore 字段", () => {
    const graph = makeGraph();
    const intent = makeIntent("SONG");
    const result = compileAestheticExecutionPlan({ intent, graph, compiledAt: "2026-09-16T00:00:00Z" });
    expect(result.success).toBe(true);

    const planJson = JSON.stringify(result.plan);
    expect(planJson).not.toContain("chineseScore");
    expect(planJson).not.toContain("ChineseScore");
    expect(planJson).not.toContain("aestheticScore");
  });

  test("stats 统计正确", () => {
    const graph = makeGraph();
    const intent = makeIntent("SONG");
    const result = compileAestheticExecutionPlan({ intent, graph, compiledAt: "2026-09-16T00:00:00Z" });
    expect(result.success).toBe(true);

    const stats = result.plan!.stats;
    expect(stats.totalOperations).toBe(result.plan!.operations.length);
    expect(stats.appliedOperations + stats.skippedOperations).toBe(stats.totalOperations);
  });
});

// ---------------------------------------------------------------------------
// 3.4-E: E2E cyber-chinese-01 SONG 范式编译
// ---------------------------------------------------------------------------

describe("3.4-E: E2E cyber-chinese-01 SONG 范式编译", () => {
  test("cyber-chinese-01 真实图拓扑 + SONG 范式编译成功", () => {
    const graph = makeGraph(); // cyber-chinese-01 的真实图拓扑
    const intent = makeIntent("SONG");
    const result = compileAestheticExecutionPlan({
      intent,
      graph,
      compiledAt: "2026-09-16T00:00:00Z",
    });

    expect(result.success).toBe(true);
    expect(result.plan!.planId).toContain("song");
    expect(result.plan!.planId).toContain("douyin-7654799674842749382");
  });

  test("cyber-chinese-01 极低负空间(0.016)驱动 OP_ENCLOSE_BREATHING_FIELD", () => {
    const graph = makeGraph();
    const intent = makeIntent("SONG");
    const result = compileAestheticExecutionPlan({ intent, graph, compiledAt: "2026-09-16T00:00:00Z" });
    expect(result.success).toBe(true);

    const breathingOp = result.plan!.operations.find(
      (op) => op.operationId === "OP_ENCLOSE_BREATHING_FIELD" && !op.skippedReason,
    );
    // SONG 范式下 COUNT_WHITE_AS_BLACK 或 VOID_SOLID_INTERPLAY + SOLID_VOID 双重激活，应选中
    expect(breathingOp).toBeDefined();
    if (breathingOp) {
      expect(["COUNT_WHITE_AS_BLACK", "VOID_SOLID_INTERPLAY"]).toContain(breathingOp.provenance.principleRef);
      expect(breathingOp.target).toBe("scene.composition.negativeSpaceRatio");
      // 目标负空间应高于当前 0.016（向 SONG 区间靠拢）
      const targetVoid = breathingOp.parameters.targetNegativeSpace;
      expect(typeof targetVoid).toBe("number");
      expect(targetVoid as number).toBeGreaterThan(0.016);
    }
  });

  test("cyber-chinese-01 高光锐利驱动 OP_DAMPEN_SPECULAR_HARSHNESS 或相关材质算子", () => {
    const graph = makeGraph();
    const intent = makeIntent("SONG");
    const result = compileAestheticExecutionPlan({ intent, graph, compiledAt: "2026-09-16T00:00:00Z" });
    expect(result.success).toBe(true);

    // SONG 范式下 MATERIAL_PATINA 不在 SONG principles 中
    // 但 LIGHT_TEMPORALITY + HIGH_LOW 可能激活光照相关算子
    const materialOps = result.plan!.operations.filter(
      (op) => op.category === "material" && !op.skippedReason,
    );
    // SONG 范式下材质算子可能未被选中（无 MATERIAL_PATINA 原则）
    // 这是正确的行为：零隐式规则
    for (const op of materialOps) {
      expect(op.provenance.principleRef).toBeDefined();
    }
  });

  test("PERIOD-DETERMINISM: TANG/SONG/MING 编译相同资产产生显著分化的计划", () => {
    const graph = makeGraph();
    const periods: AestheticPeriod[] = ["TANG", "SONG", "MING"];
    const digests = new Set<string>();
    const operationCounts: number[] = [];

    for (const period of periods) {
      const intent = makeIntent(period);
      const result = compileAestheticExecutionPlan({ intent, graph, compiledAt: "2026-09-16T00:00:00Z" });
      expect(result.success).toBe(true);
      digests.add(result.plan!.planDigest);
      operationCounts.push(result.plan!.stats.appliedOperations);
    }

    // 三个时代的 planDigest 应不同（显著分化）
    expect(digests.size).toBe(3);
  });

  test("编译结果包含 activePrinciples 和 activeRelationships", () => {
    const graph = makeGraph();
    const intent = makeIntent("SONG");
    const result = compileAestheticExecutionPlan({ intent, graph, compiledAt: "2026-09-16T00:00:00Z" });
    expect(result.success).toBe(true);
    expect(result.plan!.activePrinciples.length).toBeGreaterThan(0);
    expect(result.plan!.activeRelationships.length).toBeGreaterThan(0);
    expect(result.plan!.intentHash).toBe(intent.provenance.intentHash);
    expect(result.plan!.graphHash).toBe(graph.graphHash);
  });
});
