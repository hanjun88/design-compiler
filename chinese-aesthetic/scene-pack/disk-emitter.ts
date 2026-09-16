/**
 * Phase 4-D: Deterministic Scene Pack Disk Emitter
 * Phase 4-D.1: Safe Replacement & Path Boundary Hardening
 *
 * 将内存中的 Golden Scene Pack 编译结果原子化落盘为可归档、可分发的物理目录。
 *
 * 目录拓扑：
 *   <outputDir>/
 *   ├── assets/
 *   │   ├── scene.webp              # SOURCE / PHYSICAL
 *   │   ├── depth.webp              # DERIVED
 *   │   ├── water-mask.webp         # DERIVED
 *   │   ├── water-normal.webp       # DERIVED
 *   │   ├── gate-colossus.webp      # SOURCE
 *   │   ├── gate-left.webp          # SOURCE
 *   │   ├── gate-right.webp         # SOURCE
 *   │   └── interior-realm.webp     # SOURCE
 *   ├── evidence/
 *   │   ├── machine-provenance.json # 机器五元穿透账本
 *   │   └── human-audit-ledger.json # 六维美学审计证据
 *   ├── scene.json                  # Runtime 驱动主清单
 *   └── manifest.json               # 目录级清单与物理 SHA-256 账本
 *
 * 核心规则：
 * - 原子写入：临时隔离目录 → 全量校验 → 两阶段提交（备份→交换→清理）
 * - 安全替换：目标目录先腾挪至备份区，交换失败自动回滚，杜绝数据丢失
 * - 路径边界：所有写入路径经 resolveSandboxedPath 校验，阻断路径穿越
 * - 物理重读自洽：落盘后由 DiskValidator 冷启动读取复核
 * - FS 元数据中立：不依赖 mtime/atime/ctime/inode，唯一依据为 SHA-256
 * - 目录级清单：manifest.json 声明全量相对路径索引与根哈希
 * - 历史边界：作为独立 emitter 组件，不修改 compiler-core / Phase 4-B 核心
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { SceneCompilationIR } from "../scene-contract/types";
import type { ProfessionalScenePack, AssetPlanEntry, AssetTruthClass } from "./types";
import type { IAssetCompiler, AssetCompilationContext } from "./asset-compiler";
import { sha256Bytes, sha256String } from "./asset-ledger";
import { GoldenPackCompiler } from "./golden-pack-compiler";
import type { GoldenPackCompilerOptions, GoldenScenePackResult } from "./golden-pack-compiler";
import type { DualEvidenceBundle } from "./evidence";
import { resolveSandboxedPath, SecurityPathError } from "./safe-path";
import { recoverFromPreviousCrashSync, type CrashRecoveryReport } from "./crash-recovery";

// ---------------------------------------------------------------------------
// 目录级清单类型
// ---------------------------------------------------------------------------

/** 清单中的单个文件条目 */
export interface ManifestFileEntry {
  /** 相对路径（如 "assets/scene.webp"） */
  path: string;
  /** SHA-256 十六进制哈希 */
  sha256: string;
  /** 文件大小（字节） */
  byteSize: number;
  /** MIME 类型 */
  mimeType: string;
  /** 真实性分类（SOURCE / DERIVED / GENERATED），Phase 4-D.5 强制必填 */
  truthClass: AssetTruthClass;
}

/** 场景包目录级清单 */
export interface PackDirectoryManifest {
  /** 清单版本 */
  manifestVersion: "1.0.0";
  /** 场景包版本 */
  packVersion: "1.0.0";
  /** 场景标识 */
  sceneId: string;
  /** 生成时间（确定性固定值） */
  generatedAt: string;
  /** 场景包摘要（来自 ProfessionalScenePack.packDigest，确定性 SHA-256） */
  scenePackDigest: string;
  /** 根哈希 = SHA-256(所有文件 sha256 按 path 排序后拼接) */
  rootHash: string;
  /** 文件总数 */
  fileCount: number;
  /** 文件条目列表（按 path 排序） */
  files: ManifestFileEntry[];
}

// ---------------------------------------------------------------------------
// 落盘结果与错误
// ---------------------------------------------------------------------------

