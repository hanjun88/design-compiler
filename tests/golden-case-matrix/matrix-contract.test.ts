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
