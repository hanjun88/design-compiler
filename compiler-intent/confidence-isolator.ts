/**
 * compiler-intent/confidence-isolator.ts
 *
 * 置信度隔离验证器。
 *
 * 严格隔离原则：
 * - Core IR 中每个参数的 confidence 严格来自 Cangjie 层参数的 confidence（sourceObservationConfidence）
 * - intentResolutionConfidence（意图解析置信度）仅存于 NormalizationMetadata，不得进入 Core IR
 * - mappingConfidence（路径映射置信度）仅存于 NormalizationMetadata，不得进入 Core IR
 * - Core IR 的 provenance 中不得包含任何 confidence 字段
 *
 * 本模块提供静态验证函数，用于测试和运行时断言。
 */

import type { RawDesignIR, RawEstimatedParameter } from "../compiler-core/contracts";
import type { CangjieRawDesignIR, CangjieEstimatedParameter, NormalizationMetadata } from "./types";
import { lookupPointer } from "./pointer-map";

// ============================================================================
// 类型定义
// ============================================================================

export interface ConfidenceIsolationReport {
  /** 验证是否通过 */
  passed: boolean;
  /** 违规列表 */
  violations: ConfidenceViolation[];
  /** 统计信息 */
  stats: {
    totalCoreParameters: number;
    matchedCangjieParameters: number;
    confidenceMatches: number;
    confidenceMismatches: number;
  };
}

export interface ConfidenceViolation {
  /** 违规类型 */
  type:
    | "CONFIDENCE_MISMATCH"
    | "INTENT_RESOLUTION_IN_CORE"
    | "MAPPING_CONFIDENCE_IN_CORE"
    | "PROVENANCE_CONFIDENCE_LEAK"
    | "UNMATCHED_PARAMETER";
  /** 违规描述 */
  message: string;
  /** 相关路径（如有） */
  path?: string;
  /** 期望值（如有） */
  expected?: number;
  /** 实际值（如有） */
  actual?: number;
}

// ============================================================================
// Core IR 参数遍历
// ============================================================================

/**
 * 遍历 Core IR 中所有 RawEstimatedParameter 节点。
 *
 * @param coreIR Core Compiler 层 RawDesignIR
 * @returns 路径 → 参数 的映射
 */
export function collectCoreParameters(
  coreIR: RawDesignIR,
): Map<string, RawEstimatedParameter<unknown>> {
  const result = new Map<string, RawEstimatedParameter<unknown>>();

  // composition
  result.set("/composition/focalPoint", coreIR.composition.focalPoint);
  result.set("/composition/negativeSpaceRatio", coreIR.composition.negativeSpaceRatio);
  result.set("/composition/depthLayerCount", coreIR.composition.depthLayerCount);
  result.set("/composition/symmetry", coreIR.composition.symmetry);

  // camera
  result.set("/camera/fov", coreIR.camera.fov);
  result.set("/camera/shotSize", coreIR.camera.shotSize);
  result.set("/camera/angle", coreIR.camera.angle);
  result.set("/camera/height", coreIR.camera.height);

  // lighting
  result.set("/lighting/keyLight/azimuth", coreIR.lighting.keyLight.azimuth);
  result.set("/lighting/keyLight/elevation", coreIR.lighting.keyLight.elevation);
  result.set("/lighting/keyLight/colorTemp", coreIR.lighting.keyLight.colorTemp);
  result.set("/lighting/keyLight/intensity", coreIR.lighting.keyLight.intensity);
  result.set("/lighting/keyLight/softness", coreIR.lighting.keyLight.softness);
  result.set("/lighting/ambientRatio", coreIR.lighting.ambientRatio);
  result.set("/lighting/rimLightPresent", coreIR.lighting.rimLightPresent);

  // materials
  coreIR.materials.forEach((mat, index) => {
    result.set(`/materials/${index}/baseType`, mat.baseType);
    result.set(`/materials/${index}/roughness`, mat.roughness);
    result.set(`/materials/${index}/metalness`, mat.metalness);
    result.set(`/materials/${index}/wear`, mat.wear);
  });

  // color
  result.set("/color/dominant", coreIR.color.dominant);
  result.set("/color/secondary", coreIR.color.secondary);
  result.set("/color/accent", coreIR.color.accent);
  result.set("/color/contrastRatio", coreIR.color.contrastRatio);
  result.set("/color/temperatureBias", coreIR.color.temperatureBias);

  return result;
}

// ============================================================================
// Cangjie 参数索引
// ============================================================================

/**
 * 构建 Cangjie 参数的 path → 参数 索引。
 *
 * @param cangjieIR Cangjie 层 RawDesignIR
 * @returns path → 参数 的映射（最后一个参数覆盖前面的）
 */
export function buildCangjieParameterIndex(
  cangjieIR: CangjieRawDesignIR,
): Map<string, CangjieEstimatedParameter> {
  const result = new Map<string, CangjieEstimatedParameter>();
  for (const param of cangjieIR.parameters) {
    result.set(param.path, param); // 后面的覆盖前面的，与 normalizer 行为一致
  }
  return result;
}

// ============================================================================
// 置信度隔离验证
// ============================================================================

