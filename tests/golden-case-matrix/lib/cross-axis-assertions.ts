/**
 * Golden Case Matrix — Cross-Axis Assertions
 *
 * 跨单元格断言辅助函数，对应 GOLDEN-CASE-MATRIX-CONTRACT-v1.md §4.2 的
 * XA-01 ~ XA-07 断言规格。
 *
 * 断言分级（与 Contract §2.4 一致）:
 * - Controlled: 严格受控单变量证明（固定两轴，仅变一轴）
 * - Contrast:   跨单元格差异观察证据（非严格控制变量，双变量同时变化）
 * - Range:      区间符合性与阶跃证明
 * - Robustness: 鲁棒性验证
 */

import type { CellExecutionResult, CellParameterSnapshot } from "./cell-runner";
import { MATRIX_CELL_IDS, type MatrixCellId } from "./cell-runner";

// ============================================================================
// 断言结果类型
// ============================================================================

export interface CrossAxisAssertionResult {
  assertionId: string;
  assertionType: "Controlled" | "Contrast" | "Range" | "Robustness";
  description: string;
  passed: boolean;
  /** 涉及的 Cell ID 列表 */
  involvedCells: MatrixCellId[];
  /** 关键度量值（供诊断） */
  metrics: Record<string, unknown>;
  /** 失败时的详细信息 */
  failureReason: string | null;
}

// ============================================================================
// 辅助：从结果中提取参数快照（带空值保护）
// ============================================================================

function getParams(result: CellExecutionResult): CellParameterSnapshot | null {
  return result.params;
}

function getRenderHash(result: CellExecutionResult): string | null {
  return result.renderResult?.renderHash ?? null;
}

function cellSuccess(result: CellExecutionResult): boolean {
  return result.success && result.params !== null && result.renderResult !== null;
}

// ============================================================================
// XA-01: 材质正交响应（Controlled）
// ============================================================================

/**
 * XA-01: 同为 TANG+CANDLELIGHT，仅材质不同（GLAZE vs WOOD），
 * 必须生成不同 renderHash。
 *
 * 涉及 Cell: MC-T02 (TANG, GLAZE, CANDLELIGHT) vs MC-X01 (TANG, WOOD, CANDLELIGHT)
 */
export function assertXA01_MaterialOrthogonality(
  results: CellExecutionResult[],
): CrossAxisAssertionResult {
  const t02 = results.find((r) => r.cellId === "MC-T02");
  const x01 = results.find((r) => r.cellId === "MC-X01");

  const metrics: Record<string, unknown> = {
    "MC-T02.success": t02?.success ?? false,
    "MC-X01.success": x01?.success ?? false,
    "MC-T02.renderHash": getRenderHash(t02!) ?? null,
    "MC-X01.renderHash": getRenderHash(x01!) ?? null,
  };

  if (!t02 || !x01 || !cellSuccess(t02) || !cellSuccess(x01)) {
    return {
      assertionId: "XA-01",
      assertionType: "Controlled",
      description: "材质正交响应: TANG+CANDLELIGHT 下 GLAZE vs WOOD 产生不同 renderHash",
      passed: false,
      involvedCells: ["MC-T02", "MC-X01"],
      metrics,
      failureReason: "One or both cells did not execute successfully",
    };
  }

  const hashT02 = getRenderHash(t02)!;
  const hashX01 = getRenderHash(x01)!;
  const distinct = hashT02 !== hashX01;

  return {
    assertionId: "XA-01",
    assertionType: "Controlled",
    description: "材质正交响应: TANG+CANDLELIGHT 下 GLAZE vs WOOD 产生不同 renderHash",
    passed: distinct,
    involvedCells: ["MC-T02", "MC-X01"],
    metrics,
    failureReason: distinct ? null : `renderHash identical: ${hashT02}`,
  };
}

// ============================================================================
// XA-02: 范式风格分化（Contrast — 非严格控制变量）
// ============================================================================

