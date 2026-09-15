/**
 * material Evaluator — material 维度评测器
 *
 * 框架占位 — 具体评测逻辑待实现。
 * 每个评测器负责一个维度的子检查项，输出 MetricDimension。
 */

import type { MetricDimension, MetricCheck } from '../../compiler-core/types.js';

export interface MaterialEvalOptions {
  baseline?: number;
  tolerance?: number;
  weight?: number;
}

/**
 * 执行 material 维度评测。
 * 框架占位 — 具体逻辑待实现。
 */
export function evaluateMaterial(
  renderOutput: unknown,
  options?: MaterialEvalOptions
): MetricDimension {
  return {
    score: 0,
    weight: options?.weight ?? 0,
    tolerance: options?.tolerance ?? 0,
    checks: [],
  };
}

/**
 * 创建单个子检查项。
 * 框架占位。
 */
export function createCheck(
  checkId: string,
  name: string,
  passed: boolean,
  message: string
): MetricCheck {
  return {
    checkId,
    name,
    passed,
    severity: 'preferred',
    actualValue: 0,
    message,
  };
}
