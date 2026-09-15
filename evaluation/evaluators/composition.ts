/**
 * composition Evaluator — 构图维度评测器
 *
 * 从 ValidatedDesignIR.composition 读取参数，计算构图维度分数。
 * 检查项：虚实留白比、中轴对称、空间层次、焦点居中。
 */

import type { MetricDimension, MetricCheck, ConstraintLevel } from '../../compiler-core/types.js';
import type { ValidatedDesignIR } from '../../compiler-core/contracts.js';

export interface CompositionEvalOptions {
  baseline?: number;
  tolerance?: number;
  weight?: number;
}

/**
 * 执行 composition 维度评测。
 * 从 ValidatedDesignIR 读取构图参数，逐项检查合规性。
 */
export function evaluateComposition(
  validatedIR: ValidatedDesignIR,
  options?: CompositionEvalOptions
): MetricDimension {
  const comp = validatedIR.validated.composition;
  const checks: MetricCheck[] = [];

  // 检查1：虚实留白比 — 合规区间 [0.42, 0.65]
  const voidRatio = comp.negativeSpaceRatio.value;
  const voidPass = voidRatio >= 0.42 && voidRatio <= 0.65;
  checks.push({
    checkId: 'COMP-001-NEGATIVE-SPACE',
    name: '虚实相生留白比',
    ruleId: 'CA-RULE-01-XUSHI',
    passed: voidPass,
    severity: (voidPass ? 'preferred' : 'warning') as ConstraintLevel,
    actualValue: voidRatio,
    expectedRange: { min: 0.42, max: 0.65 },
    deviation: voidPass ? 0 : Math.min(Math.abs(voidRatio - 0.42), Math.abs(voidRatio - 0.65)),
    message: voidPass
      ? `留白比 ${voidRatio.toFixed(2)} 在合规区间 [0.42, 0.65]`
      : `留白比 ${voidRatio.toFixed(2)} 偏离合规区间 [0.42, 0.65]`,
  });

  // 检查2：中轴对称 — symmetry >= 0.70
  const symmetry = comp.symmetry.value;
  const symPass = symmetry >= 0.70;
  checks.push({
    checkId: 'COMP-002-AXIS-SYMMETRY',
    name: '中轴对称度',
    ruleId: 'CA-RULE-05-JINGMO',
    passed: symPass,
    severity: (symPass ? 'preferred' : 'warning') as ConstraintLevel,
    actualValue: symmetry,
    expectedRange: { min: 0.70, max: 1.0 },
    deviation: symPass ? 0 : 0.70 - symmetry,
    message: symPass
      ? `对称度 ${symmetry.toFixed(2)} 达到中轴标准 (>=0.70)`
      : `对称度 ${symmetry.toFixed(2)} 不足中轴标准 (<0.70)`,
  });

  // 检查3：空间层次 — depthLayerCount >= 3
  const depthLayers = comp.depthLayerCount.value;
  const depthPass = depthLayers >= 3;
  checks.push({
    checkId: 'COMP-003-DEPTH-LAYERS',
    name: '空间层次数',
    passed: depthPass,
    severity: (depthPass ? 'preferred' : 'hard') as ConstraintLevel,
    actualValue: depthLayers,
    expectedRange: { min: 3, max: 10 },
    deviation: depthPass ? 0 : 3 - depthLayers,
    message: depthPass
      ? `空间层次 ${depthLayers} 层，满足纵深要求 (>=3)`
      : `空间层次 ${depthLayers} 层，纵深不足 (<3)`,
  });

  // 检查4：焦点居中 — focalPoint 在 [0.30, 0.70] x [0.30, 0.70]
  const [fx, fy] = comp.focalPoint.value;
  const focalCenterPass = fx >= 0.30 && fx <= 0.70 && fy >= 0.30 && fy <= 0.70;
  const focalDist = Math.sqrt(Math.pow(fx - 0.5, 2) + Math.pow(fy - 0.5, 2));
  checks.push({
    checkId: 'COMP-004-FOCAL-CENTER',
    name: '焦点居中度',
    passed: focalCenterPass,
    severity: (focalCenterPass ? 'preferred' : 'warning') as ConstraintLevel,
    actualValue: [fx, fy],
    expectedRange: { min: 0.30, max: 0.70 },
    deviation: focalDist,
    message: focalCenterPass
      ? `焦点 (${fx.toFixed(2)}, ${fy.toFixed(2)}) 居中区，距中心 ${focalDist.toFixed(3)}`
      : `焦点 (${fx.toFixed(2)}, ${fy.toFixed(2)}) 偏离中心，距中心 ${focalDist.toFixed(3)}`,
  });

  const passedCount = checks.filter(c => c.passed).length;
  const score = passedCount / checks.length;

  return {
    score,
    weight: options?.weight ?? 0.25,
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