export interface DiskEmitError {
  code: string;
  message: string;
  path?: string;
}

export interface DiskEmitResult {
  /** 是否成功 */
  success: boolean;
  /** 最终输出目录 */
  outputDir: string;
  /** 目录清单 */
  manifest: PackDirectoryManifest | null;
  /** 错误列表 */
  errors: DiskEmitError[];
  /** 临时目录是否已清理 */
  tempDirCleaned: boolean;
  /** 是否执行了安全回滚（交换失败后恢复原目录） */
  rollbackPerformed?: boolean;
  /** 崩溃自愈报告（emit() 入口前置探测结果） */
  recoveryReport?: CrashRecoveryReport;
}

// ---------------------------------------------------------------------------
// 规范 JSON 序列化（确定性，键排序）
// ---------------------------------------------------------------------------

/**
 * 规范化对象为键排序的 JSON 字符串。
 * 保证跨运行证据文件字节级一致（DISK-03）。
 */
function canonicalStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return "[" + obj.map((item) => canonicalStringify(item)).join(",") + "]";
  }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
    sorted[key] = (obj as Record<string, unknown>)[key];
  }
  const pairs = Object.entries(sorted).map(
    ([k, v]) => JSON.stringify(k) + ":" + canonicalStringify(v),
  );
  return "{" + pairs.join(",") + "}";
}

// ---------------------------------------------------------------------------
// ByteCaptureCompiler —— 字节捕获装饰器
// ---------------------------------------------------------------------------

/**
 * 字节捕获编译器。
 *
 * 装饰任意 IAssetCompiler，在编译时将原始字节捕获到内部 Map。
 * 无需修改 Phase 4-B 的 AssetCompilationCoordinator（ZERO DIFF）。
 */
export class ByteCaptureCompiler implements IAssetCompiler {
  private inner: IAssetCompiler;
  private captured: Map<string, Uint8Array> = new Map();

  constructor(inner: IAssetCompiler) {
    this.inner = inner;
  }

  get compilerId(): string {
    return this.inner.compilerId;
  }

  get supportedCategories(): string[] {
    return this.inner.supportedCategories;
  }

  get supportedStrategies(): AssetPlanEntry["compilationStrategy"][] {
    return this.inner.supportedStrategies;
  }

  async compile(
    entry: AssetPlanEntry,
    context: AssetCompilationContext,
  ): Promise<{ bytes: Uint8Array; metadata?: Record<string, unknown> }> {
    const result = await this.inner.compile(entry, context);
    // 存储字节副本，防止外部修改影响捕获
    this.captured.set(entry.assetId, new Uint8Array(result.bytes));
    return result;
  }

  /** 获取指定资产的捕获字节 */
  getBytes(assetId: string): Uint8Array | undefined {
    return this.captured.get(assetId);
  }

  /** 获取所有捕获字节的副本 */
  getAllBytes(): Map<string, Uint8Array> {
    const copy = new Map<string, Uint8Array>();
    for (const [id, bytes] of this.captured) {
      copy.set(id, new Uint8Array(bytes));
    }
    return copy;
  }

  /** 清空捕获 */
  clear(): void {
    this.captured.clear();
  }
}

// ---------------------------------------------------------------------------
// DiskEmitter —— 原子落盘器（Phase 4-D.1 安全加固）
// ---------------------------------------------------------------------------

export interface DiskEmitterOptions {
  /** 生成时间（用于确定性，默认固定值） */
  generatedAt?: string;
}

/**
 * 场景包磁盘发射器。
 *
 * 将内存编译结果原子化写入物理目录。
 *
 * 安全替换流程（两阶段提交）：
 *   1. 写入 staging 目录（.tmp-<hex>）
 *   2. 全量自校验
 *   3. 若目标存在 → rename(target → backup)
 *   4. rename(staging → target)
 *   5. 若步骤 4 失败 → rename(backup → target) 回滚
 *   6. 成功 → rm(backup)
 *
 * 杜绝"先删后挪"导致的不可逆数据丢失。
 */
export class DiskEmitter {
  private generatedAt: string;

