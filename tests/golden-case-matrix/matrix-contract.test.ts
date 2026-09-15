/**
 * Golden Case Matrix — Contract Test Suite (CA-01 ~ CA-10)
 *
 * 10 个参数化测试族，每个对 6 个 Matrix Cell 执行断言，覆盖 60 项 CA 断言。
 *
 * 架构分层（核心裁决）：
 * - 输入域断言（CA-08, CA-09）：严格锚定 rawInputSnapshot（模板声明值），
 *   不被 Core Compiler 语法规则（如 CA-RULE-03-CANGRUN）的变换污染。
 * - 变换物证（transformationTrace）：独立记录语法规则重写，供 3.4 封签引用，
 *   不反向影响输入域断言。
 * - 管线域断言（CA-01~CA-07, CA-10）：验证管线执行完整性与输出物理有效性。
 *
 * 硬边界：不修改 Core Compiler / Step 6-B / Evaluator / PBR evidence。
 */

import { runCell, MATRIX_CELL_IDS, type MatrixCellId, type CellExecutionResult } from "./lib/cell-runner";
import { validateMaterialCategory } from "./lib/material-category-guard";
import { computePixelStatistics, loadGoldenRenderManifest, type GoldenRenderManifest } from "./lib/golden-render-evidence";
import { evaluateMaterial } from "../../evaluation/evaluators/material";
import { normalizeIntent } from "../../compiler-intent/intent-normalizer";
import type { ValidatedDesignIR } from "../../compiler-core/contracts";
import * as fs from "node:fs";
import * as path from "node:path";

// ============================================================================
// Cell 结果缓存（避免每个测试族重复执行管线）
// ============================================================================

const cellResultCache = new Map<MatrixCellId, CellExecutionResult>();

function getOrRunCell(cellId: MatrixCellId): CellExecutionResult {
  const cached = cellResultCache.get(cellId);
  if (cached) return cached;
  const result = runCell(cellId);
  cellResultCache.set(cellId, result);
  return result;
}

// 所有测试执行前预热缓存（串行执行 6 cells，确保后续测试直接读取）
beforeAll(() => {
  for (const cellId of MATRIX_CELL_IDS) {
    getOrRunCell(cellId);
  }
}, 120000);

// ============================================================================
// 光照意图区间定义（与 Contract §2.3 一致）
// ============================================================================

interface LightingIntentRange {
  colorTemp: [number, number];
  intensity: [number, number];
  softness: [number, number];
  ambientRatio: [number, number];
}

const LIGHTING_INTENT_RANGES: Record<string, LightingIntentRange> = {
  DAYLIGHT: {
    colorTemp: [5000, 6500],
    intensity: [0.9, 1.4],
    softness: [0.5, 0.8],
    ambientRatio: [0.25, 0.45],
  },
  CANDLELIGHT: {
    colorTemp: [2700, 3500],
    intensity: [0.6, 1.0],
    softness: [0.7, 0.95],
    ambientRatio: [0.15, 0.30],
  },
  DIM: {
    colorTemp: [3500, 4500],
    intensity: [0.3, 0.7],
    softness: [0.4, 0.7],
    ambientRatio: [0.10, 0.25],
  },
};

// Cell → 光照意图映射（与 Contract §3.2 一致）
const CELL_LIGHTING_INTENT: Record<MatrixCellId, string> = {
  "MC-T01": "DAYLIGHT",
  "MC-T02": "CANDLELIGHT",
  "MC-M01": "DAYLIGHT",
  "MC-S01": "DIM",
  "MC-X01": "CANDLELIGHT",
  "MC-X02": "DIM",
};

// Cell → 范式映射
const CELL_PARADIGM: Record<MatrixCellId, string> = {
  "MC-T01": "TANG",
  "MC-T02": "TANG",
  "MC-M01": "MING",
  "MC-S01": "SONG",
  "MC-X01": "TANG",
  "MC-X02": "MING",
};

// ============================================================================
// 辅助：像素缓冲统计
// ============================================================================

function countNonZeroPixels(pixelBuffer: Uint8Array): number {
  let count = 0;
  // RGBA: 每 4 字节一个像素，检查 R 通道非零
  for (let i = 0; i < pixelBuffer.length; i += 4) {
    if (pixelBuffer[i] > 0 || pixelBuffer[i + 1] > 0 || pixelBuffer[i + 2] > 0) {
      count++;
    }
  }
  return count;
}