/**
 * XA-02: 比较 MING 与 TANG 在构图与尺度先验上的显著差异。
 * 非严格单变量正交（M01 是 DAYLIGHT，X01 是 CANDLELIGHT），
 * 仅作为范式差异观察证据。
 *
 * 涉及 Cell: MC-M01 (MING, WOOD, DAYLIGHT) vs MC-X01 (TANG, WOOD, CANDLELIGHT)
 * 验证: composition.symmetry 与 negativeSpaceRatio 显著分化
 */
export function assertXA02_ParadigmStyleDifferentiation(
  results: CellExecutionResult[],
): CrossAxisAssertionResult {
  const m01 = results.find((r) => r.cellId === "MC-M01");
  const x01 = results.find((r) => r.cellId === "MC-X01");

  const m01Params = getParams(m01!);
  const x01Params = getParams(x01!);

  const metrics: Record<string, unknown> = {
    "MC-M01.success": m01?.success ?? false,
    "MC-X01.success": x01?.success ?? false,
    "MC-M01.symmetry": m01Params?.symmetry ?? null,
    "MC-X01.symmetry": x01Params?.symmetry ?? null,
    "MC-M01.negativeSpaceRatio": m01Params?.negativeSpaceRatio ?? null,
    "MC-X01.negativeSpaceRatio": x01Params?.negativeSpaceRatio ?? null,
  };

  if (!m01Params || !x01Params) {
    return {
      assertionId: "XA-02",
      assertionType: "Contrast",
      description: "范式风格分化: MING vs TANG 构图参数显著分化（非严格控制变量观察证据）",
      passed: false,
      involvedCells: ["MC-M01", "MC-X01"],
      metrics,
      failureReason: "Parameter snapshots unavailable",
    };
  }

  const symmetryDelta = Math.abs(m01Params.symmetry - x01Params.symmetry);
  const voidDelta = Math.abs(m01Params.negativeSpaceRatio - x01Params.negativeSpaceRatio);
  // 显著分化阈值: symmetry delta > 0.05 或 voidRatio delta > 0.05
  const differentiated = symmetryDelta > 0.05 || voidDelta > 0.05;

  metrics["symmetryDelta"] = symmetryDelta;
  metrics["negativeSpaceDelta"] = voidDelta;

  return {
    assertionId: "XA-02",
    assertionType: "Contrast",
    description: "范式风格分化: MING vs TANG 构图参数显著分化（非严格控制变量观察证据）",
    passed: differentiated,
    involvedCells: ["MC-M01", "MC-X01"],
    metrics,
    failureReason: differentiated
      ? null
      : `Insufficient differentiation: symmetryDelta=${symmetryDelta.toFixed(4)}, voidDelta=${voidDelta.toFixed(4)}`,
  };
}

// ============================================================================
// XA-03: 光照意图区间符合性（Range）
// ============================================================================

/** 光照意图色温区间（与 Contract §2.3 一致） */
const LIGHTING_INTENT_COLOR_TEMP_RANGES: Record<string, [number, number]> = {
  DAYLIGHT: [5000, 6500],
  CANDLELIGHT: [2700, 3500],
  DIM: [3500, 4500],
};

/** Cell → 光照意图映射 */
const CELL_LIGHTING_INTENT: Record<MatrixCellId, string> = {
  "MC-T01": "DAYLIGHT",
  "MC-T02": "CANDLELIGHT",
  "MC-M01": "DAYLIGHT",
  "MC-S01": "DIM",
  "MC-X01": "CANDLELIGHT",
  "MC-X02": "DIM",
};

/**
 * XA-03: 验证各 Cell 的 colorTemp 严格符合其声明的语义区间，
 * 且跨意图梯度离散（阶跃可分）。
 *
 * 涉及 Cell: 全部 6 cells
 */
