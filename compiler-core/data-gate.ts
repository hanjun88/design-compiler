/**
 * Data Gate — 置信度熔断与参数准入
 *
 * 职责：
 * 1. 对 RawDesignIR 中的参数执行置信度过滤
 * 2. 执行 Meta Data Gate 三项检查（Source Grounding / Confidence / Calibration）
 * 3. 熔断低置信度参数，标记 EXPERIMENTAL 参数
 * 4. 输出通过过滤的参数列表 + 被拒绝参数清单
 *
 * 注意：本文件为框架占位，具体逻辑待实现。
 */

import type { CompileContext, CompileError, CompileWarning } from './types.js';

// ========== 框架接口 ==========

export interface DataGateResult {
  passed: boolean;
  acceptedParams: unknown[];
  rejectedParams: Array<{
    paramId: string;
    reason: 'low_confidence' | 'uncalibrated' | 'source_insufficient' | 'constraint_violation';
    detail: string;
  }>;
  errors: CompileError[];
  warnings: CompileWarning[];
}

/**
 * 执行数据门禁：对 RawDesignIR 的参数列表执行过滤。
 * 框架占位 — 具体校验逻辑待实现。
 */
export function runDataGate(
  rawParams: unknown[],
  context: CompileContext,
  options?: {
    confidenceThreshold?: number;
    allowExperimental?: boolean;
  }
): DataGateResult {
  // 框架占位：返回默认结果
  return {
    passed: false,
    acceptedParams: [],
    rejectedParams: [],
    errors: [],
    warnings: [],
  };
}

/**
 * 检查单个参数是否通过置信度熔断。
 * 框架占位 — 具体逻辑待实现。
 */
export function checkParamConfidence(
  param: unknown,
  threshold: number
): { passed: boolean; confidence: number } {
  return { passed: false, confidence: 0 }; // 框架占位
}

/**
 * 检查参数是否具备充分的来源支撑。
 * 框架占位 — 具体逻辑待实现。
 */
export function checkParamSource(param: unknown): boolean {
  return false; // 框架占位
}

/**
 * 检查参数校准状态。
 * 框架占位 — 具体逻辑待实现。
 */
export function checkParamCalibration(
  param: unknown
): { status: 'PRODUCTION' | 'EXPERIMENTAL'; method: string } {
  return { status: 'EXPERIMENTAL', method: 'uncalibrated' }; // 框架占位
}
