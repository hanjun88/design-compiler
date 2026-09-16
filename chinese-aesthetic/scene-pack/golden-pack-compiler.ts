/**
 * Phase 4-C: Golden Scene Pack Compiler
 *
 * Golden 场景包编译器——从真实物理资产编译专业场景包并附带双证据链。
 *
 * 四阶段流水线：
 * 1. Asset Planning（复用 Phase 4-B 的 planAssets）
 * 2. Asset Compilation（使用 StandardAssetCompiler，非 Mock）
 * 3. Asset Validation（复用 Phase 4-B 的 validateAssets）
 * 4. Scene Pack Emission + Dual Evidence Generation
 *
 * 核心原则：
 * - 无真实字节，不入仓库
 * - SOURCE 资产缺失 → MISSING_SOURCE_EVIDENCE 致命错误
 * - 派生资产使用确定性算法
 * - 双证据链（Machine + Human）不可篡改
 */

import type { SceneCompilationIR } from "../scene-contract/types";
import type {
  ProfessionalScenePack,
  ScenePackCompilationResult,
  ScenePackCompilerOptions,
} from "./types";
import { planAssets } from "./asset-planner";
import { AssetCompilationCoordinator } from "./asset-compiler";
import { StandardAssetCompiler } from "./standard-asset-compiler";
import { validateAssets } from "./asset-validator";
import { buildAssetHashLedger, sha256Object } from "./asset-ledger";
import { ScenePackEmitter } from "./scene-pack-emitter";
import { generateDualEvidence, verifyDualEvidence } from "./evidence";
import type { DualEvidenceBundle } from "./evidence";

// ---------------------------------------------------------------------------
// Golden Scene Pack 编译结果
// ---------------------------------------------------------------------------

export interface GoldenScenePackResult extends ScenePackCompilationResult {
  /** 双证据链（成功时） */
  evidence?: DualEvidenceBundle;
  /** 证据验证结果 */
  evidenceVerification?: ReturnType<typeof verifyDualEvidence>;
}

// ---------------------------------------------------------------------------
// Golden Pack 编译器选项
// ---------------------------------------------------------------------------

export interface GoldenPackCompilerOptions {
  /** 源资产目录（SOURCE 类资产的物理位置） */
  sourceAssetsDir: string;
  /** 输出目录 */
  outputDir?: string;
  /** 目标宽度（默认 1920） */
  targetWidth?: number;
  /** 目标高度（默认 1080） */
  targetHeight?: number;
  /** 编译器版本 */
  compilerVersion?: string;
  /** 编译时间（用于确定性，默认使用固定值） */
  compiledAt?: string;
  /** 美学范式（用于 Human Evidence） */
  aestheticParadigm?: "SONG" | "TANG" | "MING" | "CONTEMPORARY_CYBER_CHINESE";
  /** 是否允许 GENERATED 资产（默认 false） */
  allowGeneratedAssets?: boolean;
}

// ---------------------------------------------------------------------------
// 确定性编译时间常量
// ---------------------------------------------------------------------------

/**
 * Golden Pack 的确定性编译时间。
 * 使用固定值确保跨机器/跨架构编译结果一致（GOLDEN-02）。
 */
const GOLDEN_PACK_DETERMINISTIC_TIME = "2026-09-16T00:00:00.000Z";

// ---------------------------------------------------------------------------
// Golden Pack 编译器
// ---------------------------------------------------------------------------

/**
 * Golden Scene Pack 编译器。
 *
 * 使用 StandardAssetCompiler（真实物理资产）编译场景包，
 * 并生成 Machine + Human 双证据链。
 */
export class GoldenPackCompiler {
  private options: GoldenPackCompilerOptions;
  private standardCompiler: StandardAssetCompiler;

  constructor(options: GoldenPackCompilerOptions) {
    this.options = options;
    this.standardCompiler = new StandardAssetCompiler({
      compilerId: "standard-asset-compiler@1.0.0",
    });
  }

