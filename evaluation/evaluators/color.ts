/**
 * color Evaluator — 色彩维度评测器
 *
 * 从 ValidatedDesignIR.color 读取参数，计算色彩维度分数。
 * 检查项：对比度、色温平衡、三色体系、色相差。
 */

import type { MetricDimension, MetricCheck, ConstraintLevel } from '../../compiler-core/types.js';
import type { ValidatedDesignIR } from '../../compiler-core/contracts.js';

export interface ColorEvalOptions {
  baseline?: number;
  tolerance?: number;
  weight?: number;
}

/**
 * 解析 hex 颜色为 RGB。
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = hex.replace('#', '').match(/^([0-9a-fA-F]{6})$/);
  if (!match) return null;
  const num = parseInt(match[1], 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

/**
 * 计算两个 hex 颜色的欧氏色差（0-441）。
 */
function colorDistance(hex1: string, hex2: string): number {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  if (!c1 || !c2) return 0;
  return Math.sqrt(
    Math.pow(c1.r - c2.r, 2) +
    Math.pow(c1.g - c2.g, 2) +
    Math.pow(c1.b - c2.b, 2)
  );
}

/**
 * 执行 color 维度评测。
 */
export function evaluateColor(
  validatedIR: ValidatedDesignIR,
  options?: ColorEvalOptions
): MetricDimension {
  const color = validatedIR.validated.color;
  const checks: MetricCheck[] = [];

  // 检查1：对比度 — contrastRatio >= 3.0 (WCAG AA 大字标准)
  const contrast = color.contrastRatio.value;
  const contrastPass = contrast >= 3.0;
  checks.push({
    checkId: 'COLOR-001-CONTRAST',
    name: '色彩对比度',
    passed: contrastPass,
    severity: (contrastPass ? 'preferred' : 'hard') as ConstraintLevel,
    actualValue: contrast,
    expectedRange: { min: 3.0, max: 21.0 },
    deviation: contrastPass ? 0 : 3.0 - contrast,
    message: contrastPass
      ? `对比度 ${contrast.toFixed(1)} 达到可读性标准 (>=3.0)`
      : `对比度 ${contrast.toFixed(1)} 不足可读性标准 (<3.0)`,
  });

  // 检查2：色温平衡 — temperatureBias 在 [-0.30, 0.30]
  const tempBias = color.temperatureBias.value;
  const tempPass = tempBias >= -0.30 && tempBias <= 0.30;
  checks.push({
    checkId: 'COLOR-002-TEMPERATURE-BALANCE',
    name: '色温平衡度',
    ruleId: 'CA-RULE-04-SHEJI',
    passed: tempPass,
    severity: (tempPass ? 'preferred' : 'warning') as ConstraintLevel,
    actualValue: tempBias,
    expectedRange: { min: -0.30, max: 0.30 },
    deviation: tempPass ? 0 : Math.abs(tempBias) - 0.30,
    message: tempPass
      ? `色温偏移 ${tempBias.toFixed(2)} 在平衡区间 [-0.30, 0.30]`
      : `色温偏移 ${tempBias.toFixed(2)} 超出平衡区间 [-0.30, 0.30]`,
  });

  // 检查3：三色体系 — dominant/secondary/accent 均为有效 hex
  const dominant = color.dominant.value;
  const secondary = color.secondary.value;
  const accent = color.accent.value;
  const triadPass =
    hexToRgb(dominant) !== null &&
    hexToRgb(secondary) !== null &&
    hexToRgb(accent) !== null;
  checks.push({
    checkId: 'COLOR-003-TRIAD-SYSTEM',
    name: '三色体系完整性',
    passed: triadPass,
    severity: (triadPass ? 'preferred' : 'hard') as ConstraintLevel,
    actualValue: `${dominant}/${secondary}/${accent}`,
    message: triadPass
      ? `三色体系完整：主色 ${dominant} / 辅色 ${secondary} / 点缀 ${accent}`
      : `三色体系不完整，存在无效 hex 颜色`,
  });

  // 检查4：色相差 — accent 与 dominant 色差 >= 50（避免单调）
  const accentDist = colorDistance(accent, dominant);
  const huePass = accentDist >= 50;
  checks.push({
    checkId: 'COLOR-004-ACCENT-HUE-DELTA',
    name: '点缀色色相差',
    passed: huePass,
    severity: (huePass ? 'preferred' : 'warning') as ConstraintLevel,
    actualValue: accentDist,
    expectedRange: { min: 50, max: 441 },
    deviation: huePass ? 0 : 50 - accentDist,
    message: huePass
      ? `点缀色与主色色差 ${accentDist.toFixed(0)}，层次分明 (>=50)`
      : `点缀色与主色色差 ${accentDist.toFixed(0)}，过于接近 (<50)`,
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