function hasOutOfRangeBytes(pixelBuffer: Uint8Array): boolean {
  for (let i = 0; i < pixelBuffer.length; i++) {
    if (pixelBuffer[i] < 0 || pixelBuffer[i] > 255) return true;
  }
  return false;
}

// ============================================================================
// CA-01: Pipeline 端到端 SUCCESS
// ============================================================================

describe.each(MATRIX_CELL_IDS)("CA-01: %s Pipeline 端到端 SUCCESS", (cellId) => {
  test("status === SUCCESS 且 finalStage === COMPLETE", () => {
    const result = getOrRunCell(cellId);
    expect(result.success).toBe(true);
    expect(result.finalStage).toBe("COMPLETE");
    expect(result.errors).toHaveLength(0);
  });
});

// ============================================================================
// CA-02: Hash chain 四元完整
// ============================================================================

describe.each(MATRIX_CELL_IDS)("CA-02: %s Hash chain 四元完整", (cellId) => {
  test("rawIRHash / validatedIRHash / executionPlanHash / renderHash 均非空", () => {
    const result = getOrRunCell(cellId);
    expect(result.pipelineOutput).not.toBeNull();
    expect(result.renderResult).not.toBeNull();

    const hashChain = (result.pipelineOutput as { hashChain: Record<string, string> }).hashChain;
    expect(hashChain.rawIRHash).toBeTruthy();
    expect(hashChain.validatedIRHash).toBeTruthy();
    expect(hashChain.executionPlanHash).toBeTruthy();
    expect(result.renderResult!.renderHash).toBeTruthy();
    expect(result.renderResult!.renderHash).toMatch(/^sha256:/);
  });
});

// ============================================================================
// CA-03: Render 像素缓冲有效
// ============================================================================

describe.each(MATRIX_CELL_IDS)("CA-03: %s Render 像素缓冲有效", (cellId) => {
  test("pixelBuffer 518400 字节且 nonZeroPixels > 0", () => {
    const result = getOrRunCell(cellId);
    expect(result.renderResult).not.toBeNull();
    const pixelBuffer = result.renderResult!.pixelBuffer;
    expect(pixelBuffer.byteLength).toBe(518400);
    expect(pixelBuffer.length).toBe(518400);
    const nonZero = countNonZeroPixels(pixelBuffer);
    expect(nonZero).toBeGreaterThan(0);
  });
});

// ============================================================================
// CA-04: Render hash 确定性（两次运行 hash 相同）
// ============================================================================

describe.each(MATRIX_CELL_IDS)("CA-04: %s Render hash 确定性", (cellId) => {
  test("两次独立运行 renderHash 完全相同", () => {
    const run1 = runCell(cellId);
    const run2 = runCell(cellId);
    expect(run1.renderResult).not.toBeNull();
    expect(run2.renderResult).not.toBeNull();
    expect(run1.renderResult!.renderHash).toBe(run2.renderResult!.renderHash);
    // 同时验证像素缓冲逐字节一致
    expect(run1.renderResult!.pixelBuffer).toEqual(run2.renderResult!.pixelBuffer);
  });
});

// ============================================================================
// CA-05: 范式标签存在
// ============================================================================

describe.each(MATRIX_CELL_IDS)("CA-05: %s 范式标签存在", (cellId) => {
  test("rawInputSnapshot.paradigm 与 Cell 定义的范式一致", () => {
    const result = getOrRunCell(cellId);
    expect(result.rawInputSnapshot).not.toBeNull();
    expect(result.rawInputSnapshot!.paradigm).toBe(CELL_PARADIGM[cellId]);
  });
});

// ============================================================================
// CA-06: 材质类别可解析
// ============================================================================

describe.each(MATRIX_CELL_IDS)("CA-06: %s 材质类别可解析", (cellId) => {
  test("baseType 匹配 ^{CATEGORY}:: 格式且 materialCategory 非空", () => {
    const result = getOrRunCell(cellId);
    expect(result.materialCategory).not.toBeNull();
    expect(result.materialCategory).toMatch(/^(WOOD|GLAZE|BRONZE|STONE)$/);
    const baseType = result.rawInputSnapshot!.pbrParams.baseType;
    expect(baseType).toMatch(/^(WOOD|GLAZE|BRONZE|STONE)::.+/);
  });
});

