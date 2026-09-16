/**
 * Scene Pack Emitter
 *
 * 场景包发射器。
 *
 * 将资产规划、编译结果、验证报告、哈希账本组装成最终的 Professional Scene Pack。
 *
 * 核心职责：
 * 1. 组装所有编译产物
 * 2. 计算场景包确定性摘要（SHA-256）
 * 3. 保留完整溯源链
 * 4. 记录能力阻断
 */

import type { SceneCompilationIR } from "../scene-contract/types";
import type {
  ProfessionalScenePack,
  AssetPlan,
  AssetCompilationResult,
  AssetValidationReport,
  AssetHashLedger,
  ScenePackCompilationResult,
} from "./types";
import { sha256Object } from "./asset-ledger";

// ---------------------------------------------------------------------------
// 场景包发射器
// ---------------------------------------------------------------------------

export interface ScenePackEmitterOptions {
  /** 编译器版本 */
  compilerVersion?: string;
  /** 生成时间 */
  generatedAt?: string;
}

/**
 * 场景包发射器。
 *
 * 将各阶段产物组装成 Professional Scene Pack。
 */
export class ScenePackEmitter {
  private compilerVersion: string;
  private generatedAt: string;

  constructor(options: ScenePackEmitterOptions = {}) {
    this.compilerVersion = options.compilerVersion ?? "scene-pack-compiler@1.0.0";
    this.generatedAt = options.generatedAt ?? new Date().toISOString();
  }

  /**
   * 发射场景包。
   *
   * @param ir 来源 SceneCompilationIR
   * @param assetPlan 资产规划
   * @param compiledAssets 已编译资产
   * @param validationReport 验证报告
   * @param hashLedger 哈希账本
   * @returns ProfessionalScenePack 专业场景包
   */
  emit(
    ir: SceneCompilationIR,
    assetPlan: AssetPlan,
    compiledAssets: AssetCompilationResult,
    validationReport: AssetValidationReport,
    hashLedger: AssetHashLedger,
  ): ProfessionalScenePack {
    // 收集能力阻断记录
    const capabilityBlocks = [
      ...(ir.capabilityBlocks ?? []),
      ...compiledAssets.assets
        .filter((a) => a.status === "BLOCKED" && a.blockedCode)
        .map((a) => ({
          code: a.blockedCode!,
          reason: a.failureReason ?? "Asset blocked during compilation",
          affectedDomain: "assetBindings" as const,
          affectedParameter: a.assetId,
          provenance: {
            instructionSeq: a.sourcePlanEntry.sourceInstructionSeq,
            provenanceHash: undefined,
          },
          blockedAt: this.generatedAt,
        })),
    ];

    // 构建场景包（不含 packDigest）
    const pack: Omit<ProfessionalScenePack, "packDigest"> = {
      packVersion: "1.0.0",
      sceneId: ir.sceneId,
      sourceProvenance: {
        sceneIRDigest: ir.deterministicDigest,
        validatedDesignIRHash: ir.sourceProvenance.validatedDesignIRHash,
        aestheticExecutionPlanHash: ir.sourceProvenance.aestheticExecutionPlanHash,
        aestheticRuntimePlanHash: ir.sourceProvenance.aestheticRuntimePlanHash,
      },
      assetPlan,
      compiledAssets,
      validationReport,
      hashLedger,
      capabilityBlocks,
      generatedAt: this.generatedAt,
      compilerVersion: this.compilerVersion,
    };

    // 计算场景包确定性摘要（SHA-256）
    const packDigest = `sha256:${sha256Object(pack)}`;

    return {
      ...pack,
      packDigest,
    };
  }
}

// ---------------------------------------------------------------------------
// 便捷函数：编译并发射场景包
// ---------------------------------------------------------------------------

import { planAssets } from "./asset-planner";
import { AssetCompilationCoordinator, MockAssetCompiler } from "./asset-compiler";
import { validateAssets } from "./asset-validator";
import { buildAssetHashLedger } from "./asset-ledger";

export interface CompileAndEmitOptions {
  /** 编译器列表 */
  compilers?: import("./asset-compiler").IAssetCompiler[];
  /** 目标宽度 */
  targetWidth?: number;
  /** 目标高度 */
  targetHeight?: number;
  /** 编译器版本 */
  compilerVersion?: string;
  /** 生成时间（用于确定性） */
  generatedAt?: string;
  /** 是否允许 GENERATED 资产 */
  allowGeneratedAssets?: boolean;
}

/**
 * 便捷函数：从 SceneCompilationIR 编译并发射 Professional Scene Pack。
 *
 * 执行完整流水线：
 * 1. Asset Planning
 * 2. Asset Compilation
 * 3. Asset Validation
 * 4. Hash Ledger Building
 * 5. Scene Pack Emission
 *
 * @param ir SceneCompilationIR
 * @param options 编译选项
 * @returns ScenePackCompilationResult 编译结果
 */
export async function compileAndEmitScenePack(
  ir: SceneCompilationIR,
  options: CompileAndEmitOptions = {},
): Promise<ScenePackCompilationResult> {
  const startTime = Date.now();
  const errors: ScenePackCompilationResult["errors"] = [];
  const warnings: ScenePackCompilationResult["warnings"] = [];
  const generatedAt = options.generatedAt ?? new Date().toISOString();

  try {
    // 1. Asset Planning
    const assetPlan = planAssets(ir, {
      plannedAt: generatedAt,
      targetWidth: options.targetWidth,
      targetHeight: options.targetHeight,
      allowGeneratedAssets: options.allowGeneratedAssets,
    });

    // 记录 BLOCKED 资产警告
    for (const entry of assetPlan.entries) {
      if (entry.compilationStrategy === "BLOCKED") {
        warnings.push({
          code: "ASSET_PLAN_BLOCKED",
          message: `Asset ${entry.assetId} is BLOCKED in planning: ${entry.blockedReason ?? "unknown"}`,
        });
      }
    }

    // 2. Asset Compilation
    const coordinator = new AssetCompilationCoordinator({
      compilers: options.compilers ?? [new MockAssetCompiler()],
      compiledAt: generatedAt,
      targetWidth: options.targetWidth,
      targetHeight: options.targetHeight,
    });

    const compiledAssets = await coordinator.compileAll(
      ir.sceneId,
      assetPlan.planDigest,
      assetPlan.entries,
    );

    // 记录编译失败
    for (const asset of compiledAssets.assets) {
      if (asset.status === "FAILED") {
        errors.push({
          code: "ASSET_COMPILATION_FAILED",
          message: `Asset ${asset.assetId} failed: ${asset.failureReason ?? "unknown"}`,
          assetId: asset.assetId,
        });
      }
    }

    // 3. Asset Validation
    const validationReport = validateAssets(ir.sceneId, compiledAssets.assets, generatedAt);

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

    // 4. Hash Ledger Building
    const hashLedger = buildAssetHashLedger(ir.sceneId, compiledAssets.assets, {
      generatedAt,
    });

    // 5. Scene Pack Emission
    const emitter = new ScenePackEmitter({
      compilerVersion: options.compilerVersion,
      generatedAt,
    });

    const pack = emitter.emit(ir, assetPlan, compiledAssets, validationReport, hashLedger);

    return {
      success: errors.length === 0,
      pack,
      errors,
      warnings,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      errors: [{
        code: "SCENE_PACK_COMPILATION_ERROR",
        message: error instanceof Error ? error.message : String(error),
      }],
      warnings,
      durationMs: Date.now() - startTime,
    };
  }
}
