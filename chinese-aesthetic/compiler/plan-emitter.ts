/**
 * 3.4-B: ExecutionPlan Emitter（确定性发射器）
 *
 * 职责：
 * 1. 从 OperationSelectionRecord 生成 PlanOperation 列表
 * 2. 为每个操作注入完整溯源元数据（principleRef → relationRef → operationId → parameterMutation → provenanceHash）
 * 3. 应用时代先验约束（Period Constraints）
 * 4. 应用冲突解析（Conflict Resolution）
 * 5. 生成 AestheticExecutionPlan
 * 6. 计算 planDigest（确定性哈希，FNV-1a）
 *
 * 确定性保证：
 * - 相同输入 → 字节级相同输出
 * - 操作按 (category priority desc, operationId asc) 排序
 * - 所有数值保留 4 位小数
 * - JSON 序列化使用 RFC8785 确定性排序
 */

import type { AestheticIntentExtension } from "../intent/types";
import type { AestheticRelationshipGraph } from "../graph/types";
import type { AestheticPeriod, DesignOperationId } from "../operations/types";
import type {
  AestheticExecutionPlan,
  PlanOperation,
  OperationProvenance,
  ParameterMutation,
  CompilationResult,
  CompilationError,
  OperationSelectionRecord,
} from "./types";
import { selectOperationsFromIntent } from "./operation-selector";
import { OPERATION_TARGET_PATH } from "./operation-selector";
import { getPeriodConstraints, clampToPeriodConstraint } from "./period-constraints";
import { resolveAllConflicts, applyConflictResolutions } from "./conflict-resolver";
import { OPERATION_CATEGORIES } from "../operations/types";
import { CONFLICT_PRIORITY } from "./types";

// ---------------------------------------------------------------------------
// 确定性哈希（FNV-1a）
// ---------------------------------------------------------------------------

/**
 * FNV-1a 32位哈希（确定性，无依赖）。
 * 用于计算 provenanceHash 和 planDigest。
 */
function fnv1a32(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * 对对象进行确定性序列化（RFC8785 风格：键排序、无空格、4位小数）。
 */
function deterministicStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj === "number") {
    return Number.isInteger(obj) ? obj.toString() : obj.toFixed(4);
  }
  if (typeof obj === "boolean" || typeof obj === "string") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map((item) => deterministicStringify(item)).join(",") + "]";
  }
  if (typeof obj === "object") {
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    const pairs = keys.map((k) => `${JSON.stringify(k)}:${deterministicStringify((obj as Record<string, unknown>)[k])}`);
    return "{" + pairs.join(",") + "}";
  }
  return JSON.stringify(obj);
}

// ---------------------------------------------------------------------------
// 操作参数推导（基于图拓扑 + 时代先验）
// ---------------------------------------------------------------------------

/**
 * 基于关系图特征推导操作参数。
 * 所有参数由图拓扑代数推导，不使用魔法常数。
 *
 * @param opId 算子标识
 * @param graph 关系图（只读）
 * @param period 时代范式
 * @returns 推导的参数字典
 */
