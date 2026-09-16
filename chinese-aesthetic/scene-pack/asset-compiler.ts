/**
 * Asset Compiler (Framework)
 *
 * 资产生成器框架。
 *
 * 注意：本阶段只实现编译器框架和接口定义，不包含实际的图片生成逻辑。
 * 实际的资产生成（WebGL/Canvas/图像处理）留待后续阶段实现。
 *
 * 框架提供：
 * - 资产编译的接口定义
 * - 编译策略分发（COPY_SOURCE / COMPUTE_DERIVED / GENERATE_SYNTHETIC / BLOCKED）
 * - 模拟编译（用于测试，生成确定性的占位字节）
 * - 编译结果的标准化
 */

import type {
  AssetPlanEntry,
  AssetCompilationResult,
  CompiledAsset,
} from "./types";
import { sha256Bytes } from "./asset-ledger";
import { assertAssetBoundary } from "./asset-boundary";

// ---------------------------------------------------------------------------
// 资产编译器接口
// ---------------------------------------------------------------------------

/**
 * 资产编译器接口。
 *
 * 每个具体的资产编译器（如深度图编译器、法线图编译器）实现此接口。
 */
export interface IAssetCompiler {
  /** 编译器标识 */
  readonly compilerId: string;
  /** 支持的资产类别 */
  readonly supportedCategories: string[];
  /** 支持的编译策略 */
  readonly supportedStrategies: AssetPlanEntry["compilationStrategy"][];

  /**
   * 编译资产。
   *
   * @param entry 资产规划条目
   * @param context 编译上下文
   * @returns 编译后的资产字节
   */
  compile(
    entry: AssetPlanEntry,
    context: AssetCompilationContext,
  ): Promise<{ bytes: Uint8Array; metadata?: Record<string, unknown> }>;
}

/** 资产编译上下文 */
export interface AssetCompilationContext {
  /** 场景标识 */
  sceneId: string;
  /** 目标宽度 */
  targetWidth: number;
  /** 目标高度 */
  targetHeight: number;
  /** 源资产目录 */
  sourceAssetsDir?: string;
  /** 编译时间 */
  compiledAt: string;
  /** 额外上下文数据 */
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// 模拟编译器（用于测试）
// ---------------------------------------------------------------------------

/**
 * 模拟资产编译器。
 *
 * 生成确定性的占位字节，用于测试编译框架和账本。
 * 不生成真实的图片数据。
 */
export class MockAssetCompiler implements IAssetCompiler {
  readonly compilerId = "mock-asset-compiler";
  readonly supportedCategories = ["*"];
  readonly supportedStrategies: AssetPlanEntry["compilationStrategy"][] = ["COPY_SOURCE", "COMPUTE_DERIVED", "GENERATE_SYNTHETIC"];

  async compile(
    entry: AssetPlanEntry,
    context: AssetCompilationContext,
  ): Promise<{ bytes: Uint8Array; metadata?: Record<string, unknown> }> {
    // 生成确定性的占位字节
    // 使用 assetId + sceneId + 尺寸 作为种子，确保确定性
    const seed = `${entry.assetId}:${context.sceneId}:${context.targetWidth}x${context.targetHeight}`;
    const bytes = this.generateDeterministicBytes(seed, entry.mimeType);

    return {
      bytes,
      metadata: {
        mock: true,
        seed,
        generatedBy: this.compilerId,
      },
    };
  }

  /**
   * 生成确定性的占位字节。
   *
   * 对于 JSON 类型，生成最小的合法 JSON。
   * 对于图片类型，生成最小的占位字节（不是真实图片格式）。
   */
  private generateDeterministicBytes(seed: string, mimeType: string): Uint8Array {
    if (mimeType === "application/json") {
      // 确定性 JSON：不包含时间戳等非确定性字段
      const json = JSON.stringify({ mock: true, seed, generatedBy: "mock-asset-compiler" });
      return new TextEncoder().encode(json);
    }

    // 图片类型：生成基于种子的确定性字节
    // 注意：这不是真实的图片格式，只是用于测试的占位字节
    const encoder = new TextEncoder();
    const seedBytes = encoder.encode(seed);
    const header = new Uint8Array([0x89, 0x50, 0x4E, 0x47]); // PNG magic (mock)
    const result = new Uint8Array(header.length + seedBytes.length);
    result.set(header, 0);
    result.set(seedBytes, header.length);
    return result;
  }
}

// ---------------------------------------------------------------------------
// 资产编译协调器
// ---------------------------------------------------------------------------

export interface AssetCompilationCoordinatorOptions {
  /** 编译器列表（按优先级排序） */
  compilers?: IAssetCompiler[];
  /** 编译时间 */
  compiledAt?: string;
  /** 目标宽度 */
  targetWidth?: number;
  /** 目标高度 */
  targetHeight?: number;
}

/**
 * 资产编译协调器。
 *
 * 根据资产规划条目，分配合适的编译器进行编译。
 * 不支持的资产显式 BLOCKED。
 */
export class AssetCompilationCoordinator {
  private compilers: IAssetCompiler[];
  private compiledAt: string;
  private targetWidth: number;
  private targetHeight: number;