export function assertXA03_LightingIntentRange(
  results: CellExecutionResult[],
): CrossAxisAssertionResult {
  const perCell: Record<string, { colorTemp: number; intent: string; inRange: boolean; range: [number, number] }> = {};
  let allInRange = true;
  const failures: string[] = [];

  for (const cellId of MATRIX_CELL_IDS) {
    const result = results.find((r) => r.cellId === cellId);
    const params = getParams(result!);
    const intent = CELL_LIGHTING_INTENT[cellId];
    const range = LIGHTING_INTENT_COLOR_TEMP_RANGES[intent];

    if (!params) {
      allInRange = false;
      failures.push(`${cellId}: params unavailable`);
      perCell[cellId] = { colorTemp: NaN, intent, inRange: false, range };
      continue;
    }

    const colorTemp = params.keyLightColorTemp;
    const inRange = colorTemp >= range[0] && colorTemp <= range[1];
    perCell[cellId] = { colorTemp, intent, inRange, range };

    if (!inRange) {
      allInRange = false;
      failures.push(`${cellId}: colorTemp=${colorTemp}K outside ${intent} range [${range[0]}, ${range[1]}]`);
    }
  }

  // 阶跃可分: CANDLELIGHT 均值 < DIM 均值 < DAYLIGHT 均值
  const candleTemps = Object.values(perCell).filter((c) => c.intent === "CANDLELIGHT").map((c) => c.colorTemp);
  const dimTemps = Object.values(perCell).filter((c) => c.intent === "DIM").map((c) => c.colorTemp);
  const dayTemps = Object.values(perCell).filter((c) => c.intent === "DAYLIGHT").map((c) => c.colorTemp);

  const candleMean = candleTemps.reduce((a, b) => a + b, 0) / Math.max(candleTemps.length, 1);
  const dimMean = dimTemps.reduce((a, b) => a + b, 0) / Math.max(dimTemps.length, 1);
  const dayMean = dayTemps.reduce((a, b) => a + b, 0) / Math.max(dayTemps.length, 1);
  const stepwiseSeparable = candleMean < dimMean && dimMean < dayMean;

  const metrics: Record<string, unknown> = {
    perCell,
    candleMean,
    dimMean,
    dayMean,
    stepwiseSeparable,
  };

  const passed = allInRange && stepwiseSeparable;
  let failureReason: string | null = null;
  if (!passed) {
    const reasons: string[] = [];
    if (!allInRange) reasons.push(`Range violations: ${failures.join("; ")}`);
    if (!stepwiseSeparable) reasons.push(`Not stepwise separable: candle=${candleMean.toFixed(0)}, dim=${dimMean.toFixed(0)}, day=${dayMean.toFixed(0)}`);
    failureReason = reasons.join(" | ");
  }

  return {
    assertionId: "XA-03",
    assertionType: "Range",
    description: "光照意图区间符合性: colorTemp ∈ lightingIntent.range 且 CANDLELIGHT < DIM < DAYLIGHT 阶跃可分",
    passed,
    involvedCells: [...MATRIX_CELL_IDS],
    metrics,
    failureReason,
  };
}

// ============================================================================
// XA-04: metalness 物理排序（Controlled）
// ============================================================================

/**
 * XA-04: BRONZE cell 的 metalness 显著大于 WOOD cell。
 * 阈值: metalness(BRONZE) > metalness(WOOD) + 0.5
 *
 * 涉及 Cell: MC-T01 (BRONZE) vs MC-M01 (WOOD) / MC-X01 (WOOD)
 */
export function assertXA04_MetalnessOrdering(
  results: CellExecutionResult[],
): CrossAxisAssertionResult {
  const bronzeCells = ["MC-T01", "MC-X02"] as MatrixCellId[];
  const woodCells = ["MC-M01", "MC-X01"] as MatrixCellId[];

  const bronzeValues: number[] = [];
  const woodValues: number[] = [];
  const metrics: Record<string, unknown> = {};

  for (const cellId of bronzeCells) {
    const r = results.find((x) => x.cellId === cellId);
    const p = getParams(r!);
    if (p) {
      bronzeValues.push(p.dominantMetalness);
      metrics[`${cellId}.metalness`] = p.dominantMetalness;
    }
  }
  for (const cellId of woodCells) {
    const r = results.find((x) => x.cellId === cellId);
    const p = getParams(r!);
    if (p) {
      woodValues.push(p.dominantMetalness);
      metrics[`${cellId}.metalness`] = p.dominantMetalness;
    }
  }

  if (bronzeValues.length === 0 || woodValues.length === 0) {
    return {
      assertionId: "XA-04",
      assertionType: "Controlled",
      description: "metalness 物理排序: BRONZE > WOOD + 0.5",
      passed: false,
      involvedCells: [...bronzeCells, ...woodCells],
      metrics,
      failureReason: "Insufficient cell data for comparison",
    };
  }

  const minBronze = Math.min(...bronzeValues);
  const maxWood = Math.max(...woodValues);
  const passed = minBronze > maxWood + 0.5;

  metrics["minBronze"] = minBronze;
  metrics["maxWood"] = maxWood;
  metrics["delta"] = minBronze - maxWood;

  return {
    assertionId: "XA-04",
    assertionType: "Controlled",
    description: "metalness 物理排序: BRONZE > WOOD + 0.5",
    passed,
    involvedCells: [...bronzeCells, ...woodCells],
    metrics,
    failureReason: passed ? null : `Insufficient separation: minBronze=${minBronze}, maxWood=${maxWood}, delta=${(minBronze - maxWood).toFixed(3)} (need >0.5)`,
  };
}

