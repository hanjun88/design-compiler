/**
 * 3.4-C: 时代先验区间是 AestheticConstraintSheet 的 PERIOD_BAND 决策。
 *
 * 编译器自己不持有任何时代区间：期望值一律从真实 skill 生成的 sheet（DecisionPack）读取，
 * 并用"改写过数值的 sheet"证明函数的返回值确实来自 sheet，而不是代码里残留的常数。
 */

import {
  getPeriodConstraints,
  getParameterConstraint,
  clampToPeriodConstraint,
  isWithinPeriodConstraint,
} from "../../../chinese-aesthetic/compiler";
import type { AestheticPeriod } from "../../../chinese-aesthetic/operations/types";
import { withDecisionPack } from "../../../skill-bridge/active-pack";
import { DecisionContextMismatchError, DecisionPack } from "../../../skill-bridge/decision-pack";
import { validateSheet } from "../../../skill-bridge/sheet-validator";
import { REQUIRED_DECISIONS } from "../../../skill-bridge/requirements";
import { PERIOD_BAND_REQUIREMENTS } from "../../../skill-bridge/requirements/period-bands";
import { mutate } from "../../skill-bridge/helpers/sheet-tools";
import { DEFAULT_CONTEXT_BY_PERIOD, defaultPackFor, loadSheetJson, strictBinding } from "../../support/skill-packs";

const PERIODS: AestheticPeriod[] = ["TANG", "SONG", "MING"];

/** 一个时代的 PERIOD_BAND 决策（按参数路径排序）。 */
const periodBands = (period: AestheticPeriod) =>
  defaultPackFor(period)
    .allBands()
    .filter((b) => b.semantics === "PERIOD_BAND")
    .sort((a, b) => (a.parameter < b.parameter ? -1 : a.parameter > b.parameter ? 1 : 0));

describe("getPeriodConstraints / getParameterConstraint 读取 sheet 的 PERIOD_BAND", () => {
  test("每个时代的约束集恰好是该 sheet 的 PERIOD_BAND 决策（含依据文本）", () => {
    for (const period of PERIODS) {
      const set = getPeriodConstraints(period);
      expect(set.period).toBe(period);
      expect(set.constraints).toEqual(
        periodBands(period).map((b) => ({ target: b.parameter, min: b.min, max: b.max, rationale: b.rationale })),
      );
      expect(set.constraints.length).toBeGreaterThan(0);
    }
  });

  test("约束集的 description 是中性的溯源说明，不含美学表述", () => {
    for (const period of PERIODS) {
      const pack = defaultPackFor(period);
      const { description } = getPeriodConstraints(period);
      expect(description).toContain(period);
      expect(description).toContain(pack.sheet.decision_id);
      expect(description).not.toMatch(/[㐀-鿿]/); // 旧版的中文美学描述已不属于编译器
    }
  });

  test("清单声明的参数在每个时代都有 PERIOD_BAND（其余参数是否受约束由 sheet 决定）", () => {
    expect(PERIOD_BAND_REQUIREMENTS.length).toBeGreaterThan(0);
    for (const requirement of PERIOD_BAND_REQUIREMENTS) {
      for (const period of PERIODS) {
        expect(getParameterConstraint(period, requirement.subject!)).not.toBeNull();
      }
    }
  });

  test("getParameterConstraint：有 PERIOD_BAND 则返回该区间，没有则返回 null", () => {
    const allTargets = new Set(PERIODS.flatMap((p) => periodBands(p).map((b) => b.parameter)));
    let unconstrainedCases = 0;
    for (const period of PERIODS) {
      const constrained = new Map(periodBands(period).map((b) => [b.parameter, b]));
      for (const target of allTargets) {
        const constraint = getParameterConstraint(period, target);
        const band = constrained.get(target);
        if (band) {
          expect(constraint).toEqual({ target, min: band.min, max: band.max, rationale: band.rationale });
        } else {
          expect(constraint).toBeNull(); // 该时代不对此参数设约束（别的时代设了）
          unconstrainedCases++;
        }
      }
      expect(getParameterConstraint(period, "scene.nonexistent.parameter")).toBeNull();
    }
    expect(unconstrainedCases).toBeGreaterThan(0); // 三个时代的约束集并不相同，上面的分支确实被走到
  });

  test("没有约束的参数：clamp 原样返回、isWithin 恒为 true", () => {
    for (const period of PERIODS) {
      expect(clampToPeriodConstraint(period, "scene.nonexistent.parameter", 123)).toEqual({ value: 123, clamped: false });
      expect(isWithinPeriodConstraint(period, "scene.nonexistent.parameter", -5)).toEqual({ within: true });
    }
  });
});

