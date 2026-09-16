/**
 * Phase 4-C: Standard Asset Compiler
 *
 * 标准资产编译器——替代 MockAssetCompiler。
 *
 * 核心能力：
 * - COPY_SOURCE: 从 sourceAssetsDir 读取真实物理文件，验证 WebP magic，缺失时抛出 MISSING_SOURCE_EVIDENCE
 * - COMPUTE_DERIVED: 基于 sharp 的确定性像素计算（深度图、水面掩码、水面法线、scene.json）
 *
 * 确定性保证：
 * - 所有算法参数硬编码，无随机数
 * - 输入相同 → 输出字节完全相同
 * - 不使用 Date.now() / Math.random() / new Date()
 *
 * 禁止行为：
 * - 严禁在源文件缺失时用内存占位假冒 SOURCE/PHYSICAL
 * - 严禁将 GENERATED 标记为 SOURCE
 * - 严禁静默回退
 */

import * as fs from "node:fs";
import * as path from "node:path";
import sharp from "sharp";
import type {
  AssetPlanEntry,
  AssetCompilationResult,
} from "./types";
import type { IAssetCompiler, AssetCompilationContext } from "./asset-compiler";
import { sha256Bytes, sha256Object } from "./asset-ledger";

// ---------------------------------------------------------------------------
// 错误类型
// ---------------------------------------------------------------------------

/** 缺失源资产证据错误——致命错误，禁止静默回退 */
export class MissingSourceEvidenceError extends Error {
  readonly code = "MISSING_SOURCE_EVIDENCE";
  readonly assetId: string;
  readonly expectedPath: string;

  constructor(assetId: string, expectedPath: string) {
    super(
      `MISSING_SOURCE_EVIDENCE: Asset "${assetId}" requires physical source file at "${expectedPath}". ` +
      `Source bitstream must exist before compilation — no in-memory placeholder is permitted for SOURCE/PHYSICAL assets.`,
    );
    this.name = "MissingSourceEvidenceError";
    this.assetId = assetId;
    this.expectedPath = expectedPath;
  }
}

/** 无效 WebP 格式错误 */
export class InvalidWebPFormatError extends Error {
  readonly code = "INVALID_WEBP_FORMAT";
  readonly assetId: string;

  constructor(assetId: string, reason: string) {
    super(`INVALID_WEBP_FORMAT: Asset "${assetId}" — ${reason}`);
    this.name = "InvalidWebPFormatError";
    this.assetId = assetId;
  }
}

// ---------------------------------------------------------------------------
// WebP Magic 验证
// ---------------------------------------------------------------------------

/**
 * 验证字节是否为有效 WebP 文件头。
 * WebP 格式: RIFF (4 bytes) + size (4 bytes) + WEBP (4 bytes)
 */
function isValidWebPHeader(data: Uint8Array): boolean {
  if (data.length < 12) return false;
  // "RIFF"
  if (data[0] !== 0x52 || data[1] !== 0x49 || data[2] !== 0x46 || data[3] !== 0x46) return false;
  // "WEBP" at offset 8
  if (data[8] !== 0x57 || data[9] !== 0x45 || data[10] !== 0x42 || data[11] !== 0x50) return false;
  return true;
}

// ---------------------------------------------------------------------------
// 派生算法参数（确定性常量）
// ---------------------------------------------------------------------------

const DERIVATION_PARAMS = {
  depth: {
    algorithm: "luminance-invert-gaussian-depth",
    gaussianBlurSigma: 2.5,
    contrastStretch: true,
    outputFormat: "webp",
    outputQuality: 90,
  },
  waterMask: {
    algorithm: "blue-channel-threshold-mask",
    blueRatioThreshold: 0.42,
    saturationThreshold: 0.15,
    morphologicalOpenRadius: 1,
    outputFormat: "webp",
    outputQuality: 80,
  },
  waterNormal: {
    algorithm: "heightfield-tangent-normal",
    strength: 2.0,
    smoothingRadius: 1,
    outputFormat: "webp",
    outputQuality: 90,
  },
} as const;

// ---------------------------------------------------------------------------
// StandardAssetCompiler
// ---------------------------------------------------------------------------

export interface StandardAssetCompilerOptions {
  /** 编译器标识（默认 standard-asset-compiler@1.0.0） */
  compilerId?: string;
}

/**
 * 标准资产编译器。
 *
 * 实现 IAssetCompiler 接口，提供真实物理资产编译和确定性派生计算。
 */
