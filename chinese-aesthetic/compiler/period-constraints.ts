/**
 * 3.4-C: Period Prior Constraints
 *
 * 将 TANG / SONG / MING 转化为参数夹逼区间。
 * 时代仅作先验范围，不作历史绝对化。
 * 仅约束设计算子的参数求解空间，不篡改 Core IR 的声明基准。
 *
 * 核心原则：
 * - 区间约束，不是固定值
 * - 先验引导，不是强制覆盖
 * - 每个约束必须有美学依据
 */

import type { AestheticPeriod } from "../operations/types";
import type { PeriodConstraintSet, ParameterRangeConstraint } from "./types";

// ---------------------------------------------------------------------------
// 时代先验约束集
// ---------------------------------------------------------------------------

/**
 * 唐代（TANG）：雄浑巨构、金碧辉煌、中轴对称、金石包浆
 *
 * 美学特征：
 * - 宏大尺度，建筑占据画面主体，负空间较低
 * - 高饱和色彩（金碧山水），强调亮度突出
 * - 严格中轴对称，秩序感极强
 * - 金石材质，硬度高，包浆厚重
 */
const TANG_CONSTRAINTS: ParameterRangeConstraint[] = [
  {
    target: "scene.composition.negativeSpaceRatio",
    min: 0.15,
    max: 0.40,
    rationale: "唐代雄浑巨构，建筑主体占据画面，留白比例较低",
  },
  {
    target: "scene.composition.axialSymmetry",
    min: 0.70,
    max: 1.00,
    rationale: "唐代建筑严格中轴对称，秩序感极强",
  },
  {
    target: "scene.composition.focalOffset",
    min: 0.00,
    max: 0.15,
    rationale: "唐代中轴对称构图，焦点偏移极小",
  },
  {
    target: "scene.material.roughness",
    min: 0.30,
    max: 0.60,
    rationale: "唐代金石材质，表面相对光滑但有包浆",
  },
  {
    target: "scene.material.patinaLevel",
    min: 0.40,
    max: 0.80,
    rationale: "唐代金石包浆厚重，岁月感强",
  },
  {
    target: "scene.lighting.accentLuminance",
    min: 0.50,
    max: 0.90,
    rationale: "唐代金碧辉煌，强调色亮度突出",
  },
  {
    target: "scene.lighting.skyLuminance",
    min: 0.40,
    max: 0.75,
    rationale: "唐代天空明亮，整体光照充足",
  },
];

/**
 * 宋代（SONG）：虚实相生、计白当黑、烟雨清润、深远气韵
 *
 * 美学特征：
 * - 山水意境，留白比例高，虚实相生
 * - 烟雨清润，雾气密度高，色调低饱和
 * - 深远气韵，层次丰富，深度退晕明显
 * - 材质温润，粗糙度较高，自然质感
 */
const SONG_CONSTRAINTS: ParameterRangeConstraint[] = [
  {
    target: "scene.composition.negativeSpaceRatio",
    min: 0.35,
    max: 0.65,
    rationale: "宋代计白当黑，留白比例高，虚实相生",
  },
  {
    target: "scene.composition.axialSymmetry",
    min: 0.30,
    max: 0.70,
    rationale: "宋代山水非严格对称，追求自然错落",
  },
  {
    target: "scene.spatial.depthLayers",
    min: 3,
    max: 6,
    rationale: "宋代深远气韵，层次丰富，三远法（高远/深远/平远）",
  },
  {
    target: "scene.spatial.atmosphericDensity",
    min: 0.30,
    max: 0.70,
    rationale: "宋代烟雨清润，雾气密度高，大气透视明显",
  },
  {
    target: "scene.material.roughness",
    min: 0.40,
    max: 0.80,
    rationale: "宋代材质温润自然，粗糙度较高",
  },
  {
    target: "scene.material.surfaceEntropy",
    min: 0.30,
    max: 0.65,
    rationale: "宋代自然质感，表面变化丰富但不杂乱",
  },
  {
    target: "scene.lighting.mistDensity",
    min: 0.25,
    max: 0.65,
    rationale: "宋代烟雨朦胧，雾气散射明显",
  },
  {
    target: "scene.lighting.shadowTemperature",
    min: 0.30,
    max: 0.60,
    rationale: "宋代阴影偏冷，青绿色调",
  },
];

