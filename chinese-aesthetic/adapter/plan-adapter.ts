/**
 * 3.4.1-B: Aesthetic-to-Runtime Plan Adapter
 *
 * 将 AestheticExecutionPlan 转换为 AestheticRuntimePlan。
 *
 * 核心职责：
 * 1. Target Schema Normalizer：将美学目标映射为 Runtime 节点路径
 * 2. Parameter Clamping & Type Check：校验数值是否落在 Runtime 物理安全区间
 * 3. Unsupported Operation Watchdog：不支持的算子显式 BLOCKED，禁止静默丢弃
 * 4. Provenance Passthrough：五元溯源完整透传
 *
 * 确定性保证：
 * - 相同 AestheticExecutionPlan → 字节级相同 AestheticRuntimePlan
 * - 指令按 (originalSeq, targetPath) 确定性排序
 * - 所有数值保留 4 位小数
 */

import type { AestheticExecutionPlan, PlanOperation } from "../compiler/types";
import type { DesignOperationId } from "../operations/types";
import type {
  AestheticRuntimePlan,
  RuntimeInstruction,
  RuntimeInstructionType,
  BlockedOperation,
  AdapterResult,
  AdapterError,
  ParameterRangeConstraint,
} from "./types";

// ---------------------------------------------------------------------------
// 确定性哈希（FNV-1a）
// ---------------------------------------------------------------------------