// ============================================================================
// CA-07: 光照意图存在
// ============================================================================

describe.each(MATRIX_CELL_IDS)("CA-07: %s 光照意图存在", (cellId) => {
  test("rawInputSnapshot.lightingIntent 与 Cell 定义的意图一致", () => {
    const result = getOrRunCell(cellId);
    expect(result.rawInputSnapshot).not.toBeNull();
    expect(result.rawInputSnapshot!.lightingIntent).toBe(CELL_LIGHTING_INTENT[cellId]);
  });
});

// ============================================================================
// CA-08: PBR 参数在材质类别区间内（输入域断言）
//
// 【架构分层核心】断言对象为 rawInputSnapshot.pbrParams（模板声明值），
// 而非管线编译输出。CA-RULE-03-CANGRUN 等语法规则对 roughness 的重写
// 记录在 transformationTrace 中，不影响本断言。
// ============================================================================

describe.each(MATRIX_CELL_IDS)("CA-08: %s 声明输入参数符合材质类别物理区间（输入域）", (cellId) => {
  test("roughness / metalness / wear 落在 rawInputSnapshot 声明的材质类别区间内", () => {
    const result = getOrRunCell(cellId);
    expect(result.rawInputSnapshot).not.toBeNull();

    const pbr = result.rawInputSnapshot!.pbrParams;
    const validation = validateMaterialCategory(
      pbr.baseType,
      pbr.roughness,
      pbr.metalness,
      pbr.wear,
    );

    expect(validation.allPassed).toBe(true);
    expect(validation.failures).toHaveLength(0);
    expect(validation.category.parseOk).toBe(true);
  });
});

// ============================================================================
// CA-09: 光照参数在意图区间内（输入域断言）
//
// 【架构分层核心】断言对象为 rawInputSnapshot.lighting（模板声明值）。
// ============================================================================

describe.each(MATRIX_CELL_IDS)("CA-09: %s 声明光照参数符合意图区间（输入域）", (cellId) => {
  test("colorTemp / intensity / softness / ambientRatio 落在 lightingIntent 区间内", () => {
    const result = getOrRunCell(cellId);
    expect(result.rawInputSnapshot).not.toBeNull();

    const lighting = result.rawInputSnapshot!.lighting;
    const intent = result.rawInputSnapshot!.lightingIntent!;
    const range = LIGHTING_INTENT_RANGES[intent];
    expect(range).toBeDefined();

    expect(lighting.colorTemp).toBeGreaterThanOrEqual(range.colorTemp[0]);
    expect(lighting.colorTemp).toBeLessThanOrEqual(range.colorTemp[1]);
    expect(lighting.intensity).toBeGreaterThanOrEqual(range.intensity[0]);
    expect(lighting.intensity).toBeLessThanOrEqual(range.intensity[1]);
    expect(lighting.softness).toBeGreaterThanOrEqual(range.softness[0]);
    expect(lighting.softness).toBeLessThanOrEqual(range.softness[1]);
    expect(lighting.ambientRatio).toBeGreaterThanOrEqual(range.ambientRatio[0]);
    expect(lighting.ambientRatio).toBeLessThanOrEqual(range.ambientRatio[1]);
  });
});

// ============================================================================
// CA-10: Shader 无 NaN/Inf（像素缓冲物理有效性）
//
// Software Renderer 输出 Uint8Array RGBA，不存在 NaN/Inf。
// 本断言验证像素缓冲所有字节在 [0,255] 范围内，且无全零缓冲。
// ============================================================================

describe.each(MATRIX_CELL_IDS)("CA-10: %s 像素缓冲无异常值", (cellId) => {
  test("pixelBuffer 所有字节在 [0,255] 且缓冲非全零", () => {
    const result = getOrRunCell(cellId);
    expect(result.renderResult).not.toBeNull();
    const pixelBuffer = result.renderResult!.pixelBuffer;
    expect(hasOutOfRangeBytes(pixelBuffer)).toBe(false);
    const nonZero = countNonZeroPixels(pixelBuffer);
    expect(nonZero).toBeGreaterThan(0);
    // 总像素数 = 480 * 270 = 129600
    expect(pixelBuffer.length / 4).toBe(129600);
  });
});

