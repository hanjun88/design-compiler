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
 *
 * 美学数值的来源：
 * - 每个算子的默认目标、推导增益与次级参数，是 skill 的 OPERATION_POLICY 决策
 *   （subject = PLAN_<算子 id>，家族 CAS-OT），经 DecisionPack 读取；
 * - 时代先验区间是 PERIOD_BAND 决策，冲突优先级是 PRIORITY_ORDER 决策；
 * - 本模块只保留结构性运算（图特征提取、补数、取整、排序、哈希）。
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
import { conflictPriority } from "./types";
import { requireDecisionPack, withDecisionPack } from "../../skill-bridge/active-pack";
import { SheetRejectedError } from "../../skill-bridge/errors";

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
  return (hash >>> 0).toString(16).padStart(8, "0"); // ssot-ok(PROTOCOL): fixed 8-hex-digit width of the FNV-1a 32-bit digest, a format not a magnitude
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

/** 算子计划发射策略的 subject（skill 家族 CAS-OT：每个算子一条 OPERATION_POLICY）。 */
const planPolicySubject = (opId: DesignOperationId): string => `PLAN_${opId}`;

/**
 * 基于关系图特征推导操作参数。
 * 参数由图拓扑代数推导；推导所需的偏移、增益、默认目标与次级参数，
 * 以及图中缺少节点/关系时的中性读数，都来自 skill 的 OPERATION_POLICY 决策
 * （经 DecisionPack 读取，读取不到即失败，不存在本地默认值）。
 *
 * @param opId 算子标识
 * @param graph 关系图（只读）
 * @param period 时代范式（须与当前生效 sheet 的时代一致）
 * @returns 推导的参数字典
 */