export class StandardAssetCompiler implements IAssetCompiler {
  readonly compilerId: string;
  readonly supportedCategories = ["*"];
  readonly supportedStrategies: AssetPlanEntry["compilationStrategy"][] = [
    "COPY_SOURCE",
    "COMPUTE_DERIVED",
  ];

  constructor(options: StandardAssetCompilerOptions = {}) {
    this.compilerId = options.compilerId ?? "standard-asset-compiler@1.0.0";
  }

  /**
   * 编译资产。
   */
  async compile(
    entry: AssetPlanEntry,
    context: AssetCompilationContext,
  ): Promise<{ bytes: Uint8Array; metadata?: Record<string, unknown> }> {
    switch (entry.compilationStrategy) {
      case "COPY_SOURCE":
        return this.compileCopySource(entry, context);
      case "COMPUTE_DERIVED":
        return this.compileDerived(entry, context);
      default:
        throw new Error(
          `StandardAssetCompiler does not support strategy "${entry.compilationStrategy}" for asset "${entry.assetId}"`,
        );
    }
  }

  // -------------------------------------------------------------------------
  // COPY_SOURCE: 真实物理文件复制
  // -------------------------------------------------------------------------

  private async compileCopySource(
    entry: AssetPlanEntry,
    context: AssetCompilationContext,
  ): Promise<{ bytes: Uint8Array; metadata?: Record<string, unknown> }> {
    if (!context.sourceAssetsDir) {
      throw new MissingSourceEvidenceError(entry.assetId, "<sourceAssetsDir not configured>");
    }

    const filePath = path.join(context.sourceAssetsDir, entry.fileName);

    // 1. 检查文件存在性
    if (!fs.existsSync(filePath)) {
      throw new MissingSourceEvidenceError(entry.assetId, filePath);
    }

    // 2. 读取文件字节
    const bytes = fs.readFileSync(filePath);

    // 3. 验证文件大小
    if (bytes.length === 0) {
      throw new InvalidWebPFormatError(entry.assetId, "file is empty (0 bytes)");
    }

    // 4. 验证 WebP magic number（图片类资产）
    if (entry.mimeType.startsWith("image/")) {
      if (!isValidWebPHeader(bytes)) {
        throw new InvalidWebPFormatError(
          entry.assetId,
          `invalid WebP header — expected RIFF....WEBP, got ${bytes.slice(0, 4).toString("latin1")}....${bytes.slice(8, 12).toString("latin1")}`,
        );
      }
    }

    // 5. 用 sharp 验证图片可解码并获取元数据
    let dimensions: { width: number; height: number } | undefined;
    if (entry.mimeType.startsWith("image/")) {
      try {
        const metadata = await sharp(bytes).metadata();
        dimensions = { width: metadata.width ?? 0, height: metadata.height ?? 0 };
      } catch {
        throw new InvalidWebPFormatError(entry.assetId, "sharp failed to decode WebP bitstream");
      }
    }

    return {
      bytes: new Uint8Array(bytes),
      metadata: {
        compiler: this.compilerId,
        strategy: "COPY_SOURCE",
        sourcePath: filePath,
        sourceSha256: sha256Bytes(bytes),
        dimensions,
        verified: true,
      },
    };
  }

  // -------------------------------------------------------------------------
  // COMPUTE_DERIVED: 确定性派生计算
  // -------------------------------------------------------------------------

  private async compileDerived(
    entry: AssetPlanEntry,
    context: AssetCompilationContext,
  ): Promise<{ bytes: Uint8Array; metadata?: Record<string, unknown> }> {
    switch (entry.assetId) {
      case "asset:depth":
        return this.compileDepthMap(entry, context);
      case "asset:water-mask":
        return this.compileWaterMask(entry, context);
      case "asset:water-normal":
        return this.compileWaterNormal(entry, context);
      case "asset:scene-manifest":
        return this.compileSceneManifest(entry, context);
      default:
        throw new Error(
          `StandardAssetCompiler: unknown derived asset "${entry.assetId}" — no derivation algorithm registered`,
        );
    }
  }