  constructor(options: DiskEmitterOptions = {}) {
    this.generatedAt = options.generatedAt ?? "2026-09-16T00:00:00.000Z";
  }

  /**
   * 将场景包发射到磁盘。
   *
   * @param pack 专业场景包（含元数据与哈希）
   * @param evidence 双证据链
   * @param assetBytes 资产字节映射（assetId → 原始字节）
   * @param outputDir 目标输出目录
   * @returns DiskEmitResult
   */
  emit(
    pack: ProfessionalScenePack,
    evidence: DualEvidenceBundle,
    assetBytes: Map<string, Uint8Array>,
    outputDir: string,
  ): DiskEmitResult {
    const errors: DiskEmitError[] = [];
    let stagingDir = "";
    let backupDir = "";
    let stagingCleaned = false;
    let rollbackPerformed = false;

    // ── Phase 4-D.2: 前置崩溃自愈 ──
    // 在建立 staging 之前探测前次进程崩溃遗留的孤儿 backup/staging，
    // 确保目标目录处于已知状态，避免两阶段提交之间的崩溃残留。
    const recoveryReport = recoverFromPreviousCrashSync(outputDir);
    if (!recoveryReport.recovered) {
      return {
        success: false,
        outputDir,
        manifest: null,
        errors: [{
          code: "CRASH_RECOVERY_FAILED",
          message: recoveryReport.message,
        }],
        tempDirCleaned: true,
        rollbackPerformed: false,
        recoveryReport,
      };
    }

    try {
      // ── Step 1: 创建临时隔离目录 ──
      const stagingSuffix = crypto.randomBytes(8).toString("hex");
      stagingDir = `${outputDir}.staging-${stagingSuffix}`;

      // 如果临时目录已存在（极端情况），先清理
      if (fs.existsSync(stagingDir)) {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      }
      fs.mkdirSync(stagingDir, { recursive: true });

      // ── Step 2: 写入资产文件（路径边界校验） ──
      const manifestFiles: ManifestFileEntry[] = [];
      const compiledAssets = pack.compiledAssets.assets.filter(
        (a) => a.status === "COMPILED",
      );

      for (const asset of compiledAssets) {
        const bytes = assetBytes.get(asset.assetId);
        if (!bytes) {
          errors.push({
            code: "MISSING_ASSET_BYTES",
            message: `Asset "${asset.assetId}" has no captured bytes — cannot emit`,
            path: asset.fileName,
          });
          continue;
        }

        // 验证字节哈希与编译结果一致（内存内自洽）
        const actualHash = sha256Bytes(bytes);
        if (actualHash !== asset.sha256) {
          errors.push({
            code: "IN_MEMORY_HASH_MISMATCH",
            message: `Asset "${asset.assetId}" bytes hash mismatch: expected ${asset.sha256}, got ${actualHash}`,
            path: asset.fileName,
          });
          continue;
        }

        // scene.json 写根目录，其余写 assets/
        const isSceneManifest = asset.assetId === "asset:scene-manifest";
        const relativePath = isSceneManifest
          ? asset.fileName
          : path.join("assets", asset.fileName);

        // 路径边界校验：阻断路径穿越
        const filePath = resolveSandboxedPath(stagingDir, relativePath);

        // 确保父目录存在
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, bytes);

        // 验证写入大小
        const writtenSize = fs.statSync(filePath).size;
        if (writtenSize !== bytes.length) {
          errors.push({
            code: "WRITE_SIZE_MISMATCH",
            message: `Asset "${asset.assetId}" write size mismatch: expected ${bytes.length}, got ${writtenSize}`,
            path: relativePath,
          });
          continue;
        }

        manifestFiles.push({
          path: relativePath,
          sha256: asset.sha256,
          byteSize: bytes.length,
          mimeType: asset.mimeType,
          truthClass: asset.truthClass,
        });
      }

      if (errors.length > 0) {
        throw new Error("Asset emission failed");
      }

      // ── Step 3: 写入证据文件（路径边界校验） ──
      const machineJson = canonicalStringify(evidence.machine);
      const humanJson = canonicalStringify(evidence.human);

      const machinePath = resolveSandboxedPath(stagingDir, "evidence/machine-provenance.json");
      const humanPath = resolveSandboxedPath(stagingDir, "evidence/human-audit-ledger.json");

      fs.mkdirSync(path.dirname(machinePath), { recursive: true });
      fs.writeFileSync(machinePath, machineJson, "utf8");
      fs.writeFileSync(humanPath, humanJson, "utf8");

      manifestFiles.push({
        path: "evidence/machine-provenance.json",
        sha256: sha256String(machineJson),
        byteSize: Buffer.byteLength(machineJson, "utf8"),
        mimeType: "application/json",
        truthClass: "DERIVED",
      });
      manifestFiles.push({
        path: "evidence/human-audit-ledger.json",
        sha256: sha256String(humanJson),
        byteSize: Buffer.byteLength(humanJson, "utf8"),
        mimeType: "application/json",
        truthClass: "DERIVED",
      });

      // ── Step 4: 生成并写入 manifest.json ──
      manifestFiles.sort((a, b) => a.path.localeCompare(b.path));

      const rootHash = sha256String(
        manifestFiles.map((f) => f.sha256).join(""),
      );

      const manifest: PackDirectoryManifest = {
        manifestVersion: "1.0.0",
        packVersion: pack.packVersion,
        sceneId: pack.sceneId,
        generatedAt: this.generatedAt,
        // packDigest 可能带 "sha256:" 算法前缀，剥离后存储纯十六进制摘要
        scenePackDigest: pack.packDigest.replace(/^sha256:/i, ""),
        rootHash,
        fileCount: manifestFiles.length,
        files: manifestFiles,
      };

      const manifestJson = canonicalStringify(manifest);
      const manifestPath = resolveSandboxedPath(stagingDir, "manifest.json");
      fs.writeFileSync(manifestPath, manifestJson, "utf8");

      // ── Step 5: 全量写入校验（存在性 + 大小） ──
      for (const file of manifestFiles) {
        const checkPath = resolveSandboxedPath(stagingDir, file.path);
        if (!fs.existsSync(checkPath)) {
          errors.push({
            code: "FILE_MISSING_AFTER_WRITE",
            message: `File "${file.path}" missing after write`,
            path: file.path,
          });
        }
      }
      if (!fs.existsSync(manifestPath)) {
        errors.push({
          code: "MANIFEST_MISSING_AFTER_WRITE",
          message: "manifest.json missing after write",
        });
      }

      if (errors.length > 0) {
        throw new Error("Post-write verification failed");
      }

      // ── Step 6: 两阶段提交——安全替换（Phase 4-D.1 核心加固） ──
      // 旧逻辑（P0 风险）：if exists → rmSync(target) → rename(staging, target)
      //   若 rename 失败（EXDEV/EBUSY/EACCES），原目录已被删除，数据永久丢失。
      //
      // 新逻辑：if exists → rename(target → backup) → rename(staging → target)
      //   若第二步失败 → rename(backup → target) 自动回滚，原目录完好无损。
      const targetExists = fs.existsSync(outputDir);

      if (targetExists) {
        // 6a. 将原目录腾挪至安全备份区
        const backupSuffix = crypto.randomBytes(8).toString("hex");
        backupDir = `${outputDir}.backup-${backupSuffix}`;
        // 若备份目录已存在（极端竞态），先清理
        if (fs.existsSync(backupDir)) {
          fs.rmSync(backupDir, { recursive: true, force: true });
        }
        fs.renameSync(outputDir, backupDir);
      }

      try {
        // 6b. 原子交换：staging → target
        fs.renameSync(stagingDir, outputDir);
        stagingCleaned = true; // staging 已重命名为 target，不再存在
      } catch (renameErr) {
        // 6c. 交换失败 → 物理回滚：恢复原目录
        if (targetExists && fs.existsSync(backupDir)) {
          try {
            fs.renameSync(backupDir, outputDir);
            rollbackPerformed = true;
          } catch {
            // 回滚也失败——记录严重错误，备份目录仍在可手动恢复
            errors.push({
              code: "ROLLBACK_FAILED",
              message: `Atomic swap failed and rollback failed: ${renameErr instanceof Error ? renameErr.message : String(renameErr)}. Backup retained at ${backupDir}`,
            });
          }
        }
        throw renameErr;
      }

      // 6d. 提交成功 → 物理擦除备份目录
      if (targetExists && fs.existsSync(backupDir)) {
        try {
          fs.rmSync(backupDir, { recursive: true, force: true });
        } catch {
          // 备份清理失败不影响主流程，但记录警告
          errors.push({
            code: "BACKUP_CLEANUP_WARNING",
            message: `Failed to remove backup directory ${backupDir} (manual cleanup may be needed)`,
            path: backupDir,
          });
        }
      }

      return {
        success: true,
        outputDir,
        manifest,
        errors: errors.length > 0 ? errors : [],
        tempDirCleaned: true,
        rollbackPerformed: false,
        recoveryReport,
      };
    } catch (error) {
      // ── 失败清理：删除 staging 目录（backup 保留以便回滚/手动恢复） ──
      if (stagingDir && fs.existsSync(stagingDir)) {
        try {
          fs.rmSync(stagingDir, { recursive: true, force: true });
          stagingCleaned = true;
        } catch {
          stagingCleaned = false;
        }
      }

      if (errors.length === 0) {
        const isSecurityError = error instanceof SecurityPathError;
        errors.push({
          code: isSecurityError ? error.code : "EMIT_FAILED",
          message: error instanceof Error ? error.message : String(error),
        });
      }

      return {
        success: false,
        outputDir,
        manifest: null,
        errors,
        tempDirCleaned: stagingCleaned,
        rollbackPerformed,
        recoveryReport,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// 便捷函数：编译 + 捕获字节 + 落盘（一站式）
// ---------------------------------------------------------------------------

export interface GoldenPackCompileAndEmitOptions extends GoldenPackCompilerOptions {
  /** 目标输出目录 */
  outputDir: string;
  /** 落盘生成时间（确定性） */
  emitGeneratedAt?: string;
}

export interface GoldenPackCompileAndEmitResult {
  /** 落盘结果 */
  emitResult: DiskEmitResult;
  /** 编译结果（含 pack 与证据） */
  packResult: GoldenScenePackResult;
  /** 捕获的资产字节 */
  assetBytes: Map<string, Uint8Array>;
}

/**
 * 一站式：编译 Golden Scene Pack → 捕获字节 → 原子落盘。
 *
 * @param ir SceneCompilationIR
 * @param options 编译与落盘选项
 * @returns GoldenPackCompileAndEmitResult
 */
export async function compileAndEmitToDisk(
  ir: SceneCompilationIR,
  options: GoldenPackCompileAndEmitOptions,
): Promise<GoldenPackCompileAndEmitResult> {
  const { outputDir, emitGeneratedAt, ...compilerOptions } = options;

  // 用 ByteCaptureCompiler 包装 StandardAssetCompiler
  const { StandardAssetCompiler } = await import("./standard-asset-compiler");
  const captureCompiler = new ByteCaptureCompiler(
    new StandardAssetCompiler({ compilerId: "standard-asset-compiler@1.0.0" }),
  );

  // 编译（注入捕获编译器）
  const compiler = new GoldenPackCompiler({
    ...compilerOptions,
    assetCompiler: captureCompiler,
  });
  const packResult = await compiler.compile(ir);

  if (!packResult.success || !packResult.pack || !packResult.evidence) {
    return {
      emitResult: {
        success: false,
        outputDir,
        manifest: null,
        errors: [{
          code: "COMPILATION_FAILED",
          message: `Golden Pack compilation failed: ${packResult.errors.map((e) => e.message).join("; ")}`,
        }],
        tempDirCleaned: true,
      },
      packResult,
      assetBytes: captureCompiler.getAllBytes(),
    };
  }

  // 落盘
  const emitter = new DiskEmitter({ generatedAt: emitGeneratedAt });
  const emitResult = emitter.emit(
    packResult.pack,
    packResult.evidence,
    captureCompiler.getAllBytes(),
    outputDir,
  );

  return {
    emitResult,
    packResult,
    assetBytes: captureCompiler.getAllBytes(),
  };
}