// ============================================================================
// XA-05: roughness 物理排序（Controlled）
// ============================================================================

/**
 * XA-05: GLAZE cell 的 roughness 显著小于 STONE cell。
 * 阈值: roughness(GLAZE) < roughness(STONE) - 0.1
 *
 * 涉及 Cell: MC-T02 (GLAZE) vs MC-S01 (STONE)
 */
export function assertXA05_RoughnessOrdering(
  results: CellExecutionResult[],
): CrossAxisAssertionResult {
  const t02 = results.find((r) => r.cellId === "MC-T02");
  const s01 = results.find((r) => r.cellId === "MC-S01");
  const t02Params = getParams(t02!);
  const s01Params = getParams(s01!);

  const metrics: Record<string, unknown> = {
    "MC-T02.roughness": t02Params?.dominantRoughness ?? null,
    "MC-S01.roughness": s01Params?.dominantRoughness ?? null,
  };

  if (!t02Params || !s01Params) {
    return {
      assertionId: "XA-05",
      assertionType: "Controlled",
      description: "roughness 物理排序: GLAZE < STONE - 0.1",
      passed: false,
      involvedCells: ["MC-T02", "MC-S01"],
      metrics,
      failureReason: "Parameter snapshots unavailable",
    };
  }

  const glazeRoughness = t02Params.dominantRoughness;
  const stoneRoughness = s01Params.dominantRoughness;
  const passed = glazeRoughness < stoneRoughness - 0.1;

  metrics["delta"] = stoneRoughness - glazeRoughness;

  return {
    assertionId: "XA-05",
    assertionType: "Controlled",
    description: "roughness 物理排序: GLAZE < STONE - 0.1",
    passed,
    involvedCells: ["MC-T02", "MC-S01"],
    metrics,
    failureReason: passed ? null : `Insufficient separation: glaze=${glazeRoughness}, stone=${stoneRoughness}, delta=${(stoneRoughness - glazeRoughness).toFixed(3)} (need >0.1)`,
  };
}

// ============================================================================
// XA-06: colorTemp 物理排序（Controlled）
// ============================================================================

/**
 * XA-06: CANDLELIGHT 色温显著低于 DAYLIGHT。
 * 阈值: colorTemp(CANDLELIGHT) < colorTemp(DAYLIGHT) - 1500
 *
 * 涉及 Cell: MC-T02/MC-X01 (CANDLELIGHT) vs MC-T01/MC-M01 (DAYLIGHT)
 */