  /**
   * 深度图派生：亮度反转 + 高斯模糊。
   *
   * 算法：
   * 1. 读取 scene.webp 源图像
   * 2. 转换为灰度（亮度 = 0.299R + 0.587G + 0.114B）
   * 3. 反转（亮像素→近，暗像素→远）
   * 4. 高斯模糊模拟景深平滑
   * 5. 对比度拉伸增强深度感知
   * 6. 输出 8-bit 灰度 WebP
   */
  private async compileDepthMap(
    entry: AssetPlanEntry,
    context: AssetCompilationContext,
  ): Promise<{ bytes: Uint8Array; metadata?: Record<string, unknown> }> {
    const sourceBytes = await this.readSourceImage("scene.webp", entry.assetId, context);

    const params = DERIVATION_PARAMS.depth;
    const pipeline = sharp(sourceBytes)
      .grayscale()
      .linear(-1, 255) // 反转：output = -1 * input + 255
      .blur(params.gaussianBlurSigma)
      .normalise() // 对比度拉伸
      .webp({ quality: params.outputQuality });

    const bytes = await pipeline.toBuffer();

    return {
      bytes: new Uint8Array(bytes),
      metadata: {
        compiler: this.compilerId,
        strategy: "COMPUTE_DERIVED",
        derivationAlgorithm: params.algorithm,
        derivationParams: { ...params },
        inputAsset: "scene.webp",
        inputSha256: sha256Bytes(sourceBytes),
      },
    };
  }

  /**
   * 水面掩码派生：蓝色通道阈值 + 形态学开运算。
   *
   * 算法：
   * 1. 读取 scene.webp
   * 2. 提取每个像素的蓝色通道占比 B/(R+G+B)
   * 3. 蓝色占比 > 阈值 且 饱和度 > 阈值 → 水面（白色）
   * 4. 形态学开运算去噪
   * 5. 输出 8-bit 单通道灰度 WebP
   */
  private async compileWaterMask(
    entry: AssetPlanEntry,
    context: AssetCompilationContext,
  ): Promise<{ bytes: Uint8Array; metadata?: Record<string, unknown> }> {
    const sourceBytes = await this.readSourceImage("scene.webp", entry.assetId, context);
    const params = DERIVATION_PARAMS.waterMask;

    // 获取原始像素数据
    const { data, info } = await sharp(sourceBytes)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const width = info.width;
    const height = info.height;
    const channels = info.channels;

    // 计算蓝色掩码（优化：消除 Math.max/Math.min 调用）
    const mask = Buffer.alloc(width * height);
    const blueThresh = params.blueRatioThreshold;
    const satThresh = params.saturationThreshold;
    for (let i = 0; i < width * height; i++) {
      const p = i * channels;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      const sum = r + g + b;
      const blueRatio = sum > 0 ? b / sum : 0;
      let max = r;
      if (g > max) max = g;
      if (b > max) max = b;
      let min = r;
      if (g < min) min = g;
      if (b < min) min = b;
      const saturation = max > 0 ? (max - min) / max : 0;

      mask[i] = (blueRatio > blueThresh && saturation > satThresh) ? 255 : 0;
    }

    // 形态学开运算（先腐蚀后膨胀），半径 1
    const opened = this.morphologicalOpen(mask, width, height, params.morphologicalOpenRadius);

    // 编码为 WebP
    const bytes = await sharp(opened, { raw: { width, height, channels: 1 } })
      .webp({ quality: params.outputQuality })
      .toBuffer();

    return {
      bytes: new Uint8Array(bytes),
      metadata: {
        compiler: this.compilerId,
        strategy: "COMPUTE_DERIVED",
        derivationAlgorithm: params.algorithm,
        derivationParams: { ...params },
        inputAsset: "scene.webp",
        inputSha256: sha256Bytes(sourceBytes),
        maskCoverage: this.calculateMaskCoverage(opened),
      },
    };
  }

  /**
   * 水面法线派生：从高度场计算切线空间法线。
   *
   * 算法：
   * 1. 读取 water-mask 作为高度场
   * 2. 计算 Sobel 梯度（dx, dy）
   * 3. 法线 = normalize(-dx * strength, -dy * strength, 1)
   * 4. 映射到 [0,255] RGB 范围
   * 5. 输出 WebP
   */
  private async compileWaterNormal(
    entry: AssetPlanEntry,
    context: AssetCompilationContext,
  ): Promise<{ bytes: Uint8Array; metadata?: Record<string, unknown> }> {
    const sourceBytes = await this.readSourceImage("scene.webp", entry.assetId, context);
    const params = DERIVATION_PARAMS.waterNormal;

    // 先计算水面掩码作为高度场
    const { data: maskData, info } = await sharp(sourceBytes)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const width = info.width;
    const height = info.height;
    const channels = info.channels;

    // 生成高度场（蓝色占比）
    const heightField = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const r = maskData[i * channels];
      const g = maskData[i * channels + 1];
      const b = maskData[i * channels + 2];
      const sum = r + g + b;
      heightField[i] = sum > 0 ? b / sum : 0;
    }