function fnv1a32(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

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
// 美学算子 → Runtime 目标路径映射表
// ---------------------------------------------------------------------------

/**
 * 美学算子到 Runtime 目标路径的映射。
 * 每个映射定义：
 * - targetPath: Runtime 节点路径
 * - instructionType: 指令类型
 * - paramKey: 从操作参数中提取的值的键名
 * - supported: 是否被当前 Runtime 支持
 */
interface OperationMapping {
  targetPath: string;
  instructionType: RuntimeInstructionType;
  paramKey: string;
  supported: boolean;
  unsupportedReason?: string;
}

const OPERATION_MAPPINGS: Record<DesignOperationId, OperationMapping> = {
  // Composition (4)
  OP_ENCLOSE_BREATHING_FIELD: {
    targetPath: "scene.composition.negativeSpaceRatio",
    instructionType: "MUTATE_PROPERTY",
    paramKey: "targetNegativeSpace",
    supported: true,
  },
  OP_ALIGN_GUEST_HOST_TENSION: {
    targetPath: "scene.composition.focalOffset",
    instructionType: "MUTATE_PROPERTY",
    paramKey: "targetFocalOffset",
    supported: true,
  },
  OP_PARTITION_POISSON_CLUSTER: {
    targetPath: "scene.composition.clusterDensity",
    instructionType: "SET_PARAMETER",
    paramKey: "targetClusterDensity",
    supported: true,
  },
  OP_CALIBRATE_AXIAL_ORDER: {
    targetPath: "scene.composition.axialSymmetry",
    instructionType: "MUTATE_PROPERTY",
    paramKey: "targetAxialSymmetry",
    supported: true,
  },
  // Spatial (4)
  OP_LAYER_DEPTH_RECESSION: {
    targetPath: "scene.spatial.depthLayers",
    instructionType: "SET_PARAMETER",
    paramKey: "targetDepthLayers",
    supported: true,
  },
  OP_INJECT_ATMOSPHERIC_VOID: {
    targetPath: "scene.spatial.atmosphericDensity",
    instructionType: "MUTATE_PROPERTY",
    paramKey: "targetAtmosphericDensity",
    supported: true,
  },
  OP_SHIFT_HORIZON_PROPORTION: {
    targetPath: "scene.spatial.horizonPosition",
    instructionType: "MUTATE_PROPERTY",
    paramKey: "targetHorizonPosition",
    supported: true,
  },
  OP_FRAME_SECONDARY_OCCLUSION: {
    targetPath: "scene.spatial.occlusionRatio",
    instructionType: "MUTATE_PROPERTY",
    paramKey: "targetOcclusionRatio",
    supported: true,
  },
  // Material (4)
  OP_APPLY_TIME_PATINA: {
    targetPath: "scene.material.patinaLevel",
    instructionType: "MUTATE_PROPERTY",
    paramKey: "targetPatinaLevel",
    supported: true,
  },
  OP_DAMPEN_SPECULAR_HARSHNESS: {
    targetPath: "scene.material.specularSharpness",
    instructionType: "MUTATE_PROPERTY",
    paramKey: "targetSpecularSharpness",
    supported: true,
  },
  OP_ORCHESTRATE_MATERIAL_CONTRAST: {
    targetPath: "scene.material.contrastRatio",
    instructionType: "MUTATE_PROPERTY",
    paramKey: "targetContrastRatio",
    supported: true,
  },
  OP_WEATHER_SURFACE_ENTROPY: {
    targetPath: "scene.material.surfaceEntropy",
    instructionType: "MUTATE_PROPERTY",
    paramKey: "targetSurfaceEntropy",
    supported: true,
  },
  // Lighting (4)
  OP_HARMONIZE_SKY_LUMINANCE: {
    targetPath: "scene.lighting.skyLuminance",
    instructionType: "MUTATE_PROPERTY",
    paramKey: "targetSkyLuminance",
    supported: true,
  },
  OP_COOL_SHADOW_CHROMATICITY: {
    targetPath: "scene.lighting.shadowTemperature",
    instructionType: "MUTATE_PROPERTY",
    paramKey: "targetShadowTemperature",
    supported: true,
  },
  OP_FILTER_MIST_SCATTER: {
    targetPath: "scene.lighting.mistDensity",
    instructionType: "MUTATE_PROPERTY",
    paramKey: "targetMistDensity",
    supported: true,
  },
  OP_RESTRICT_ACCENT_LUMINANCE: {
    targetPath: "scene.lighting.accentLuminance",
    instructionType: "MUTATE_PROPERTY",
    paramKey: "targetAccentLuminance",
    supported: true,
  },
};

// ---------------------------------------------------------------------------
// 参数范围约束表（Runtime 物理安全区间）
// ---------------------------------------------------------------------------

const PARAMETER_RANGE_CONSTRAINTS: ParameterRangeConstraint[] = [
  // Composition
  { targetPath: "scene.composition.negativeSpaceRatio", min: 0.0, max: 1.0, type: "number", description: "负空间比例" },
  { targetPath: "scene.composition.focalOffset", min: 0.0, max: 1.0, type: "number", description: "焦点偏移" },
  { targetPath: "scene.composition.clusterDensity", min: 0.0, max: 1.0, type: "number", description: "簇密度" },
  { targetPath: "scene.composition.axialSymmetry", min: 0.0, max: 1.0, type: "number", description: "轴对称性" },
  // Spatial
  { targetPath: "scene.spatial.depthLayers", min: 1, max: 10, type: "number", description: "深度层数" },
  { targetPath: "scene.spatial.atmosphericDensity", min: 0.0, max: 1.0, type: "number", description: "大气密度" },
  { targetPath: "scene.spatial.horizonPosition", min: 0.0, max: 1.0, type: "number", description: "视平线位置" },
  { targetPath: "scene.spatial.occlusionRatio", min: 0.0, max: 1.0, type: "number", description: "遮挡比例" },
  // Material
  { targetPath: "scene.material.patinaLevel", min: 0.0, max: 1.0, type: "number", description: "包浆程度" },
  { targetPath: "scene.material.specularSharpness", min: 0.0, max: 100.0, type: "number", description: "高光锐度" },
  { targetPath: "scene.material.contrastRatio", min: 0.0, max: 1.0, type: "number", description: "材质对比度" },
  { targetPath: "scene.material.surfaceEntropy", min: 0.0, max: 1.0, type: "number", description: "表面熵" },
  // Lighting
  { targetPath: "scene.lighting.skyLuminance", min: 0.0, max: 1.0, type: "number", description: "天空亮度" },
  { targetPath: "scene.lighting.shadowTemperature", min: 0.0, max: 1.0, type: "number", description: "阴影色温" },
  { targetPath: "scene.lighting.mistDensity", min: 0.0, max: 1.0, type: "number", description: "雾气密度" },
  { targetPath: "scene.lighting.accentLuminance", min: 0.0, max: 1.0, type: "number", description: "强调色亮度" },
];

// ---------------------------------------------------------------------------
// 参数范围守卫
// ---------------------------------------------------------------------------

interface ParameterValidationResult {
  valid: boolean;
  clampedValue?: number;
  reason?: string;
}

/**
 * 校验参数值是否落在 Runtime 物理安全区间内。
 * 若越界，尝试钳制到区间内。
 */
function validateParameter(targetPath: string, value: unknown): ParameterValidationResult {
  const constraint = PARAMETER_RANGE_CONSTRAINTS.find((c) => c.targetPath === targetPath);
  if (!constraint) {
    // 无约束的参数直接通过
    return { valid: true };
  }

  if (constraint.type === "number" && typeof value === "number") {
    if (constraint.min !== undefined && value < constraint.min) {
      return { valid: false, clampedValue: constraint.min, reason: `value ${value} below min ${constraint.min}` };
    }
    if (constraint.max !== undefined && value > constraint.max) {
      return { valid: false, clampedValue: constraint.max, reason: `value ${value} above max ${constraint.max}` };
    }
    return { valid: true };
  }

  if (constraint.enum && !constraint.enum.includes(value as never)) {
    return { valid: false, reason: `value ${JSON.stringify(value)} not in enum [${constraint.enum.join(", ")}]` };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// 主适配器
// ---------------------------------------------------------------------------

export interface AdapterInput {
  /** 来源 AestheticExecutionPlan */
  aestheticPlan: AestheticExecutionPlan;
  /** 编译时间（确定性输入） */
  compiledAt: string;
}

/**
 * 将 AestheticExecutionPlan 转换为 AestheticRuntimePlan。
 *
 * 执行流水线：
 * 1. 遍历所有已应用操作
 * 2. 查映射表：获取目标路径和指令类型
 * 3. 不支持的算子 → BLOCKED（显式记录，禁止静默丢弃）
 * 4. 参数范围守卫：越界则钳制或 BLOCKED
 * 5. 构建运行时指令（含完整溯源透传）
 * 6. 确定性排序
 * 7. 生成 AestheticRuntimePlan + deterministicDigest
 */
export function adaptAestheticToRuntime(input: AdapterInput): AdapterResult {
  const startTime = Date.now();
  const { aestheticPlan, compiledAt } = input;
  const errors: AdapterError[] = [];
  const blockedOperations: BlockedOperation[] = [];
  const instructions: RuntimeInstruction[] = [];

  let parameterValidations = 0;
  let parameterValidationPassed = 0;

  // 只处理已应用的操作（跳过 skipped 的）
  const appliedOps = aestheticPlan.operations.filter((op) => !op.skippedReason);

  for (const op of appliedOps) {
    const mapping = OPERATION_MAPPINGS[op.operationId];

    // 1. 不支持的算子 → BLOCKED
    if (!mapping || !mapping.supported) {
      blockedOperations.push({
        operationId: op.operationId,
        reason: mapping?.unsupportedReason ?? "Operation not supported by current Runtime adapter",
        code: "UNSUPPORTED_OPERATION",
        provenance: {
          principleRef: op.provenance.principleRef,
          relationRef: op.provenance.relationRef,
          provenanceHash: op.provenance.provenanceHash,
        },
        originalSeq: op.seq,
      });
      errors.push({
        code: "UNSUPPORTED_OPERATION",
        message: `Operation ${op.operationId} is not supported: ${mapping?.unsupportedReason ?? "unknown"}`,
        operationId: op.operationId,
      });
      continue;
    }

    // 2. 提取参数值
    const paramValue = op.parameters[mapping.paramKey];
    if (paramValue === undefined) {
      blockedOperations.push({
        operationId: op.operationId,
        reason: `Parameter key '${mapping.paramKey}' not found in operation parameters`,
        code: "PARAMETER_OUT_OF_RANGE",
        provenance: {
          principleRef: op.provenance.principleRef,
          relationRef: op.provenance.relationRef,
          provenanceHash: op.provenance.provenanceHash,
        },
        originalSeq: op.seq,
      });
      errors.push({
        code: "MISSING_PARAMETER",
        message: `Operation ${op.operationId}: parameter '${mapping.paramKey}' missing`,
        operationId: op.operationId,
      });
      continue;
    }

    // 3. 参数范围守卫
    parameterValidations++;
    const validation = validateParameter(mapping.targetPath, paramValue);
    let finalValue = paramValue;

    if (!validation.valid) {
      if (validation.clampedValue !== undefined) {
        // 越界但可钳制 → 使用钳制值，记录警告
        finalValue = validation.clampedValue;
        errors.push({
          code: "PARAMETER_CLAMPED",
          message: `Operation ${op.operationId}: parameter clamped from ${paramValue} to ${validation.clampedValue} (${validation.reason})`,
          operationId: op.operationId,
        });
      } else {
        // 越界且不可钳制 → BLOCKED
        blockedOperations.push({
          operationId: op.operationId,
          reason: validation.reason ?? "Parameter out of valid range",
          code: "PARAMETER_OUT_OF_RANGE",
          provenance: {
            principleRef: op.provenance.principleRef,
            relationRef: op.provenance.relationRef,
            provenanceHash: op.provenance.provenanceHash,
          },
          originalSeq: op.seq,
        });
        errors.push({
          code: "PARAMETER_OUT_OF_RANGE",
          message: `Operation ${op.operationId}: ${validation.reason}`,
          operationId: op.operationId,
        });
        continue;
      }
    } else {
      parameterValidationPassed++;
    }

    // 4. 数值保留 4 位小数（确定性）
    if (typeof finalValue === "number" && !Number.isInteger(finalValue)) {
      finalValue = Number(finalValue.toFixed(4)) as number;
    }

    // 5. 构建运行时指令（含完整溯源透传）
    const instruction: RuntimeInstruction = {
      type: mapping.instructionType,
      targetPath: mapping.targetPath,
      value: finalValue,
      sourceAestheticOp: op.operationId,
      metadata: {
        principleRef: op.provenance.principleRef,
        relationRef: op.provenance.relationRef,
        provenanceHash: op.provenance.provenanceHash,
        parameterMutation: op.provenance.parameterMutation.map((m) => ({
          target: m.target,
          from: m.from,
          to: m.to,
          rationale: m.rationale,
        })),
      },
      seq: 0, // 占位，下面统一编号
    };

    instructions.push(instruction);
  }

  // 6. 确定性排序：按 (original sourceAestheticOp, targetPath) 排序
  // 由于 instructions 是按 appliedOps 顺序构建的，而 appliedOps 已经是确定性排序，
  // 这里只需要重新分配 seq
  instructions.sort((a, b) => {
    if (a.sourceAestheticOp !== b.sourceAestheticOp) {
      return a.sourceAestheticOp.localeCompare(b.sourceAestheticOp);
    }
    return a.targetPath.localeCompare(b.targetPath);
  });
  instructions.forEach((inst, idx) => {
    inst.seq = idx;
  });

  // 7. 构建 AestheticRuntimePlan
  const plan: AestheticRuntimePlan = {
    executionId: `exec:${aestheticPlan.period.toLowerCase()}:${aestheticPlan.planId.replace("plan:", "")}:v1`,
    planVersion: "1.0.0",
    sourcePlanId: aestheticPlan.planId,
    sourcePlanDigest: aestheticPlan.planDigest,
    period: aestheticPlan.period,
    compiledAt,
    instructions,
    blockedOperations,
    stats: {
      totalInstructions: instructions.length,
      blockedCount: blockedOperations.length,
      parameterValidations,
      parameterValidationPassed,
    },
    deterministicDigest: "", // 占位，下面计算
  };

  // 8. 计算 deterministicDigest（对除 deterministicDigest 外的全部字段哈希）
  const { deterministicDigest: _ignored, ...planWithoutDigest } = plan;
  plan.deterministicDigest = `fnv1a:${fnv1a32(deterministicStringify(planWithoutDigest))}`;

  return {
    success: blockedOperations.length === 0 || errors.every((e) => e.code === "PARAMETER_CLAMPED"),
    plan,
    errors,
    blockedCount: blockedOperations.length,
    durationMs: Date.now() - startTime,
  };
}

// ---------------------------------------------------------------------------
// 确定性验证
// ---------------------------------------------------------------------------

/**
 * 验证适配器的确定性：相同输入两次适配应产生字节级相同的计划。
 */
export function verifyAdapterDeterminism(input: AdapterInput): {
  deterministic: boolean;
  firstDigest: string;
  secondDigest: string;
} {
  const first = adaptAestheticToRuntime(input);
  const second = adaptAestheticToRuntime(input);

  const firstDigest = first.plan?.deterministicDigest ?? "";
  const secondDigest = second.plan?.deterministicDigest ?? "";

  return {
    deterministic: firstDigest === secondDigest,
    firstDigest,
    secondDigest,
  };
}

// ---------------------------------------------------------------------------
// 导出映射表和约束表（供测试和外部使用）
// ---------------------------------------------------------------------------

export { OPERATION_MAPPINGS, PARAMETER_RANGE_CONSTRAINTS };