describe("clampToPeriodConstraint / isWithinPeriodConstraint 的区间语义", () => {
  test("区间外钳到端点，区间内与端点本身不动（所有时代的所有 PERIOD_BAND）", () => {
    for (const period of PERIODS) {
      for (const band of periodBands(period)) {
        const span = band.max - band.min;
        const outside = Math.max(span, 1);
        expect(clampToPeriodConstraint(period, band.parameter, band.min - outside)).toMatchObject({ value: band.min, clamped: true });
        expect(clampToPeriodConstraint(period, band.parameter, band.max + outside)).toMatchObject({ value: band.max, clamped: true });
        for (const inside of [band.min, band.max, (band.min + band.max) / 2]) {
          expect(clampToPeriodConstraint(period, band.parameter, inside)).toMatchObject({ value: inside, clamped: false });
          expect(isWithinPeriodConstraint(period, band.parameter, inside).within).toBe(true);
        }
        expect(isWithinPeriodConstraint(period, band.parameter, band.min - outside).within).toBe(false);
        expect(isWithinPeriodConstraint(period, band.parameter, band.max + outside).within).toBe(false);
        // 返回的 constraint 即该参数的约束
        expect(clampToPeriodConstraint(period, band.parameter, band.max + outside).constraint).toEqual(getParameterConstraint(period, band.parameter));
      }
    }
  });
});

describe("数值确实来自 sheet", () => {
  const period: AestheticPeriod = "TANG";
  // 一个只有时代区间、没有 Core IR 指针的参数（改写它不会与语法规则的修复目标冲突）
  const parameter = "scene.lighting.skyLuminance";
  // 合成数值：与 skill 里的任何真实区间都不同；若函数里还残留常数，这里就会暴露
  const synthetic = { min: 0.011, max: 0.023 };

  const syntheticPack = () => {
    const sheet = mutate(loadSheetJson(DEFAULT_CONTEXT_BY_PERIOD[period]), (s) => {
      for (const c of s.constraints) {
        if (c.kind === "PARAMETER_BAND" && c.payload.semantics === "PERIOD_BAND" && c.payload.parameter === parameter) {
          c.payload.min = synthetic.min;
          c.payload.max = synthetic.max;
          c.payload.rationale = "synthetic band for the pack-sensitivity test";
        }
      }
    });
    return DecisionPack.from(validateSheet(sheet, { allowDirty: !strictBinding() }), REQUIRED_DECISIONS);
  };

  test("作用域内的 pack 决定返回值（getParameterConstraint / clamp / getPeriodConstraints）", () => {
    withDecisionPack(syntheticPack(), () => {
      expect(getParameterConstraint(period, parameter)).toEqual({ target: parameter, ...synthetic, rationale: "synthetic band for the pack-sensitivity test" });
      expect(clampToPeriodConstraint(period, parameter, 0.5)).toMatchObject({ value: synthetic.max, clamped: true });
      expect(getPeriodConstraints(period).constraints.find((c) => c.target === parameter)).toMatchObject(synthetic);
    });
    // 作用域之外回到默认 pack（真实 sheet）
    const real = defaultPackFor(period).periodBand(parameter)!;
    expect(getParameterConstraint(period, parameter)).toMatchObject({ min: real.min, max: real.max });
  });
});

describe("时代与生效 sheet 不一致时直接失败，不回退", () => {
  test("每个入口都抛出 DecisionContextMismatchError", () => {
    withDecisionPack(defaultPackFor("TANG"), () => {
      expect(() => getPeriodConstraints("SONG")).toThrow(DecisionContextMismatchError);
      expect(() => getParameterConstraint("SONG", "scene.composition.negativeSpaceRatio")).toThrow(DecisionContextMismatchError);
      expect(() => clampToPeriodConstraint("SONG", "scene.composition.negativeSpaceRatio", 0.5)).toThrow(DecisionContextMismatchError);
      expect(() => isWithinPeriodConstraint("SONG", "scene.composition.negativeSpaceRatio", 0.5)).toThrow(DecisionContextMismatchError);
    });
  });
});