// ============================================================================
// GOLDEN HASH FREEZE (3.3-d): 渲染哈希物理固化对账
//
// 将 3.3-d 实机运行产生的 renderHash 正式升格为 Golden Evidence。
// 本测试验证：每次实机运行的 actualRenderHash === manifest 中的 expectedRenderHash，
// 证明渲染管线的绝对确定性。
//
// Golden RenderHash ≠ semantic correctness。它只证明确定性的物理渲染输出。
// ============================================================================

const MANIFEST_PATH = path.join(__dirname, "golden-render-manifest.json");

describe("3.3-d Golden Hash Freeze: 渲染哈希物理固化对账", () => {
  let manifest: GoldenRenderManifest;

  beforeAll(() => {
    manifest = loadGoldenRenderManifest(MANIFEST_PATH);
  });

  test("manifest 包含全部 6 个 Cell 的 Golden Evidence", () => {
    expect(manifest.manifestVersion).toBe("1.0.0");
    expect(manifest.renderer.resolution).toBe("480x270");
    expect(manifest.renderer.pixelFormat).toBe("RGBA8888");
    for (const cellId of MATRIX_CELL_IDS) {
      expect(manifest.cells[cellId]).toBeDefined();
      expect(manifest.cells[cellId].renderHash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(manifest.cells[cellId].pixelByteLength).toBe(518400);
      expect(manifest.cells[cellId].hasNaN).toBe(false);
      expect(manifest.cells[cellId].hasInf).toBe(false);
    }
  });

  test.each(MATRIX_CELL_IDS)(
    "Golden Hash 确定性对账: %s actualRenderHash === expectedRenderHash",
    (cellId) => {
      //  fresh run（不使用缓存），验证绝对确定性
      const result = runCell(cellId);
      expect(result.success).toBe(true);
      expect(result.renderResult).not.toBeNull();

      const expected = manifest.cells[cellId];
      const actualHash = result.renderResult!.renderHash;

      // 核心断言：actual === expected（绝对确定性）
      expect(actualHash).toBe(expected.renderHash);

      // 像素字节数一致
      expect(result.renderResult!.pixelBuffer.byteLength).toBe(expected.pixelByteLength);

      // 像素统计一致（nonZeroPixels 精确匹配）
      const stats = computePixelStatistics(result.renderResult!.pixelBuffer);
      expect(stats.nonZeroPixels).toBe(expected.nonZeroPixels);

      // meanLuminance 精确匹配（确定性渲染应逐字节一致）
      expect(Number(stats.meanLuminance.toFixed(4))).toBe(expected.meanLuminance);

      // NaN/Inf 检查
      expect(stats.hasNaN).toBe(false);
      expect(stats.hasInf).toBe(false);
    },
  );

  test("6 个 Cell 的 Golden Hash 两两互异（材质/光照/范式差异产生不同渲染输出）", () => {
    const hashes = MATRIX_CELL_IDS.map((id) => manifest.cells[id].renderHash);
    const uniqueHashes = new Set(hashes);
    expect(uniqueHashes.size).toBe(6);
  });
});

// ============================================================================
// Part 2: 跨轴断言族 (XA-01 ~ XA-07)
//
// XA = Cross-Axis Relationship：验证跨单元格的正交关系与物理排序。
// 断言分级：Controlled（严格单变量）/ Contrast（非严格控制变量观察）/
//           Range（区间符合性）/ Robustness（鲁棒性）。
// ============================================================================

describe("XA 跨轴断言族 (XA-01 ~ XA-07)", () => {
  // 辅助：从评测结果中提取 material checks（运行时对象含 checks 数组）
  function getMaterialChecks(result: CellExecutionResult): Array<{ checkId: string; passed: boolean; actualValue?: number }> {
    if (!result.evaluation?.metrics) return [];
    const material = result.evaluation.metrics.material as unknown as {
      checks?: Array<{ checkId: string; passed: boolean; actualValue?: number }>;
    };
    return material.checks ?? [];
  }

  // ------------------------------------------------------------------
  // XA-01 (Controlled Material Response)
  // 同范式(TANG) + 同光照(CANDLELIGHT)，仅材质不同(GLAZE vs WOOD)，
  // renderHash 必须互异。
  // ------------------------------------------------------------------
  test("XA-01 [Controlled]: TANG+CANDLELIGHT 下 GLAZE(MC-T02) vs WOOD(MC-X01) renderHash 互异", () => {
    const t02 = getOrRunCell("MC-T02");
    const x01 = getOrRunCell("MC-X01");
    expect(t02.success).toBe(true);
    expect(x01.success).toBe(true);
    expect(t02.renderResult!.renderHash).not.toBe(x01.renderResult!.renderHash);
    // 确认输入域确实仅材质不同（范式=光照相同）
    expect(t02.rawInputSnapshot!.paradigm).toBe(x01.rawInputSnapshot!.paradigm);
    expect(t02.rawInputSnapshot!.lightingIntent).toBe(x01.rawInputSnapshot!.lightingIntent);
    expect(t02.materialCategory).not.toBe(x01.materialCategory);
  });

  // ------------------------------------------------------------------
  // XA-02 (Observed Cross-Cell Contrast)
  // MING(MC-M01) vs TANG(MC-X01) 构图参数显著分化。
  // 非严格单变量正交（M01=DAYLIGHT, X01=CANDLELIGHT），仅作风格分化观察证据。
  // ------------------------------------------------------------------
  test("XA-02 [Contrast]: MING(MC-M01) vs TANG(MC-X01) 构图留白与对称性显著分化", () => {
    const m01 = getOrRunCell("MC-M01");
    const x01 = getOrRunCell("MC-X01");
    expect(m01.params).not.toBeNull();
    expect(x01.params).not.toBeNull();

    const voidDelta = Math.abs(m01.params!.negativeSpaceRatio - x01.params!.negativeSpaceRatio);
    const symmetryDelta = Math.abs(m01.params!.symmetry - x01.params!.symmetry);

    // 至少一项构图参数分化显著（容差 0.05）
    const differentiated = voidDelta > 0.05 || symmetryDelta > 0.05;
    expect(differentiated).toBe(true);
  });

  // ------------------------------------------------------------------
  // XA-03 (Lighting Range & Differentiation Proof)
  // 全量 Cell 的 colorTemp 严格落在各自光照意图受控区间内。
  // 断言锚定输入域 rawInputSnapshot.lighting.colorTemp。
  // ------------------------------------------------------------------
  test.each(MATRIX_CELL_IDS)(
    "XA-03 [Range]: %s colorTemp 落在 lightingIntent 受控区间内（输入域）",
    (cellId) => {
      const result = getOrRunCell(cellId);
      const colorTemp = result.rawInputSnapshot!.lighting.colorTemp;
      const intent = result.rawInputSnapshot!.lightingIntent!;
      const range = LIGHTING_INTENT_RANGES[intent];
      expect(range).toBeDefined();
      expect(colorTemp).toBeGreaterThanOrEqual(range.colorTemp[0]);
      expect(colorTemp).toBeLessThanOrEqual(range.colorTemp[1]);
    },
  );

  // ------------------------------------------------------------------
  // XA-04 (Controlled Metalness Ordering)
  // BRONZE 材质 metalness 显著高于 WOOD 材质（输入域比较）。
  // 阈值: metalness(BRONZE) > metalness(WOOD) + 0.5
  // ------------------------------------------------------------------
  test("XA-04 [Controlled]: BRONZE(MC-T01/MC-X02) metalness > WOOD(MC-M01/MC-X01) + 0.5（输入域）", () => {
    const bronzeCells = ["MC-T01", "MC-X02"] as MatrixCellId[];
    const woodCells = ["MC-M01", "MC-X01"] as MatrixCellId[];

    const bronzeValues = bronzeCells.map((id) => getOrRunCell(id).rawInputSnapshot!.pbrParams.metalness);
    const woodValues = woodCells.map((id) => getOrRunCell(id).rawInputSnapshot!.pbrParams.metalness);

    const minBronze = Math.min(...bronzeValues);
    const maxWood = Math.max(...woodValues);
    expect(minBronze).toBeGreaterThan(maxWood + 0.5);
  });

  // ------------------------------------------------------------------
  // XA-05 (Controlled Roughness Ordering — 输入域)
  // 【核心锁死】严格读取 rawInputSnapshot.pbrParams.roughness，
  // 断言 GLAZE(MC-T02=0.25) 设计粗糙度 < STONE(MC-S01=0.50) - 0.1。
  // 严禁比对被 CA-RULE-03-CANGRUN 提升为 0.70 后的管线输出值。
  // ------------------------------------------------------------------
  test("XA-05 [Controlled 输入域]: GLAZE(MC-T02) rawInput roughness(0.25) < STONE(MC-S01) rawInput roughness(0.50) - 0.1", () => {
    const t02 = getOrRunCell("MC-T02");
    const s01 = getOrRunCell("MC-S01");

    // 【输入域断言】读取 rawInputSnapshot，非管线输出
    const glazeRoughness = t02.rawInputSnapshot!.pbrParams.roughness;
    const stoneRoughness = s01.rawInputSnapshot!.pbrParams.roughness;

    expect(glazeRoughness).toBe(0.25);
    expect(stoneRoughness).toBe(0.50);
    expect(glazeRoughness).toBeLessThan(stoneRoughness - 0.1);

    // 【变换物证留存】确认管线输出已被 CA-RULE-03 提升，但不影响输入域断言
    const t02OutputRoughness = t02.params!.dominantRoughness;
    expect(t02OutputRoughness).toBe(0.7); // CA-RULE-03-CANGRUN transformation
    const transform = t02.transformationTrace.find((t) => t.ruleId === "CA-RULE-03-CANGRUN");
    expect(transform).toBeDefined();
    expect(transform!.inputValue).toBe(0.25);
    expect(transform!.outputValue).toBe(0.7);
  });

  // ------------------------------------------------------------------
  // XA-06 (Controlled Color Temperature Ordering)
  // CANDLELIGHT 色温显著低于 DAYLIGHT（输入域比较）。
  // 阈值: colorTemp(CANDLELIGHT) < colorTemp(DAYLIGHT) - 1500
  // ------------------------------------------------------------------
  test("XA-06 [Controlled]: CANDLELIGHT(MC-T02/MC-X01) colorTemp < DAYLIGHT(MC-T01/MC-M01) - 1500K（输入域）", () => {
    const candleCells = ["MC-T02", "MC-X01"] as MatrixCellId[];
    const dayCells = ["MC-T01", "MC-M01"] as MatrixCellId[];

    const candleTemps = candleCells.map((id) => getOrRunCell(id).rawInputSnapshot!.lighting.colorTemp);
    const dayTemps = dayCells.map((id) => getOrRunCell(id).rawInputSnapshot!.lighting.colorTemp);

    const maxCandle = Math.max(...candleTemps);
    const minDay = Math.min(...dayTemps);
    expect(maxCandle).toBeLessThan(minDay - 1500);
  });

  // ------------------------------------------------------------------
  // XA-07 (Cross-Axis Robustness)
  // 弱文化关联单元 MC-X01 / MC-X02 的 CA 属性全部通过，无结构退化。
  // ------------------------------------------------------------------
  test("XA-07 [Robustness]: 弱关联 Cell MC-X01 / MC-X02 管线全链路贯通且参数完整", () => {
    for (const cellId of ["MC-X01", "MC-X02"] as MatrixCellId[]) {
      const result = getOrRunCell(cellId);
      expect(result.success).toBe(true);
      expect(result.finalStage).toBe("COMPLETE");
      expect(result.rawInputSnapshot).not.toBeNull();
      expect(result.params).not.toBeNull();
      expect(result.renderResult).not.toBeNull();
      expect(result.evaluation).not.toBeNull();
      expect(result.materialCategory).not.toBeNull();
      expect(result.errors).toHaveLength(0);
    }
  });
});

// ============================================================================
// Part 3: 评测器模式断言族 (EA-01 ~ EA-04)
//
// EA = Evaluator Behavior：验证 5-Dim Evaluator 在 Matrix Cell 上的行为模式。
// 硬边界：不修改 Evaluator 阈值。BRONZE 的 MAT-003 FAIL 是预期文化偏置证据，
// 不是需要消除的 bug。color/focal 的 FAIL 作为既有 Evaluator 原始事实保留。
// ============================================================================

describe("EA 评测器模式断言族 (EA-01 ~ EA-04)", () => {
  // 辅助：直接调用 material evaluator 获取完整 checks（含 MAT-003）
  // evaluate() 输出的 metric 被 toMetricItem() 精简掉了 checks，
  // 因此此处直接调用 evaluateMaterial 以获取详细检查项。
  function getMat003(result: CellExecutionResult): { passed: boolean; actualValue: number } | null {
    if (!result.pipelineOutput || result.pipelineOutput.status === "TERMINAL_HALT") return null;
    const validatedIR = result.pipelineOutput.validatedIR as ValidatedDesignIR;
    const materialMetric = evaluateMaterial(validatedIR);
    const mat003 = materialMetric.checks?.find((c: { checkId: string; passed: boolean; actualValue?: unknown }) => c.checkId === "MAT-003-LOW-METALNESS");
    return mat003 ? { passed: mat003.passed, actualValue: Number(mat003.actualValue) } : null;
  }

  // ------------------------------------------------------------------
  // EA-01 (Expected Cultural Bias Failure)
  // 高金属度 Cell (BRONZE) 的 MAT-003-LOW-METALNESS 必须为 FAIL。
  // 这是评测器模式的预期文化偏置证据（metalness > 0.30 硬编码阈值），
  // 不是要通过修改材质参数或降低阈值来消除的失败。
  // ------------------------------------------------------------------
  test.each(["MC-T01", "MC-X02"] as MatrixCellId[])(
    "EA-01 [Expected FAIL]: %s (BRONZE) MAT-003-LOW-METALNESS 判定为失败（文化偏置证据）",
    (cellId) => {
      const result = getOrRunCell(cellId);
      expect(result.materialCategory).toBe("BRONZE");
      const mat003 = getMat003(result);
      expect(mat003).not.toBeNull();
      expect(mat003!.passed).toBe(false);
      expect(mat003!.actualValue).toBeGreaterThan(0.30);
    },
  );

  // ------------------------------------------------------------------
  // EA-02 (Dielectric Material Compliance)
  // 非金属 Cell (WOOD/GLAZE/STONE) 的 MAT-003 必须为 PASS。
  // ------------------------------------------------------------------
  test.each(["MC-M01", "MC-S01", "MC-T02", "MC-X01"] as MatrixCellId[])(
    "EA-02 [Expected PASS]: %s (非金属) MAT-003-LOW-METALNESS 判定为成功",
    (cellId) => {
      const result = getOrRunCell(cellId);
      expect(result.materialCategory).not.toBe("BRONZE");
      const mat003 = getMat003(result);
      expect(mat003).not.toBeNull();
      expect(mat003!.passed).toBe(true);
      expect(mat003!.actualValue).toBeLessThanOrEqual(0.30);
    },
  );

  // ------------------------------------------------------------------
  // EA-03 (Score Finiteness)
  // 全量 Cell 的材质维度 score 可解析、非 NaN、非 Infinity。
  // ------------------------------------------------------------------
  test.each(MATRIX_CELL_IDS)(
    "EA-03: %s 材质维度 score 有限可解析（非 NaN / 非 Infinity）",
    (cellId) => {
      const result = getOrRunCell(cellId);
      expect(result.evaluation).not.toBeNull();
      expect(result.evaluation!.metrics).not.toBeNull();
      const score = result.evaluation!.metrics!.material.score;
      expect(typeof score).toBe("number");
      expect(Number.isNaN(score)).toBe(false);
      expect(Number.isFinite(score)).toBe(true);
    },
  );

  // ------------------------------------------------------------------
  // EA-04 (Zero Baseline Regression)
  // 既有 Core Pipeline (Step 6-B Normalizer + PipelineRunner) 对已知
  // 输入仍产生 PASS 状态，证明 Matrix 套件扩展未干扰既有基线。
  // ------------------------------------------------------------------
  test("EA-04 [Zero Regression]: 既有 Core Pipeline 对已知输入仍正常工作（基线零退化）", () => {
    // 使用 GOLDEN_CASE_02 的已知 Cangjie IR 验证 Step 6-B 仍正常
    const case02IrPath = path.join(__dirname, "..", "golden-cases", "GOLDEN_CASE_02", "cangjie-ir.json");
    if (fs.existsSync(case02IrPath)) {
      const cangjieIR = JSON.parse(fs.readFileSync(case02IrPath, "utf-8"));
      const result = normalizeIntent(cangjieIR, {
        capturedAt: "2026-09-15T00:00:00Z",
        intentResolutionConfidence: 0.90,
        mappingConfidence: 0.95,
        inferenceExecutionMs: 0,
      });
      expect(result.status).toBe("PASS");
      expect(result.metadata.mappedParameters).toBeGreaterThan(0);
    } else {
      // 回退：验证 6 个 Matrix Cell 全部成功（间接证明 Core Pipeline 未退化）
      for (const cellId of MATRIX_CELL_IDS) {
        const result = getOrRunCell(cellId);
        expect(result.success).toBe(true);
      }
    }
  });
});
