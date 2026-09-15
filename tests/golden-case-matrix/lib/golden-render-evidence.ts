/**
 * Golden Case Matrix — Golden Render Evidence Generator
 *
 * 将实机运行产生的渲染输出正式升格为 Golden Evidence。
 * 严格纪律：所有数值来自实机运行，严禁手工篡改。
 *
 * Golden RenderHash ≠ semantic correctness。
 * 它只证明确定性的物理渲染输出，不证明设计意图的审美正确性。
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { runCell, MATRIX_CELL_IDS, type MatrixCellId, type CellExecutionResult } from "./cell-runner";

// ============================================================================
// Golden Render Evidence 类型
// ============================================================================

export interface GoldenRenderEvidence {
  /** Matrix Cell ID，如 "MC-T01" */
  cellId: string;
  /** 渲染哈希（sha256 hex，含 sha256: 前缀） */
  renderHash: string;
  /** 像素缓冲字节数（480×270×4 = 518400） */
  pixelByteLength: number;
  /** 非零像素数（RGB 任一通道 > 0） */
  nonZeroPixels: number;
  /** 平均亮度（Rec. 601 luma: 0.299R + 0.587G + 0.114B） */
  meanLuminance: number;
  /** 是否存在 NaN（Software Renderer 输出 Uint8Array，恒为 false） */
  hasNaN: boolean;
  /** 是否存在 Inf（Software Renderer 输出 Uint8Array，恒为 false） */
  hasInf: boolean;
  /** 渲染器标识 */
  renderer: "software-reference";
  /** 分辨率 */
  resolution: "480x270";
  /** 确定性时间戳 */
  capturedAt: string;
  /** 范式标签 */
  paradigm: string | null;
  /** 材质类别 */
  materialCategory: string | null;
  /** 光照意图 */
  lightingIntent: string | null;
}

export interface GoldenRenderManifest {
  /** Manifest 版本 */
  manifestVersion: "1.0.0";
  /** 生成时间（确定性） */
  generatedAt: string;
  /** 渲染器信息 */
  renderer: {
    type: "software-reference";
    version: string;
    resolution: "480x270";
    pixelFormat: "RGBA8888";
  };
  /** 6 个 Cell 的 Golden Evidence */
  cells: Record<MatrixCellId, GoldenRenderEvidence>;
}

// ============================================================================
// 像素统计
// ============================================================================

export interface PixelStatistics {
  nonZeroPixels: number;
  meanLuminance: number;
  hasNaN: boolean;
  hasInf: boolean;
}

/**
 * 从 RGBA8888 像素缓冲计算统计信息。
 * - nonZeroPixels: RGB 任一通道 > 0 的像素数
 * - meanLuminance: Rec. 601 luma 平均值 (0.299R + 0.587G + 0.114B)
 * - hasNaN/hasInf: Uint8Array 恒为 false（8 位无符号整数不可能为 NaN/Inf）
 */
export function computePixelStatistics(pixelBuffer: Uint8Array): PixelStatistics {
  let nonZeroPixels = 0;
  let luminanceSum = 0;
  let hasNaN = false;
  let hasInf = false;

  const pixelCount = pixelBuffer.length / 4;

  for (let i = 0; i < pixelBuffer.length; i += 4) {
    const r = pixelBuffer[i];
    const g = pixelBuffer[i + 1];
    const b = pixelBuffer[i + 2];

    // Uint8Array 值恒为 0-255 整数，NaN/Inf 不可能出现
    // 但仍做形式化检查以确保证据链完整
    if (typeof r !== "number" || isNaN(r) || !isFinite(r)) hasNaN = true;
    if (typeof g !== "number" || isNaN(g) || !isFinite(g)) hasNaN = true;
    if (typeof b !== "number" || isNaN(b) || !isFinite(b)) hasNaN = true;
    // Inf 检查（Uint8Array 中不可能）
    if (r === Infinity || r === -Infinity) hasInf = true;
    if (g === Infinity || g === -Infinity) hasInf = true;
    if (b === Infinity || b === -Infinity) hasInf = true;

    if (r > 0 || g > 0 || b > 0) {
      nonZeroPixels++;
    }

    // Rec. 601 luma
    luminanceSum += 0.299 * r + 0.587 * g + 0.114 * b;
  }

  return {
    nonZeroPixels,
    meanLuminance: pixelCount > 0 ? luminanceSum / pixelCount : 0,
    hasNaN,
    hasInf,
  };
}

