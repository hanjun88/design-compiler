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
 *
 * 区间本身不在本模块定义：它们是 skill 规则库（CAS-PB / CAS-VS）的 PERIOD_BAND 决策，
 * 经 AestheticConstraintSheet → DecisionPack 到达编译器，依据（rationale）随决策一并携带。
 * 本模块只负责按时代查询与夹逼；某个参数在该时代没有 PERIOD_BAND，即表示该时代对它不设约束。
 */

import { requireDecisionPack } from "../../skill-bridge/active-pack";
import type { BandView } from "../../skill-bridge/decision-pack";
import type { AestheticPeriod } from "../operations/types";
import type { PeriodConstraintSet, ParameterRangeConstraint } from "./types";

const toConstraint = (band: BandView): ParameterRangeConstraint => ({
  target: band.parameter,
  min: band.min,
  max: band.max,
  rationale: band.rationale,
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * 获取指定时代的先验约束集（当前生效 sheet 中该时代的全部 PERIOD_BAND，按参数路径排序）。
 *
 * description 只是中性的溯源说明（时代 + 决策数 + sheet 决策号）：旧版的美学描述文字
 * 不再属于编译器，美学表述由 skill 的规则依据承载。
 */
export function getPeriodConstraints(period: AestheticPeriod): PeriodConstraintSet {
  const pack = requireDecisionPack(period);
  const targets = [...new Set(pack.allBands().filter((b) => b.semantics === "PERIOD_BAND").map((b) => b.parameter))].sort();
  const constraints = targets.flatMap((target) => {
    const band = pack.periodBand(target);
    return band ? [toConstraint(band)] : [];
  });
  return {
    period,
    constraints,
    description: `${period} period prior bands: ${constraints.length} PERIOD_BAND decisions of ${pack.sheet.decision_id}`,
  };
}

/**
 * 获取指定参数在指定时代的约束区间。
 * @returns 约束区间，若该参数无约束则返回 null
 */
export function getParameterConstraint(
  period: AestheticPeriod,
  target: string,
): ParameterRangeConstraint | null {
  const band = requireDecisionPack(period).periodBand(target);
  return band ? toConstraint(band) : null;
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