export function assertXA06_ColorTempOrdering(
  results: CellExecutionResult[],
): CrossAxisAssertionResult {
  const candleCells = ["MC-T02", "MC-X01"] as MatrixCellId[];
  const dayCells = ["MC-T01", "MC-M01"] as MatrixCellId[];

  const candleTemps: number[] = [];
  const dayTemps: number[] = [];
  const metrics: Record<string, unknown> = {};

  for (const cellId of candleCells) {
    const r = results.find((x) => x.cellId === cellId);
    const p = getParams(r!);
    if (p) {
      candleTemps.push(p.keyLightColorTemp);
      metrics[`${cellId}.colorTemp`] = p.keyLightColorTemp;
    }
  }
  for (const cellId of dayCells) {
    const r = results.find((x) => x.cellId === cellId);
    const p = getParams(r!);
    if (p) {
      dayTemps.push(p.keyLightColorTemp);
      metrics[`${cellId}.colorTemp`] = p.keyLightColorTemp;
    }
  }

  if (candleTemps.length === 0 || dayTemps.length === 0) {
    return {
      assertionId: "XA-06",
      assertionType: "Controlled",
      description: "colorTemp 物理排序: CANDLELIGHT < DAYLIGHT - 1500K",
      passed: false,
      involvedCells: [...candleCells, ...dayCells],
      metrics,
      failureReason: "Insufficient cell data for comparison",
    };
  }

  const maxCandle = Math.max(...candleTemps);
  const minDay = Math.min(...dayTemps);
  const passed = maxCandle < minDay - 1500;

  metrics["maxCandle"] = maxCandle;
  metrics["minDay"] = minDay;
  metrics["delta"] = minDay - maxCandle;

  return {
    assertionId: "XA-06",
    assertionType: "Controlled",
    description: "colorTemp 物理排序: CANDLELIGHT < DAYLIGHT - 1500K",
    passed,
    involvedCells: [...candleCells, ...dayCells],
    metrics,
    failureReason: passed ? null : `Insufficient separation: maxCandle=${maxCandle}K, minDay=${minDay}K, delta=${minDay - maxCandle}K (need >1500K)`,
  };
}

// ============================================================================
// XA-07: 跨轴非退化（Robustness）
// ============================================================================

/**
 * XA-07: 弱文化关联 cell（X01/X02）同样无障碍通过管线全链路。
 * 验证: X01 和 X02 的 success === true，且 params/renderResult 非空
 *
 * 涉及 Cell: MC-X01, MC-X02
 */
export function assertXA07_CrossAxisNonDegradation(
  results: CellExecutionResult[],
): CrossAxisAssertionResult {
  const x01 = results.find((r) => r.cellId === "MC-X01");
  const x02 = results.find((r) => r.cellId === "MC-X02");

  const metrics: Record<string, unknown> = {
    "MC-X01.success": x01?.success ?? false,
    "MC-X01.finalStage": x01?.finalStage ?? null,
    "MC-X01.errors": x01?.errors ?? [],
    "MC-X02.success": x02?.success ?? false,
    "MC-X02.finalStage": x02?.finalStage ?? null,
    "MC-X02.errors": x02?.errors ?? [],
  };

  const x01Ok = x01 !== undefined && cellSuccess(x01);
  const x02Ok = x02 !== undefined && cellSuccess(x02);
  const passed = x01Ok && x02Ok;

  let failureReason: string | null = null;
  if (!passed) {
    const reasons: string[] = [];
    if (!x01Ok) reasons.push(`MC-X01 failed: stage=${x01?.finalStage}, errors=${(x01?.errors ?? []).join("; ")}`);
    if (!x02Ok) reasons.push(`MC-X02 failed: stage=${x02?.finalStage}, errors=${(x02?.errors ?? []).join("; ")}`);
    failureReason = reasons.join(" | ");
  }

  return {
    assertionId: "XA-07",
    assertionType: "Robustness",
    description: "跨轴非退化: 弱文化关联 cell (X01/X02) 管线全链路贯通",
    passed,
    involvedCells: ["MC-X01", "MC-X02"],
    metrics,
    failureReason,
  };
}

// ============================================================================
// 批量执行全部 XA 断言
// ============================================================================

/**
 * 执行全部 7 项跨轴断言。
 */
export function runAllCrossAxisAssertions(
  results: CellExecutionResult[],
): CrossAxisAssertionResult[] {
  return [
    assertXA01_MaterialOrthogonality(results),
    assertXA02_ParadigmStyleDifferentiation(results),
    assertXA03_LightingIntentRange(results),
    assertXA04_MetalnessOrdering(results),
    assertXA05_RoughnessOrdering(results),
    assertXA06_ColorTempOrdering(results),
    assertXA07_CrossAxisNonDegradation(results),
  ];
}