/**
 * 验证 Core IR 中每个参数的 confidence 严格来自 Cangjie 参数的 confidence。
 *
 * 同时验证：
 * - intentResolutionConfidence 不进入 Core IR
 * - mappingConfidence 不进入 Core IR
 * - Core IR provenance 中不包含 confidence 字段
 *
 * @param cangjieIR Cangjie 层 RawDesignIR（输入）
 * @param coreIR Core Compiler 层 RawDesignIR（输出）
 * @param metadata 正常化元数据（内部使用）
 * @returns 验证报告
 */
export function verifyConfidenceIsolation(
  cangjieIR: CangjieRawDesignIR,
  coreIR: RawDesignIR,
  metadata: NormalizationMetadata,
): ConfidenceIsolationReport {
  const violations: ConfidenceViolation[] = [];
  const coreParams = collectCoreParameters(coreIR);
  const cangjieIndex = buildCangjieParameterIndex(cangjieIR);

  let confidenceMatches = 0;
  let confidenceMismatches = 0;
  let matchedCangjieParameters = 0;

  // 1. 逐个验证 Core 参数的 confidence
  for (const [path, coreParam] of coreParams) {
    const cangjieParam = cangjieIndex.get(path);

    if (!cangjieParam) {
      // 未匹配的参数（可能是默认占位值），不视为违规，只记录
      continue;
    }

    matchedCangjieParameters++;

    // 验证 confidence 严格相等
    if (coreParam.confidence !== cangjieParam.confidence) {
      confidenceMismatches++;
      violations.push({
        type: "CONFIDENCE_MISMATCH",
        message: `Core parameter confidence does not match Cangjie sourceObservationConfidence`,
        path,
        expected: cangjieParam.confidence,
        actual: coreParam.confidence,
      });
    } else {
      confidenceMatches++;
    }
  }

  // 2. 验证 intentResolutionConfidence 不进入 Core IR
  // 检查 Core IR 的所有参数中是否有 derivedFrom 或 evidence 包含 intentResolutionConfidence
  for (const [path, coreParam] of coreParams) {
    if (coreParam.evidence?.some((e) => e.includes("intentResolutionConfidence"))) {
      violations.push({
        type: "INTENT_RESOLUTION_IN_CORE",
        message: `intentResolutionConfidence leaked into Core IR evidence`,
        path,
      });
    }
    if (coreParam.derivedFrom?.includes("intentResolutionConfidence")) {
      violations.push({
        type: "INTENT_RESOLUTION_IN_CORE",
        message: `intentResolutionConfidence leaked into Core IR derivedFrom`,
        path,
      });
    }
  }

  // 3. 验证 mappingConfidence 不进入 Core IR
  for (const [path, coreParam] of coreParams) {
    if (coreParam.evidence?.some((e) => e.includes("mappingConfidence"))) {
      violations.push({
        type: "MAPPING_CONFIDENCE_IN_CORE",
        message: `mappingConfidence leaked into Core IR evidence`,
        path,
      });
    }
  }

  // 4. 验证 Core IR provenance 中不包含 confidence 字段
  const provenanceAny = coreIR.provenance as Record<string, unknown>;
  if ("confidence" in provenanceAny) {
    violations.push({
      type: "PROVENANCE_CONFIDENCE_LEAK",
      message: `confidence field found in Core IR provenance (must be isolated to metadata)`,
      path: "/provenance/confidence",
    });
  }

  // 5. 验证 metadata 中的 intentResolutionConfidence 和 mappingConfidence 确实存在且合理
  // （这是正向验证，不是违规检测）
  if (metadata.intentResolutionConfidence < 0 || metadata.intentResolutionConfidence > 1) {
    violations.push({
      type: "INTENT_RESOLUTION_IN_CORE",
      message: `metadata.intentResolutionConfidence out of range [0,1]: ${metadata.intentResolutionConfidence}`,
    });
  }
  if (metadata.mappingConfidence < 0 || metadata.mappingConfidence > 1) {
    violations.push({
      type: "MAPPING_CONFIDENCE_IN_CORE",
      message: `metadata.mappingConfidence out of range [0,1]: ${metadata.mappingConfidence}`,
    });
  }

  return {
    passed: violations.length === 0,
    violations,
    stats: {
      totalCoreParameters: coreParams.size,
      matchedCangjieParameters,
      confidenceMatches,
      confidenceMismatches,
    },
  };
}

// ============================================================================
// 便捷断言函数
// ============================================================================

/**
 * 断言置信度隔离通过，否则抛出错误。
 *
 * @param cangjieIR Cangjie 层 RawDesignIR
 * @param coreIR Core Compiler 层 RawDesignIR
 * @param metadata 正常化元数据
 * @throws Error 如果置信度隔离验证失败
 */
export function assertConfidenceIsolation(
  cangjieIR: CangjieRawDesignIR,
  coreIR: RawDesignIR,
  metadata: NormalizationMetadata,
): void {
  const report = verifyConfidenceIsolation(cangjieIR, coreIR, metadata);
  if (!report.passed) {
    const details = report.violations
      .map((v) => `[${v.type}] ${v.message}${v.path ? ` (path=${v.path})` : ""}`)
      .join("\n");
    throw new Error(`Confidence isolation verification failed:\n${details}`);
  }
}
