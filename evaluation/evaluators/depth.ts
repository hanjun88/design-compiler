/**
 * depth Evaluator — 深度维度评测器
 *
 * 从 ValidatedDesignIR.composition + camera 读取参数，计算深度维度分数。
 * 检查项：空间层次、视场角、纵深留白、相机水平稳定。
 */

import type { MetricDimension, MetricCheck, ConstraintLevel } from '../../compiler-core/types.js';
import type { ValidatedDesignIR } from '../../compiler-core/contracts.js';

export interface DepthEvalOptions {
  baseline?: number;
  tolerance?: number;
  weight?: number;
}

/**
 * 执行 depth 维度评测。
 */
export function evaluateDepth(
  validatedIR: ValidatedDesignIR,
  options?: DepthEvalOptions
): MetricDimension {
  const comp = validatedIR.validated.composition;
  const camera = validatedIR.validated.camera;
  const checks: MetricCheck[] = [];

  // 检查1：空间层次 — depthLayerCount >= 3
  const depthLayers = comp.depthLayerCount.value;
  const layerPass = depthLayers >= 3;
  checks.push({
    checkId: 'DEPTH-001-LAYER-COUNT',
    name: '空间层次数',
    passed: layerPass,
    severity: (layerPass ? 'preferred' : 'hard') as ConstraintLevel,
    actualValue: depthLayers,
    expectedRange: { min: 3, max: 10 },
    deviation: layerPass ? 0 : 3 - depthLayers,
    message: layerPass
      ? `空间层次 ${depthLayers} 层，纵深充足 (>=3)`
      : `空间层次 ${depthLayers} 层，纵深不足 (<3)`,
  });

  // 检查2：视场角 — camera.fov 在 [28, 50]（东方透视区间，避免广角畸变）
  const fov = camera.fov.value;
  const fovPass = fov >= 28 && fov <= 50;
  checks.push({
    checkId: 'DEPTH-002-FOV-RANGE',
    name: '视场角区间',
    passed: fovPass,
    severity: (fovPass ? 'preferred' : 'warning') as ConstraintLevel,
    actualValue: fov,
    expectedRange: { min: 28, max: 50 },
    deviation: fovPass ? 0 : Math.min(Math.abs(fov - 28), Math.abs(fov - 50)),
    message: fovPass
      ? `视场角 ${fov}° 在东方透视区间 [28°, 50°]`
      : `视场角 ${fov}° 偏离东方透视区间 [28°, 50°]`,
  });

  // 检查3：纵深留白 — negativeSpaceRatio >= 0.40
  const voidRatio = comp.negativeSpaceRatio.value;
  const voidPass = voidRatio >= 0.40;
  checks.push({
    checkId: 'DEPTH-003-DEPTH-VOID',
    name: '纵深留白比',
    ruleId: 'CA-RULE-01-XUSHI',
    passed: voidPass,
    severity: (voidPass ? 'preferred' : 'warning') as ConstraintLevel,
    actualValue: voidRatio,
    expectedRange: { min: 0.40, max: 0.70 },
    deviation: voidPass ? 0 : 0.40 - voidRatio,
    message: voidPass
      ? `纵深留白 ${voidRatio.toFixed(2)}，营造空间呼吸感 (>=0.40)`
      : `纵深留白 ${voidRatio.toFixed(2)}，空间压迫感过强 (<0.40)`,
  });

  // 检查4：相机水平稳定 — camera.angle 在 [-10, 10]（避免 Dutch angle）
  const angle = camera.angle.value;
  const anglePass = angle >= -10 && angle <= 10;
  checks.push({
    checkId: 'DEPTH-004-HORIZON-STABILITY',
    name: '相机水平稳定度',
    passed: anglePass,
    severity: (anglePass ? 'preferred' : 'warning') as ConstraintLevel,
    actualValue: angle,
    expectedRange: { min: -10, max: 10 },
    deviation: anglePass ? 0 : Math.abs(angle) - 10,
    message: anglePass
      ? `相机倾角 ${angle}°，地平线稳定 ([-10°, 10°])`
      : `相机倾角 ${angle}°，地平线倾斜 (超出 [-10°, 10°])`,
  });

  const passedCount = checks.filter(c => c.passed).length;
  const score = passedCount / checks.length;

  return {
    score,
    weight: options?.weight ?? 0.20,
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