  constructor(options: AssetCompilationCoordinatorOptions = {}) {
    this.compilers = options.compilers ?? [new MockAssetCompiler()];
    this.compiledAt = options.compiledAt ?? new Date().toISOString();
    this.targetWidth = options.targetWidth ?? 3840;
    this.targetHeight = options.targetHeight ?? 2160;
  }

  /**
   * 编译所有资产规划条目。
   *
   * @param sceneId 场景标识
   * @param planDigest 来源资产规划的 planDigest
   * @param entries 资产规划条目列表
   * @param context 额外编译上下文
   * @returns AssetCompilationResult 编译结果
   */
  async compileAll(
    sceneId: string,
    planDigest: string,
    entries: AssetPlanEntry[],
    context?: Partial<AssetCompilationContext>,
  ): Promise<AssetCompilationResult> {
    const assets: CompiledAsset[] = [];
    let compiledCount = 0;
    let blockedCount = 0;
    let failedCount = 0;

    const ctx: AssetCompilationContext = {
      sceneId,
      targetWidth: this.targetWidth,
      targetHeight: this.targetHeight,
      compiledAt: this.compiledAt,
      ...context,
    };

    for (const entry of entries) {
      const startTime = Date.now();

      // BLOCKED 策略：直接标记为阻断
      if (entry.compilationStrategy === "BLOCKED") {
        assets.push({
          assetId: entry.assetId,
          fileName: entry.fileName,
          category: entry.category,
          truthClass: entry.truthClass,
          lifecycle: entry.lifecycle,
          mimeType: entry.mimeType,
          sha256: "",
          byteSize: 0,
          status: "BLOCKED",
          failureReason: entry.blockedReason ?? "Blocked by asset planner",
          blockedCode: entry.blockedCode,
          sourcePlanEntry: entry,
          compilationDurationMs: Date.now() - startTime,
        });
        blockedCount++;
        continue;
      }

      // 查找合适的编译器
      const compiler = this.findCompiler(entry);
      if (!compiler) {
        assets.push({
          assetId: entry.assetId,
          fileName: entry.fileName,
          category: entry.category,
          truthClass: entry.truthClass,
          lifecycle: entry.lifecycle,
          mimeType: entry.mimeType,
          sha256: "",
          byteSize: 0,
          status: "FAILED",
          failureReason: `No compiler found for category=${entry.category}, strategy=${entry.compilationStrategy}`,
          sourcePlanEntry: entry,
          compilationDurationMs: Date.now() - startTime,
        });
        failedCount++;
        continue;
      }

      try {
        // 编译
        const { bytes, metadata } = await compiler.compile(entry, ctx);

        // 计算 SHA-256
        const sha256 = sha256Bytes(bytes);

        const compiledAsset: CompiledAsset = {
          assetId: entry.assetId,
          fileName: entry.fileName,
          category: entry.category,
          truthClass: entry.truthClass,
          lifecycle: entry.lifecycle,
          mimeType: entry.mimeType,
          dimensions: entry.expectedDimensions,
          bitDepth: entry.expectedBitDepth,
          colorSpace: entry.colorSpace,
          parallaxLayer: entry.parallaxLayer,
          sha256,
          byteSize: bytes.length,
          status: "COMPILED",
          sourcePlanEntry: entry,
          compilationDurationMs: Date.now() - startTime,
          description: entry.description,
        };

        // 边界守卫断言
        assertAssetBoundary(compiledAsset);

        assets.push(compiledAsset);
        compiledCount++;
      } catch (error) {
        assets.push({
          assetId: entry.assetId,
          fileName: entry.fileName,
          category: entry.category,
          truthClass: entry.truthClass,
          lifecycle: entry.lifecycle,
          mimeType: entry.mimeType,
          sha256: "",
          byteSize: 0,
          status: "FAILED",
          failureReason: error instanceof Error ? error.message : String(error),
          sourcePlanEntry: entry,
          compilationDurationMs: Date.now() - startTime,
        });
        failedCount++;
      }
    }

    // 按 assetId 确定性排序
    assets.sort((a, b) => a.assetId.localeCompare(b.assetId));

    // 构建编译结果（不含 compilationDigest）
    const result: Omit<AssetCompilationResult, "compilationDigest"> = {
      compilationVersion: "1.0.0",
      sceneId,
      sourcePlanDigest: planDigest,
      compiledAt: this.compiledAt,
      assets,
      compiledCount,
      blockedCount,
      failedCount,
    };

    // 计算编译确定性摘要（使用 SHA-256）
    const { sha256Object } = await import("./asset-ledger");
    const compilationDigest = `sha256:${sha256Object(result)}`;

    return {
      ...result,
      compilationDigest,
    };
  }

  /**
   * 查找适合的编译器。
   */
  private findCompiler(entry: AssetPlanEntry): IAssetCompiler | null {
    for (const compiler of this.compilers) {
      // 检查策略支持
      if (!compiler.supportedStrategies.includes(entry.compilationStrategy)) {
        continue;
      }
      // 检查类别支持（* 表示通配）
      if (!compiler.supportedCategories.includes("*") &&
          !compiler.supportedCategories.includes(entry.category)) {
        continue;
      }
      return compiler;
    }
    return null;
  }
}