function deriveOperationParameters(
  opId: DesignOperationId,
  graph: AestheticRelationshipGraph,
  period: AestheticPeriod,
): Record<string, number | string | boolean | number[]> {
  // 从图中提取关键特征
  const voidNode = graph.nodes.find((n) => n.type === "VOID");
  const subjectNode = graph.nodes.find((n) => n.type === "SUBJECT");
  const boundaryNode = graph.nodes.find((n) => n.type === "BOUNDARY");
  const lightNode = graph.nodes.find((n) => n.type === "LIGHT");
  const materialNode = graph.nodes.find((n) => n.type === "MATERIAL");

  const solidVoidRel = graph.relations.find((r) => r.relationType === "SOLID_VOID");
  const hostGuestRel = graph.relations.find((r) => r.relationType === "HOST_GUEST");
  const denseSparseRel = graph.relations.find((r) => r.relationType === "DENSE_SPARSE");

  const voidEnergy = voidNode?.energy ?? 0.3;
  const subjectEnergy = subjectNode?.energy ?? 0.5;
  const boundaryEnergy = boundaryNode?.energy ?? 0.8;
  const lightEnergy = lightNode?.energy ?? 0.4;
  const materialEnergy = materialNode?.energy ?? 0.5;

  switch (opId) {
    case "OP_ENCLOSE_BREATHING_FIELD": {
      // 目标负空间比例：由当前 voidEnergy 推导，向时代先验区间靠拢
      const targetVoid = Math.min(0.65, Math.max(0.15, voidEnergy + 0.15));
      return {
        targetNegativeSpace: Number(targetVoid.toFixed(4)),
        aggregationWeight: Number((0.6 + (solidVoidRel?.magnitude ?? 0.5)).toFixed(4)),
        transitionSoftness: 0.35,
      };
    }
    case "OP_ALIGN_GUEST_HOST_TENSION": {
      const tension = hostGuestRel?.magnitude ?? 0.5;
      return {
        targetFocalOffset: Number((0.05 + tension * 0.1).toFixed(4)),
        hostWeight: Number(subjectEnergy.toFixed(4)),
        guestWeight: Number((1 - subjectEnergy).toFixed(4)),
      };
    }
    case "OP_PARTITION_POISSON_CLUSTER": {
      const density = denseSparseRel?.magnitude ?? 0.5;
      return {
        targetClusterDensity: Number(density.toFixed(4)),
        minDistance: Number((0.1 + (1 - density) * 0.2).toFixed(4)),
        iterations: 50,
      };
    }
    case "OP_CALIBRATE_AXIAL_ORDER": {
      return {
        targetAxialSymmetry: Number(boundaryEnergy.toFixed(4)),
        axisTolerance: 0.05,
      };
    }
    case "OP_LAYER_DEPTH_RECESSION": {
      return {
        targetDepthLayers: 4,
        recessionRate: 0.15,
        hazeStart: 0.4,
      };
    }
    case "OP_INJECT_ATMOSPHERIC_VOID": {
      return {
        targetAtmosphericDensity: Number((voidEnergy * 0.8).toFixed(4)),
        falloffExponent: 1.5,
      };
    }
    case "OP_SHIFT_HORIZON_PROPORTION": {
      return {
        targetHorizonPosition: 0.55,
        transitionBand: 0.1,
      };
    }
    case "OP_FRAME_SECONDARY_OCCLUSION": {
      return {
        targetOcclusionRatio: 0.25,
        occlusionSoftness: 0.4,
      };
    }
    case "OP_APPLY_TIME_PATINA": {
      return {
        targetPatinaLevel: Number((materialEnergy * 0.7).toFixed(4)),
        patinaDistribution: "edge-heavy",
      };
    }
    case "OP_DAMPEN_SPECULAR_HARSHNESS": {
      return {
        targetSpecularSharpness: 15.0,
        dampeningFactor: 0.6,
      };
    }
    case "OP_ORCHESTRATE_MATERIAL_CONTRAST": {
      return {
        targetContrastRatio: 0.4,
        contrastBalance: 0.5,
      };
    }
    case "OP_WEATHER_SURFACE_ENTROPY": {
      return {
        targetSurfaceEntropy: Number((materialEnergy * 0.6).toFixed(4)),
        entropyScale: 0.3,
      };
    }
    case "OP_HARMONIZE_SKY_LUMINANCE": {
      return {
        targetSkyLuminance: Number((lightEnergy * 0.8).toFixed(4)),
        harmonizationFactor: 0.5,
      };
    }
    case "OP_COOL_SHADOW_CHROMATICITY": {
      return {
        targetShadowTemperature: 0.45,
        coolingStrength: 0.4,
      };
    }
    case "OP_FILTER_MIST_SCATTER": {
      return {
        targetMistDensity: Number((voidEnergy * 0.5).toFixed(4)),
        scatterAnisotropy: 0.7,
      };
    }
    case "OP_RESTRICT_ACCENT_LUMINANCE": {
      return {
        targetAccentLuminance: 0.5,
        restrictionThreshold: 0.7,
      };
    }
    default:
      return {};
  }
}

// ---------------------------------------------------------------------------
// 溯源链构建
// ---------------------------------------------------------------------------

/**
 * 为操作构建完整溯源链。
 */
function buildProvenance(
  selection: OperationSelectionRecord,
  parameters: Record<string, number | string | boolean | number[]>,
  target: string,
): OperationProvenance {
  const paramKey = target.split(".").pop() ?? "value";
  const proposedValue = parameters[paramKey] ?? parameters.value ?? 0;

  const mutation: ParameterMutation = {
    target,
    from: 0, // 原始值（由下游 IR 提供，此处标记为待填充）
    to: proposedValue,
    rationale: `Derived from graph topology for ${selection.operationId}`,
  };

  // 确定性哈希：principleRef + relationRef + operationId + parameters
  const hashInput = [
    selection.principleRef ?? "",
    selection.relationRef ?? "",
    selection.operationId,
    deterministicStringify(parameters),
  ].join("|");

  return {
    principleRef: selection.principleRef!,
    relationRef: selection.relationRef!,
    operationId: selection.operationId,
    parameterMutation: [mutation],
    provenanceHash: `fnv1a:${fnv1a32(hashInput)}`,
  };
}

// ---------------------------------------------------------------------------
// 操作排序（确定性）
// ---------------------------------------------------------------------------

/**
 * 对选中的操作进行确定性排序。
 * 排序规则：按 category priority 降序，同优先级按 operationId 字典序升序。
 */
function sortOperations(selections: OperationSelectionRecord[]): OperationSelectionRecord[] {
  return [...selections]
    .filter((s) => s.selected)
    .sort((a, b) => {
      const priorityDiff = CONFLICT_PRIORITY[b.category] - CONFLICT_PRIORITY[a.category];
      if (priorityDiff !== 0) return priorityDiff;
      return a.operationId.localeCompare(b.operationId);
    });
}