export function deriveOperationParameters(
  opId: DesignOperationId,
  graph: AestheticRelationshipGraph,
  period: AestheticPeriod,
): Record<string, number | string | boolean | number[]> {
  const pack = requireDecisionPack(period);
  const fallbacks = pack.policy("OPERATION_POLICY", "PLAN_GRAPH_FALLBACKS");
  const policy = () => pack.policy("OPERATION_POLICY", planPolicySubject(opId));

  // 从图中提取关键特征（节点能量 / 关系强度；图中缺失时取 skill 给出的中性读数）
  const energyOf = (nodeType: string, fallbackKey: string): number =>
    graph.nodes.find((n) => n.type === nodeType)?.energy ?? fallbacks.num(fallbackKey);
  const magnitudeOf = (relationType: string, fallbackKey: string): number =>
    graph.relations.find((r) => r.relationType === relationType)?.magnitude ?? fallbacks.num(fallbackKey);

  switch (opId) {
    case "OP_ENCLOSE_BREATHING_FIELD": {
      // 目标负空间比例：由当前 voidEnergy 推导，限定在当前语境的负空间有效区间内
      // （区间边界是 skill 经 $band 解析出的数值，见 CAS-OT-ENCLOSE-BREATHING-FIELD）
      const p = policy();
      const targetVoid = Math.min(
        p.num("negative_space_max"),
        Math.max(p.num("negative_space_min"), energyOf("VOID", "void_energy") + p.num("negative_space_lift")),
      );
      return {
        targetNegativeSpace: Number(targetVoid.toFixed(4)),
        aggregationWeight: Number((p.num("aggregation_base") + magnitudeOf("SOLID_VOID", "solid_void_magnitude")).toFixed(4)),
        transitionSoftness: p.num("transition_softness"),
      };
    }
    case "OP_ALIGN_GUEST_HOST_TENSION": {
      const p = policy();
      const tension = magnitudeOf("HOST_GUEST", "host_guest_magnitude");
      const subjectEnergy = energyOf("SUBJECT", "subject_energy");
      return {
        targetFocalOffset: Number((p.num("focal_offset_base") + tension * p.num("focal_offset_gain")).toFixed(4)),
        hostWeight: Number(subjectEnergy.toFixed(4)),
        guestWeight: Number((1 - subjectEnergy).toFixed(4)),
      };
    }
    case "OP_PARTITION_POISSON_CLUSTER": {
      const p = policy();
      const density = magnitudeOf("DENSE_SPARSE", "dense_sparse_magnitude");
      return {
        targetClusterDensity: Number(density.toFixed(4)),
        minDistance: Number((p.num("min_distance_base") + (1 - density) * p.num("min_distance_gain")).toFixed(4)),
        iterations: p.num("iterations"),
      };
    }
    case "OP_CALIBRATE_AXIAL_ORDER": {
      const p = policy();
      return {
        targetAxialSymmetry: Number(energyOf("BOUNDARY", "boundary_energy").toFixed(4)),
        axisTolerance: p.num("axis_tolerance"),
      };
    }
    case "OP_LAYER_DEPTH_RECESSION": {
      const p = policy();
      return {
        targetDepthLayers: p.num("target_depth_layers"),
        recessionRate: p.num("recession_rate"),
        hazeStart: p.num("haze_start"),
      };
    }
    case "OP_INJECT_ATMOSPHERIC_VOID": {
      const p = policy();
      return {
        targetAtmosphericDensity: Number((energyOf("VOID", "void_energy") * p.num("density_gain")).toFixed(4)),
        falloffExponent: p.num("falloff_exponent"),
      };
    }
    case "OP_SHIFT_HORIZON_PROPORTION": {
      const p = policy();
      return {
        targetHorizonPosition: p.num("target_horizon_position"),
        transitionBand: p.num("transition_band"),
      };
    }
    case "OP_FRAME_SECONDARY_OCCLUSION": {
      const p = policy();
      return {
        targetOcclusionRatio: p.num("target_occlusion_ratio"),
        occlusionSoftness: p.num("occlusion_softness"),
      };
    }
    case "OP_APPLY_TIME_PATINA": {
      const p = policy();
      return {
        targetPatinaLevel: Number((energyOf("MATERIAL", "material_energy") * p.num("patina_gain")).toFixed(4)),
        patinaDistribution: p.str("patina_distribution"),
      };
    }
    case "OP_DAMPEN_SPECULAR_HARSHNESS": {
      const p = policy();
      return {
        targetSpecularSharpness: p.num("target_specular_sharpness"),
        dampeningFactor: p.num("dampening_factor"),
      };
    }
    case "OP_ORCHESTRATE_MATERIAL_CONTRAST": {
      const p = policy();
      return {
        targetContrastRatio: p.num("target_contrast_ratio"),
        contrastBalance: p.num("contrast_balance"),
      };
    }
    case "OP_WEATHER_SURFACE_ENTROPY": {
      const p = policy();
      return {
        targetSurfaceEntropy: Number((energyOf("MATERIAL", "material_energy") * p.num("entropy_gain")).toFixed(4)),
        entropyScale: p.num("entropy_scale"),
      };
    }
    case "OP_HARMONIZE_SKY_LUMINANCE": {
      const p = policy();
      return {
        targetSkyLuminance: Number((energyOf("LIGHT", "light_energy") * p.num("luminance_gain")).toFixed(4)),
        harmonizationFactor: p.num("harmonization_factor"),
      };
    }
    case "OP_COOL_SHADOW_CHROMATICITY": {
      const p = policy();
      return {
        targetShadowTemperature: p.num("target_shadow_temperature"),
        coolingStrength: p.num("cooling_strength"),
      };
    }
    case "OP_FILTER_MIST_SCATTER": {
      const p = policy();
      return {
        targetMistDensity: Number((energyOf("VOID", "void_energy") * p.num("density_gain")).toFixed(4)),
        scatterAnisotropy: p.num("scatter_anisotropy"),
      };
    }
    case "OP_RESTRICT_ACCENT_LUMINANCE": {
      const p = policy();
      return {
        targetAccentLuminance: p.num("target_accent_luminance"),
        restrictionThreshold: p.num("restriction_threshold"),
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
 * 算子推导出的"目标值"参数名：每个算子恰有一个 `target…` 参数（见 deriveOperationParameters），
 * 它就是算子对 OPERATION_TARGET_PATH 所指参数提出的取值；其余参数是该取值的执行细节。
 */
export function primaryTargetKey(parameters: Record<string, number | string | boolean | number[]>): string | undefined {
  return Object.keys(parameters).find((k) => k.startsWith("target"));
}

/**
 * 为操作构建完整溯源链。
 */
function buildProvenance(
  selection: OperationSelectionRecord,
  parameters: Record<string, number | string | boolean | number[]>,
  target: string,
): OperationProvenance {
  const key = primaryTargetKey(parameters);
  const proposedValue = (key !== undefined ? parameters[key] : undefined) ?? parameters.value ?? 0; // ssot-ok(NUMERIC_GUARD): absent-value placeholder of the provenance record, not an aesthetic magnitude

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
  const priority = conflictPriority();
  return [...selections]
    .filter((s) => s.selected)
    .sort((a, b) => {
      const priorityDiff = priority[b.category] - priority[a.category];
      if (priorityDiff !== 0) return priorityDiff; // ssot-ok(NUMERIC_GUARD): comparator sign test (0 = tie), not a magnitude
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
  // 美学数值只来自 DecisionPack：时代必须与生效 sheet 一致，否则抛出（不回退、不吞掉）；
  // 整条流水线在同一个 pack 的作用域内运行，使所有读取落在同一份 sheet 上。
  const pack = requireDecisionPack(input.intent.period);
  return withDecisionPack(pack, () => compileWithinPack(input));
}

function compileWithinPack(input: AestheticCompilerInput): CompilationResult {
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

      // 3. 应用时代先验约束：算子的目标值参数（`target…`）夹逼进 sheet 对该参数的 PERIOD_BAND
      const paramKey = primaryTargetKey(parameters);
      const paramValue = paramKey !== undefined ? parameters[paramKey] : undefined;
      let periodConstraintApplied: string | undefined;

      if (paramKey !== undefined && typeof paramValue === "number") {
        const clampResult = clampToPeriodConstraint(intent.period, target, paramValue);
        if (clampResult.clamped && clampResult.constraint) {
          parameters[paramKey] = Number(clampResult.value.toFixed(4)); // ssot-ok(NUMERIC_GUARD): rounding to the plan's 4-decimal precision, as every derived target
          periodConstraintApplied = `${intent.period}: ${clampResult.constraint.rationale} (clamped ${paramValue} → ${parameters[paramKey]})`;
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
    if (conflictResolutions.length > 0) { // ssot-ok(PROTOCOL): non-empty check of the resolution list, not a magnitude
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
    // sheet 缺陷（缺少决策等）不是"输入编译失败"：必须显式抛出，不能被包装成普通失败结果
    if (error instanceof SheetRejectedError) throw error;
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