    // Sobel 梯度计算法线（优化版：分离边界消除每像素 clamp）
    const normal = Buffer.alloc(width * height * 3);
    const strength = params.strength;

    // 内部像素（无边界 clamp，占 99.9%+）
    for (let y = 1; y < height - 1; y++) {
      const rowOffset = y * width;
      const prevRow = rowOffset - width;
      const nextRow = rowOffset + width;
      for (let x = 1; x < width - 1; x++) {
        const idx = rowOffset + x;
        const tl = heightField[prevRow + x - 1];
        const tr = heightField[prevRow + x + 1];
        const bl = heightField[nextRow + x - 1];
        const br = heightField[nextRow + x + 1];
        const ml = heightField[rowOffset + x - 1];
        const mr = heightField[rowOffset + x + 1];
        const tm = heightField[prevRow + x];
        const bm = heightField[nextRow + x];

        const dx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
        const dy = (bl + 2 * bm + br) - (tl + 2 * tm + tr);

        const nx = -dx * strength;
        const ny = -dy * strength;
        const invLen = 1 / Math.sqrt(nx * nx + ny * ny + 1);

        const o = idx * 3;
        normal[o] = ((nx * invLen) + 1) * 127.5 + 0.5 | 0;
        normal[o + 1] = ((ny * invLen) + 1) * 127.5 + 0.5 | 0;
        normal[o + 2] = (invLen + 1) * 127.5 + 0.5 | 0;
      }
    }

    // 边界像素（使用 clamp，仅占 ~0.1% 像素）
    const writeBorderNormal = (x: number, y: number) => {
      const idx = y * width + x;
      const xm = x > 0 ? x - 1 : 0;
      const xp = x < width - 1 ? x + 1 : width - 1;
      const ym = y > 0 ? y - 1 : 0;
      const yp = y < height - 1 ? y + 1 : height - 1;

      const tl = heightField[ym * width + xm];
      const tr = heightField[ym * width + xp];
      const bl = heightField[yp * width + xm];
      const br = heightField[yp * width + xp];
      const ml = heightField[y * width + xm];
      const mr = heightField[y * width + xp];
      const tm = heightField[ym * width + x];
      const bm = heightField[yp * width + x];

      const dx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
      const dy = (bl + 2 * bm + br) - (tl + 2 * tm + tr);
      const nx = -dx * strength;
      const ny = -dy * strength;
      const invLen = 1 / Math.sqrt(nx * nx + ny * ny + 1);

      const o = idx * 3;
      normal[o] = ((nx * invLen) + 1) * 127.5 + 0.5 | 0;
      normal[o + 1] = ((ny * invLen) + 1) * 127.5 + 0.5 | 0;
      normal[o + 2] = (invLen + 1) * 127.5 + 0.5 | 0;
    };

    // 顶行和底行
    for (let x = 0; x < width; x++) {
      writeBorderNormal(x, 0);
      writeBorderNormal(x, height - 1);
    }
    // 左列和右列（不含已处理的角）
    for (let y = 1; y < height - 1; y++) {
      writeBorderNormal(0, y);
      writeBorderNormal(width - 1, y);
    }

    const bytes = await sharp(normal, { raw: { width, height, channels: 3 } })
      .webp({ quality: params.outputQuality })
      .toBuffer();

