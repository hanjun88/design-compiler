/**
 * material Evaluator — 材质维度评测器
 *
 * 从 ValidatedDesignIR.materials 读取参数，计算材质维度分数。
 * 检查项：材质存在性、自然粗糙度、低金属感、岁月痕迹。
 */

import type { MetricDimension, MetricCheck, ConstraintLevel } from '../../compiler-core/types.js';
import type { ValidatedDesignIR } from '../../compiler-core/contracts.js';

export interface MaterialEvalOptions {
  baseline?: number;
  tolerance?: number;
  weight?: number;
}

/**
 * 执行 material 维度评测。
 */
export function evaluateMaterial(
  validatedIR: ValidatedDesignIR,
  options?: MaterialEvalOptions
): MetricDimension {
  const materials = validatedIR.validated.materials;
  const checks: MetricCheck[] = [];

  // 检查1：材质存在性 — materials 数组非空
  const hasMaterials = materials.length > 0;
  checks.push({
    checkId: 'MAT-001-MATERIAL-EXISTS',
    name: '材质存在性',
    passed: hasMaterials,
    severity: (hasMaterials ? 'preferred' : 'fatal') as ConstraintLevel,
    actualValue: materials.length,
    expectedRange: { min: 1, max: 10 },
    deviation: hasMaterials ? 0 : 1,
    message: hasMaterials
      ? `材质列表包含 ${materials.length} 种材质`
      : `材质列表为空，无法进行材质评测`,
  });

  if (!hasMaterials) {
    return {
      score: 0,
      weight: options?.weight ?? 0.15,
      tolerance: options?.tolerance ?? 0.05,
      checks,
    };
  }

  // 取 dominant 材质进行评测
  const dominant = materials.find(m => m.role === 'dominant') ?? materials[0];

  // 检查2：自然粗糙度 — roughness 在 [0.30, 0.85]（东方苍润质感）
  const roughness = dominant.roughness.value;
  const roughPass = roughness >= 0.30 && roughness <= 0.85;
  checks.push({
    checkId: 'MAT-002-NATURAL-ROUGHNESS',
    name: '自然粗糙度',
    ruleId: 'CA-RULE-03-CANGRUN',
    passed: roughPass,
    severity: (roughPass ? 'preferred' : 'warning') as ConstraintLevel,
    actualValue: roughness,
    expectedRange: { min: 0.30, max: 0.85 },
    deviation: roughPass ? 0 : Math.min(Math.abs(roughness - 0.30), Math.abs(roughness - 0.85)),
    message: roughPass
      ? `粗糙度 ${roughness.toFixed(2)} 在自然质感区间 [0.30, 0.85]`
      : `粗糙度 ${roughness.toFixed(2)} 偏离自然质感区间 [0.30, 0.85]`,
  });

  // 检查3：低金属感 — metalness <= 0.30（东方美学以木石为主，低金属）
  const metalness = dominant.metalness.value;
  const metalPass = metalness <= 0.30;
  checks.push({
    checkId: 'MAT-003-LOW-METALNESS',
    name: '低金属感',
    passed: metalPass,
    severity: (metalPass ? 'preferred' : 'warning') as ConstraintLevel,
    actualValue: metalness,
    expectedRange: { min: 0, max: 0.30 },
    deviation: metalPass ? 0 : metalness - 0.30,
    message: metalPass
      ? `金属度 ${metalness.toFixed(2)}，符合东方低金属质感 (<=0.30)`
      : `金属度 ${metalness.toFixed(2)}，金属感过强 (>0.30)`,
  });

  // 检查4：岁月痕迹 — wear >= 0.20（苍润并济，避免全新塑料感）
  const wear = dominant.wear.value;
  const wearPass = wear >= 0.20;
  checks.push({
    checkId: 'MAT-004-AGE-WEAR',
    name: '岁月痕迹度',
    passed: wearPass,
    severity: (wearPass ? 'preferred' : 'warning') as ConstraintLevel,
    actualValue: wear,
    expectedRange: { min: 0.20, max: 0.90 },
    deviation: wearPass ? 0 : 0.20 - wear,
    message: wearPass
      ? `磨损度 ${wear.toFixed(2)}，呈现岁月质感 (>=0.20)`
      : `磨损度 ${wear.toFixed(2)}，过于崭新缺乏质感 (<0.20)`,
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