// ============================================================================
// Golden Evidence 生成
// ============================================================================

const GOLDEN_CAPTURED_AT = "2026-09-16T00:00:00Z";

/**
 * 从单个 Cell 执行结果生成 GoldenRenderEvidence。
 * 所有数值来自实机运行结果，不做任何手工修改。
 */
export function generateGoldenEvidence(result: CellExecutionResult): GoldenRenderEvidence {
  if (!result.renderResult) {
    throw new Error(`Cannot generate golden evidence for ${result.cellId}: renderResult is null`);
  }

  const stats = computePixelStatistics(result.renderResult.pixelBuffer);

  return {
    cellId: result.cellId,
    renderHash: result.renderResult.renderHash,
    pixelByteLength: result.renderResult.pixelBuffer.byteLength,
    nonZeroPixels: stats.nonZeroPixels,
    meanLuminance: Number(stats.meanLuminance.toFixed(4)),
    hasNaN: stats.hasNaN,
    hasInf: stats.hasInf,
    renderer: "software-reference",
    resolution: "480x270",
    capturedAt: GOLDEN_CAPTURED_AT,
    paradigm: result.rawInputSnapshot?.paradigm ?? null,
    materialCategory: result.materialCategory,
    lightingIntent: result.rawInputSnapshot?.lightingIntent ?? null,
  };
}

/**
 * 实机运行全部 6 个 Cell，生成 GoldenRenderManifest。
 * 此函数是唯一的 manifest 生成入口，确保所有数值来自实机运行。
 */
export function generateGoldenRenderManifest(): GoldenRenderManifest {
  const cells = {} as Record<MatrixCellId, GoldenRenderEvidence>;

  for (const cellId of MATRIX_CELL_IDS) {
    const result = runCell(cellId);
    cells[cellId] = generateGoldenEvidence(result);
  }

  return {
    manifestVersion: "1.0.0",
    generatedAt: GOLDEN_CAPTURED_AT,
    renderer: {
      type: "software-reference",
      version: "1.0.0",
      resolution: "480x270",
      pixelFormat: "RGBA8888",
    },
    cells,
  };
}

/**
 * 将 GoldenRenderManifest 写入 JSON 文件。
 * 写入前验证所有字段非空、hash 格式正确、像素字节数为 518400。
 */
export function writeGoldenRenderManifest(
  manifest: GoldenRenderManifest,
  outputPath: string,
): void {
  // 写入前完整性校验
  for (const cellId of MATRIX_CELL_IDS) {
    const evidence = manifest.cells[cellId];
    if (!evidence) throw new Error(`Missing evidence for ${cellId}`);
    if (!evidence.renderHash || !evidence.renderHash.startsWith("sha256:")) {
      throw new Error(`Invalid renderHash for ${cellId}: ${evidence.renderHash}`);
    }
    if (evidence.pixelByteLength !== 518400) {
      throw new Error(`Invalid pixelByteLength for ${cellId}: ${evidence.pixelByteLength} (expected 518400)`);
    }
    if (evidence.nonZeroPixels <= 0) {
      throw new Error(`Invalid nonZeroPixels for ${cellId}: ${evidence.nonZeroPixels}`);
    }
    if (evidence.hasNaN || evidence.hasInf) {
      throw new Error(`NaN/Inf detected in pixel buffer for ${cellId}`);
    }
  }

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
}

/**
 * 从 JSON 文件加载 GoldenRenderManifest。
 */
export function loadGoldenRenderManifest(manifestPath: string): GoldenRenderManifest {
  const raw = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  return raw as GoldenRenderManifest;
}