    return {
      bytes: new Uint8Array(bytes),
      metadata: {
        compiler: this.compilerId,
        strategy: "COMPUTE_DERIVED",
        derivationAlgorithm: params.algorithm,
        derivationParams: { ...params },
        inputAsset: "scene.webp",
        inputSha256: sha256Bytes(sourceBytes),
      },
    };
  }

  /**
   * scene.json 主清单派生：生成 Runtime 驱动核心主档。
   */
  private async compileSceneManifest(
    entry: AssetPlanEntry,
    context: AssetCompilationContext,
  ): Promise<{ bytes: Uint8Array; metadata?: Record<string, unknown> }> {
    const manifest = {
      manifestVersion: "1.0.0",
      sceneId: context.sceneId,
      generatedBy: this.compilerId,
      compiledAt: context.compiledAt,
      targetDimensions: {
        width: context.targetWidth,
        height: context.targetHeight,
      },
      assetReferences: [
        { fileName: "scene.webp", role: "PRIMARY_VISUAL", truthClass: "SOURCE" },
        { fileName: "depth.webp", role: "SPATIAL_GEOMETRY", truthClass: "DERIVED" },
        { fileName: "water-mask.webp", role: "MATERIAL_MASK", truthClass: "DERIVED" },
        { fileName: "water-normal.webp", role: "PHYSICAL_NORMAL", truthClass: "DERIVED" },
        { fileName: "gate-colossus.webp", role: "OCCLUSION_SPRITE", truthClass: "SOURCE" },
        { fileName: "gate-left.webp", role: "OCCLUSION_SPRITE", truthClass: "SOURCE" },
        { fileName: "gate-right.webp", role: "OCCLUSION_SPRITE", truthClass: "SOURCE" },
        { fileName: "interior-realm.webp", role: "ATMOSPHERIC_SPRITE", truthClass: "SOURCE" },
      ],
      evidence: {
        machineProvenance: "evidence/machine-provenance.json",
        humanAuditLedger: "evidence/human-audit-ledger.json",
      },
    };

    const json = JSON.stringify(manifest, null, 2);
    const bytes = new TextEncoder().encode(json);

    return {
      bytes,
      metadata: {
        compiler: this.compilerId,
        strategy: "COMPUTE_DERIVED",
        derivationAlgorithm: "scene-manifest-json",
        manifestSha256: sha256Bytes(bytes),
      },
    };
  }

  // -------------------------------------------------------------------------
  // 内部工具
  // -------------------------------------------------------------------------

  /**
   * 读取源图像字节。用于派生资产的输入。
   */
  private async readSourceImage(
    fileName: string,
    forAssetId: string,
    context: AssetCompilationContext,
  ): Promise<Buffer> {
    if (!context.sourceAssetsDir) {
      throw new MissingSourceEvidenceError(forAssetId, `<sourceAssetsDir not configured, needed for ${fileName}>`);
    }
    const filePath = path.join(context.sourceAssetsDir, fileName);
    if (!fs.existsSync(filePath)) {
      throw new MissingSourceEvidenceError(forAssetId, filePath);
    }
    const bytes = fs.readFileSync(filePath);
    if (!isValidWebPHeader(bytes)) {
      throw new InvalidWebPFormatError(forAssetId, `source image ${fileName} has invalid WebP header`);
    }
    return bytes;
  }

  /**
   * 形态学开运算（先腐蚀后膨胀），可分离实现：水平+垂直通道。
   * 对于 3x3 结构元，分离后每像素 6 次比较（原 9 次），且缓存局部性更优。
   */
  private morphologicalOpen(
    mask: Buffer,
    width: number,
    height: number,
    radius: number,
  ): Buffer {
    // 腐蚀（min）：水平 pass → 垂直 pass
    const hEroded = Buffer.alloc(width * height);
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        let min = 255;
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const clamped = nx < 0 ? 0 : nx >= width ? width - 1 : nx;
          const v = mask[row + clamped];
          if (v < min) min = v;
        }
        hEroded[row + x] = min;
      }
    }
    const eroded = Buffer.alloc(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let min = 255;
        for (let dy = -radius; dy <= radius; dy++) {
          const ny = y + dy;
          const clamped = ny < 0 ? 0 : ny >= height ? height - 1 : ny;
          const v = hEroded[clamped * width + x];
          if (v < min) min = v;
        }
        eroded[y * width + x] = min;
      }
    }

    // 膨胀（max）：水平 pass → 垂直 pass
    const hDilated = Buffer.alloc(width * height);
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        let max = 0;
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const clamped = nx < 0 ? 0 : nx >= width ? width - 1 : nx;
          const v = eroded[row + clamped];
          if (v > max) max = v;
        }
        hDilated[row + x] = max;
      }
    }
    const dilated = Buffer.alloc(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let max = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          const ny = y + dy;
          const clamped = ny < 0 ? 0 : ny >= height ? height - 1 : ny;
          const v = hDilated[clamped * width + x];
          if (v > max) max = v;
        }
        dilated[y * width + x] = max;
      }
    }
    return dilated;
  }

  /**
   * 计算掩码覆盖率（白色像素占比）。
   */
  private calculateMaskCoverage(mask: Buffer): number {
    let white = 0;
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] > 128) white++;
    }
    return white / mask.length;
  }
}

// ---------------------------------------------------------------------------
// 导出派生算法参数（供测试和证据链使用）
// ---------------------------------------------------------------------------

export { DERIVATION_PARAMS };