  /**
   * 编译 Golden Scene Pack。
   *
   * @param ir SceneCompilationIR
   * @returns GoldenScenePackResult 编译结果（含双证据链）
   */
  async compile(ir: SceneCompilationIR): Promise<GoldenScenePackResult> {
    const startTime = Date.now();
    const errors: GoldenScenePackResult["errors"] = [];
    const warnings: GoldenScenePackResult["warnings"] = [];
    const compiledAt = this.options.compiledAt ?? GOLDEN_PACK_DETERMINISTIC_TIME;
    const targetWidth = this.options.targetWidth ?? 1920;
    const targetHeight = this.options.targetHeight ?? 1080;

    try {
      // ── Stage 1: Asset Planning ──
      const assetPlan = planAssets(ir, {
        plannedAt: compiledAt,
        targetWidth,
        targetHeight,
        allowGeneratedAssets: this.options.allowGeneratedAssets ?? false,
      });

      for (const entry of assetPlan.entries) {
        if (entry.compilationStrategy === "BLOCKED") {
          warnings.push({
            code: "ASSET_PLAN_BLOCKED",
            message: `Asset ${entry.assetId} BLOCKED: ${entry.blockedReason ?? "unknown"}`,
          });
        }
      }

      // ── Stage 2: Asset Compilation (StandardAssetCompiler, non-Mock) ──
      const coordinator = new AssetCompilationCoordinator({
        compilers: [this.standardCompiler],
        compiledAt,
        targetWidth,
        targetHeight,
      });

      const compiledAssets = await coordinator.compileAll(
        ir.sceneId,
        assetPlan.planDigest,
        assetPlan.entries,
        {
          sourceAssetsDir: this.options.sourceAssetsDir,
        },
      );

      for (const asset of compiledAssets.assets) {
        if (asset.status === "FAILED") {
          errors.push({
            code: "ASSET_COMPILATION_FAILED",
            message: `Asset ${asset.assetId} failed: ${asset.failureReason ?? "unknown"}`,
            assetId: asset.assetId,
          });
        }
      }

      // ── Stage 2.5: 确定性归一化 ──
      // compilationDurationMs 是运行时指标（Date.now() 差值），必须从确定性摘要中排除。
      // 归一化为 0 并重算 compilationDigest，保证跨机器/跨架构 packDigest 逐字节一致（GOLDEN-02）。
      const deterministicAssets = compiledAssets.assets.map((asset) => ({
        ...asset,
        compilationDurationMs: 0,
      }));
      const { compilationDigest: _staleDigest, ...compiledWithoutDigest } = compiledAssets;
      const deterministicBase = {
        ...compiledWithoutDigest,
        assets: deterministicAssets,
      };
      const compilationDigest = `sha256:${sha256Object(deterministicBase)}`;
      const deterministicCompiled = {
        ...deterministicBase,
        compilationDigest,
      };

      // ── Stage 3: Asset Validation ──
      const validationReport = validateAssets(ir.sceneId, deterministicAssets, compiledAt);

      if (!validationReport.allValid) {
        for (const result of validationReport.results) {
          if (!result.valid) {
            for (const violation of result.violations) {
              errors.push({
                code: violation.code,
                message: `Asset ${result.assetId}: ${violation.message}`,
                assetId: result.assetId,
              });
            }
          }
        }
      }

      // ── Stage 4: Hash Ledger ──
      const hashLedger = buildAssetHashLedger(ir.sceneId, deterministicAssets, {
        generatedAt: compiledAt,
      });

      // ── Stage 5: Scene Pack Emission ──
      const emitter = new ScenePackEmitter({
        compilerVersion: this.options.compilerVersion ?? "golden-pack-compiler@1.0.0",
        generatedAt: compiledAt,
      });

      const pack = emitter.emit(ir, assetPlan, deterministicCompiled, validationReport, hashLedger);

      // ── Stage 6: Dual Evidence Generation ──
      const evidence = generateDualEvidence(pack, {
        compilerId: "standard-asset-compiler@1.0.0",
        generatedAt: compiledAt,
        aestheticParadigm: this.options.aestheticParadigm ?? "CONTEMPORARY_CYBER_CHINESE",
      });

      // ── Stage 7: Evidence Verification ──
      const evidenceVerification = verifyDualEvidence(evidence, pack);

      if (!evidenceVerification.valid) {
        for (const v of evidenceVerification.violations) {
          errors.push({
            code: `EVIDENCE_${v.code}`,
            message: v.message,
          });
        }
      }

      return {
        success: errors.length === 0,
        pack,
        evidence,
        evidenceVerification,
        errors,
        warnings,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        errors: [{
          code: "GOLDEN_PACK_COMPILATION_ERROR",
          message: error instanceof Error ? error.message : String(error),
        }],
        warnings,
        durationMs: Date.now() - startTime,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// 便捷函数
// ---------------------------------------------------------------------------

/**
 * 便捷函数：编译 Golden Scene Pack。
 *
 * @param ir SceneCompilationIR
 * @param options 编译器选项
 * @returns GoldenScenePackResult
 */
export async function compileGoldenScenePack(
  ir: SceneCompilationIR,
  options: GoldenPackCompilerOptions,
): Promise<GoldenScenePackResult> {
  const compiler = new GoldenPackCompiler(options);
  return compiler.compile(ir);
}