/**
 * 明代（MING）：简雅秩序、文房主次、木器包浆、适度尺度
 *
 * 美学特征：
 * - 简雅秩序，留白适中，不极端
 * - 文房主次分明，宾主关系清晰
 * - 木器材质，温暖质感，包浆自然
 * - 适度尺度，不追求宏大或极简
 */
const MING_CONSTRAINTS: ParameterRangeConstraint[] = [
  {
    target: "scene.composition.negativeSpaceRatio",
    min: 0.25,
    max: 0.50,
    rationale: "明代简雅，留白适中，不极端",
  },
  {
    target: "scene.composition.axialSymmetry",
    min: 0.50,
    max: 0.80,
    rationale: "明代文房秩序，轴向对称中等偏高",
  },
  {
    target: "scene.composition.clusterDensity",
    min: 0.30,
    max: 0.60,
    rationale: "明代布局疏密得当，不过密不过疏",
  },
  {
    target: "scene.material.roughness",
    min: 0.40,
    max: 0.70,
    rationale: "明代木器材质，温暖质感，粗糙度中等偏高",
  },
  {
    target: "scene.material.patinaLevel",
    min: 0.30,
    max: 0.65,
    rationale: "明代木器包浆自然，岁月感适中",
  },
  {
    target: "scene.material.contrastRatio",
    min: 0.25,
    max: 0.55,
    rationale: "明代材质对比温和，不强烈",
  },
  {
    target: "scene.lighting.accentLuminance",
    min: 0.30,
    max: 0.60,
    rationale: "明代强调色适度，不刺眼",
  },
];

// ---------------------------------------------------------------------------
// 时代约束集映射
// ---------------------------------------------------------------------------

const PERIOD_CONSTRAINT_SETS: Record<AestheticPeriod, PeriodConstraintSet> = {
  TANG: {
    period: "TANG",
    constraints: TANG_CONSTRAINTS,
    description: "唐代：雄浑巨构、金碧辉煌、中轴对称、金石包浆",
  },
  SONG: {
    period: "SONG",
    constraints: SONG_CONSTRAINTS,
    description: "宋代：虚实相生、计白当黑、烟雨清润、深远气韵",
  },
  MING: {
    period: "MING",
    constraints: MING_CONSTRAINTS,
    description: "明代：简雅秩序、文房主次、木器包浆、适度尺度",
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * 获取指定时代的先验约束集。
 */
export function getPeriodConstraints(period: AestheticPeriod): PeriodConstraintSet {
  return PERIOD_CONSTRAINT_SETS[period];
}

/**
 * 获取指定参数在指定时代的约束区间。
 * @returns 约束区间，若该参数无约束则返回 null
 */
export function getParameterConstraint(
  period: AestheticPeriod,
  target: string,
): ParameterRangeConstraint | null {
  const set = PERIOD_CONSTRAINT_SETS[period];
  return set.constraints.find((c) => c.target === target) ?? null;
}

/**
 * 将值钳制到指定时代的参数约束区间内。
 * @returns 钳制后的值，以及是否被钳制的标记
 */
export function clampToPeriodConstraint(
  period: AestheticPeriod,
  target: string,
  value: number,
): { value: number; clamped: boolean; constraint?: ParameterRangeConstraint } {
  const constraint = getParameterConstraint(period, target);
  if (!constraint) {
    return { value, clamped: false };
  }
  const clamped = Math.min(constraint.max, Math.max(constraint.min, value));
  return {
    value: clamped,
    clamped: clamped !== value,
    constraint,
  };
}

/**
 * 检查值是否在指定时代的参数约束区间内。
 */
export function isWithinPeriodConstraint(
  period: AestheticPeriod,
  target: string,
  value: number,
): { within: boolean; constraint?: ParameterRangeConstraint } {
  const constraint = getParameterConstraint(period, target);
  if (!constraint) {
    return { within: true };
  }
  return {
    within: value >= constraint.min && value <= constraint.max,
    constraint,
  };
}