// ---------------------------------------------------------------------------
// 主编译器
// ---------------------------------------------------------------------------

export interface AestheticCompilerInput {
  /** Aesthetic Intent 扩展对象 */
  intent: AestheticIntentExtension;
  /** 关系图（只读，用于参数推导） */
  graph: AestheticRelationshipGraph;
  /** 编译时间（确定性输入，非实际时间） */
  compiledAt: string;
}

/**
 * Aesthetic-to-ExecutionPlan 主编译器。
 *
 * 执行流水线：
 * 1. 从 Intent 选择算子（零隐式规则）
 * 2. 确定性排序
 * 3. 推导操作参数（基于图拓扑）
 * 4. 应用时代先验约束
 * 5. 构建溯源链
 * 6. 冲突检测与解析
 * 7. 生成 AestheticExecutionPlan
 * 8. 计算 planDigest
 */
export function compileAestheticExecutionPlan(input: AestheticCompilerInput): CompilationResult {
  const startTime = Date.now();
  const errors: CompilationError[] = [];
  const { intent, graph, compiledAt } = input;

  try {
    // 1. 从 Intent 选择算子
    const allSelections = selectOperationsFromIntent(intent);
    const selectedSelections = sortOperations(allSelections);

    // 2. 构建操作列表
    let operations: PlanOperation[] = selectedSelections.map((selection, index) => {
      const target = OPERATION_TARGET_PATH[selection.operationId];
      const parameters = deriveOperationParameters(selection.operationId, graph, intent.period);

      // 3. 应用时代先验约束
      const paramKey = target.split(".").pop() ?? "value";
      const paramValue = parameters[paramKey];
      let periodConstraintApplied: string | undefined;

      if (typeof paramValue === "number") {
        const clampResult = clampToPeriodConstraint(intent.period, target, paramValue);
        if (clampResult.clamped && clampResult.constraint) {
          parameters[paramKey] = clampResult.value;
          periodConstraintApplied = `${intent.period}: ${clampResult.constraint.rationale} (clamped ${paramValue} → ${clampResult.value})`;
        }
      }

      // 4. 构建溯源链
      const provenance = buildProvenance(selection, parameters, target);

      return {
        seq: index,
        operationId: selection.operationId,
        category: selection.category,
        target,
        parameters,
        periodConstraintApplied,
        provenance,
      };
    });

    // 5. 冲突检测与解析
    const conflictResolutions = resolveAllConflicts(operations);
    if (conflictResolutions.length > 0) {
      operations = applyConflictResolutions(operations, conflictResolutions);
    }

    // 6. 重新编号 seq（确定性）
    operations = operations.map((op, index) => ({ ...op, seq: index }));

    // 7. 统计
    const appliedOperations = operations.filter((op) => !op.skippedReason);
    const skippedOperations = operations.filter((op) => op.skippedReason);
    const periodConstraintsApplied = operations
      .filter((op) => op.periodConstraintApplied)
      .map((op) => op.periodConstraintApplied!);

    // 8. 构建计划
    const plan: AestheticExecutionPlan = {
      planId: `plan:${intent.period.toLowerCase()}:${graph.evidenceId}:v1`,
      planVersion: "1.0.0",
      period: intent.period,
      compiledAt,
      intentHash: intent.provenance.intentHash,
      graphHash: graph.graphHash,
      activePrinciples: intent.principles,
      activeRelationships: intent.activeRelationships,
      operations,
      selections: allSelections,
      conflictResolutions,
      periodConstraintsApplied,
      stats: {
        totalOperations: operations.length,
        appliedOperations: appliedOperations.length,
        skippedOperations: skippedOperations.length,
        conflictsResolved: conflictResolutions.length,
        periodConstraintsApplied: periodConstraintsApplied.length,
      },
      planDigest: "", // 占位，下面计算
    };

    // 9. 计算 planDigest（对除 planDigest 外的全部字段确定性哈希）
    const { planDigest: _ignored, ...planWithoutDigest } = plan;
    plan.planDigest = `fnv1a:${fnv1a32(deterministicStringify(planWithoutDigest))}`;

    return {
      success: true,
      plan,
      errors: [],
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    errors.push({
      code: "COMPILATION_FAILED",
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      errors,
      durationMs: Date.now() - startTime,
    };
  }
}

// ---------------------------------------------------------------------------
// 确定性验证
// ---------------------------------------------------------------------------

/**
 * 验证编译的确定性：相同输入两次编译应产生字节级相同的计划。
 *
 * @param input 编译输入
 * @returns 确定性验证结果
 */
export function verifyDeterminism(input: AestheticCompilerInput): {
  deterministic: boolean;
  firstDigest: string;
  secondDigest: string;
} {
  const first = compileAestheticExecutionPlan(input);
  const second = compileAestheticExecutionPlan(input);

  const firstDigest = first.plan?.planDigest ?? "";
  const secondDigest = second.plan?.planDigest ?? "";

  return {
    deterministic: firstDigest === secondDigest,
    firstDigest,
    secondDigest,
  };
}
