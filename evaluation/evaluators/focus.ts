/**
 * focus Evaluator — 焦点维度评测器
 *
 * 从 ValidatedDesignIR.composition.focalPoint 读取参数，计算焦点维度分数。
 * 检查项：焦点置信度、焦点居中、焦点稳定（位移距离）。
 */

import type { MetricDimension, MetricCheck, ConstraintLevel } from '../../compiler-core/types.js';
import type { ValidatedDesignIR } from '../../compiler-core/contracts.js';

export interface FocusEvalOptions {
  baseline?: number;
  tolerance?: number;
  weight?: number;
}

/**
 * 执行 focus 维度评测。
 */
export function evaluateFocus(
  validatedIR: ValidatedDesignIR,
  options?: FocusEvalOptions
): MetricDimension {
  const focalPoint = validatedIR.validated.composition.focalPoint;
  const checks: MetricCheck[] = [];

  // 检查1：焦点置信度 — confidence >= 0.80
  const confidence = focalPoint.confidence;
  const confPass = confidence >= 0.80;
  checks.push({
    checkId: 'FOCUS-001-CONFIDENCE',
    name: '焦点检测置信度',
    passed: confPass,
    severity: (confPass ? 'preferred' : 'hard') as ConstraintLevel,
    actualValue: confidence,
    expectedRange: { min: 0.80, max: 1.0 },
    deviation: confPass ? 0 : 0.80 - confidence,
    message: confPass
      ? `焦点置信度 ${confidence.toFixed(2)}，检测可靠 (>=0.80)`
      : `焦点置信度 ${confidence.toFixed(2)}，检测不可靠 (<0.80)`,
  });

  // 检查2：焦点居中 — focalPoint 在 [0.30, 0.70] x [0.30, 0.70]
  const [fx, fy] = focalPoint.value;
  const centerPass = fx >= 0.30 && fx <= 0.70 && fy >= 0.30 && fy <= 0.70;
  const focalDist = Math.sqrt(Math.pow(fx - 0.5, 2) + Math.pow(fy - 0.5, 2));
  checks.push({
    checkId: 'FOCUS-002-CENTER-POSITION',
    name: '焦点居中度',
    passed: centerPass,
    severity: (centerPass ? 'preferred' : 'warning') as ConstraintLevel,
    actualValue: [fx, fy],
    expectedRange: { min: 0.30, max: 0.70 },
    deviation: focalDist,
    message: centerPass
      ? `焦点 (${fx.toFixed(2)}, ${fy.toFixed(2)}) 居中区，距中心 ${focalDist.toFixed(3)}`
      : `焦点 (${fx.toFixed(2)}, ${fy.toFixed(2)}) 偏离中心，距中心 ${focalDist.toFixed(3)}`,
  });

  // 检查3：焦点稳定 — 距中心位移 <= 0.15（避免焦点漂移）
  // 注意：focalPoint 参数本身没有 displacementDistance 字段，
  // 这里计算的是焦点相对于画面中心的欧氏距离作为稳定性指标
  const stabilityPass = focalDist <= 0.15;
  checks.push({
    checkId: 'FOCUS-003-STABILITY',
    name: '焦点稳定度',
    passed: stabilityPass,
    severity: (stabilityPass ? 'preferred' : 'warning') as ConstraintLevel,
    actualValue: focalDist,
    expectedRange: { min: 0, max: 0.15 },
    deviation: stabilityPass ? 0 : focalDist - 0.15,
    message: stabilityPass
      ? `焦点距中心 ${focalDist.toFixed(3)}，焦点稳定 (<=0.15)`
      : `焦点距中心 ${focalDist.toFixed(3)}，焦点漂移 (>0.15)`,
  });

  const passedCount = checks.filter(c => c.passed).length;
  const score = passedCount / checks.length;

  return {
    score,
    weight: options?.weight ?? 0.15,
    tolerance: options?.tolerance ?? 0.05,
    checks,
  };
}

/**
 * 创建单个子检查项。
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
