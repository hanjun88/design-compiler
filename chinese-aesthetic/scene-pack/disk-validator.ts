/**
 * Phase 4-D: Scene Pack Disk Validator
 *
 * 磁盘场景包验证器——冷启动文件读取与物理 SHA-256 二次复核。
 *
 * 核心原则：
 * - 脱离内存上下文，仅依据磁盘二进制进行验证
 * - 不依赖 mtime/atime/ctime/inode，唯一物理依据为 SHA-256
 * - 篡改检测：任意 1 字节变更必须被拦截
 * - 目录完整性：缺失/多余文件均需报告
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { sha256Bytes, sha256String } from "./asset-ledger";
import type { PackDirectoryManifest, ManifestFileEntry } from "./disk-emitter";

// ---------------------------------------------------------------------------
// 验证结果类型
// ---------------------------------------------------------------------------

export interface HashMismatch {
  /** 文件相对路径 */
  path: string;
  /** 清单中的期望哈希 */
  expectedSha256: string;
  /** 磁盘实际哈希 */
  actualSha256: string;
}

export interface DiskValidationResult {
  /** 总体是否通过 */
  valid: boolean;
  /** 验证的输出目录 */
  outputDir: string;
  /** 读取到的目录清单（读取失败时为 null） */
  manifest: PackDirectoryManifest | null;
  /** 哈希不匹配的文件 */
  mismatches: HashMismatch[];
  /** 清单中声明但磁盘缺失的文件 */
  missingFiles: string[];
  /** 磁盘存在但清单未声明的文件 */
  extraFiles: string[];
  /** 根哈希验证结果 */
  rootHashValid: boolean;
  /** 期望根哈希 */
  expectedRootHash?: string;
  /** 实际根哈希 */
  actualRootHash?: string;
  /** 错误信息（如 manifest.json 无法读取/解析） */
  errors: string[];
}

// ---------------------------------------------------------------------------
// 递归收集目录中的所有文件（相对路径）
// ---------------------------------------------------------------------------

function collectFilesRecursive(dir: string, baseDir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);
    if (entry.isDirectory()) {
      results.push(...collectFilesRecursive(fullPath, baseDir));
    } else {
      results.push(relativePath.split(path.sep).join("/"));
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// DiskValidator
// ---------------------------------------------------------------------------

/**
 * 磁盘场景包验证器。
 *
 * 冷启动读取磁盘文件，与 manifest.json 进行全等比对。
 */
export class DiskValidator {
  /**
   * 验证指定目录下的场景包。
   *
   * @param outputDir 场景包输出目录
   * @returns DiskValidationResult
   */
  validate(outputDir: string): DiskValidationResult {
    const mismatches: HashMismatch[] = [];
    const missingFiles: string[] = [];
    const errors: string[] = [];

    // ── Step 1: 冷读取 manifest.json ──
    const manifestPath = path.join(outputDir, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
      return {
        valid: false,
        outputDir,
        manifest: null,
        mismatches: [],
        missingFiles: [],
        extraFiles: [],
        rootHashValid: false,
        errors: [`manifest.json not found at ${manifestPath}`],
      };
    }

    let manifest: PackDirectoryManifest;
    try {
      const raw = fs.readFileSync(manifestPath, "utf8");
      manifest = JSON.parse(raw) as PackDirectoryManifest;
    } catch (error) {
      return {
        valid: false,
        outputDir,
        manifest: null,
        mismatches: [],
        missingFiles: [],
        extraFiles: [],
        rootHashValid: false,
        errors: [`Failed to parse manifest.json: ${error instanceof Error ? error.message : String(error)}`],
      };
    }

    // ── Step 2: 逐个文件冷读取 + SHA-256 复核 ──
    for (const file of manifest.files) {
      const filePath = path.join(outputDir, file.path);

      if (!fs.existsSync(filePath)) {
        missingFiles.push(file.path);
        continue;
      }

      // 冷读取磁盘二进制
      const bytes = fs.readFileSync(filePath);
      const actualHash = sha256Bytes(bytes);

      if (actualHash !== file.sha256) {
        mismatches.push({
          path: file.path,
          expectedSha256: file.sha256,
          actualSha256: actualHash,
        });
      }

      // 验证文件大小
      if (bytes.length !== file.byteSize) {
        mismatches.push({
          path: file.path,
          expectedSha256: file.sha256,
          actualSha256: actualHash,
        });
        errors.push(
          `File "${file.path}" size mismatch: expected ${file.byteSize}, got ${bytes.length}`,
        );
      }
    }

    // ── Step 3: 检测多余文件（磁盘有但清单没有）──
    const diskFiles = collectFilesRecursive(outputDir, outputDir);
    const manifestPaths = new Set(manifest.files.map((f) => f.path));
    // manifest.json 自身不在清单文件列表中（它是清单本身）
    manifestPaths.add("manifest.json");

    const extraFiles = diskFiles.filter((f) => !manifestPaths.has(f));

    // ── Step 4: 根哈希复核 ──
    const sortedFiles = [...manifest.files].sort((a, b) => a.path.localeCompare(b.path));
    const actualRootHash = sha256String(
      sortedFiles.map((f) => f.sha256).join(""),
    );
    const rootHashValid = actualRootHash === manifest.rootHash;

    // ── Step 5: 汇总 ──
    const valid =
      mismatches.length === 0 &&
      missingFiles.length === 0 &&
      extraFiles.length === 0 &&
      rootHashValid &&
      errors.length === 0;

    return {
      valid,
      outputDir,
      manifest,
      mismatches,
      missingFiles,
      extraFiles,
      rootHashValid,
      expectedRootHash: manifest.rootHash,
      actualRootHash,
      errors,
    };
  }

  /**
   * 验证指定文件的 SHA-256 是否与清单匹配。
   * 用于篡改检测的精准定位。
   */
  validateFile(
    outputDir: string,
    relativePath: string,
  ): { valid: boolean; expectedSha256?: string; actualSha256?: string; error?: string } {
    const manifestPath = path.join(outputDir, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
      return { valid: false, error: "manifest.json not found" };
    }

    try {
      const manifest = JSON.parse(
        fs.readFileSync(manifestPath, "utf8"),
      ) as PackDirectoryManifest;
      const entry = manifest.files.find((f) => f.path === relativePath);
      if (!entry) {
        return { valid: false, error: `File "${relativePath}" not in manifest` };
      }

      const filePath = path.join(outputDir, relativePath);
      if (!fs.existsSync(filePath)) {
        return { valid: false, expectedSha256: entry.sha256, error: "File not found on disk" };
      }

      const bytes = fs.readFileSync(filePath);
      const actualHash = sha256Bytes(bytes);
      return {
        valid: actualHash === entry.sha256,
        expectedSha256: entry.sha256,
        actualSha256: actualHash,
      };
    } catch (error) {
      return {
        valid: false,
        error: `Validation error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// 便捷函数
// ---------------------------------------------------------------------------

/**
 * 验证场景包目录。
 */
export function validateScenePackOnDisk(outputDir: string): DiskValidationResult {
  const validator = new DiskValidator();
  return validator.validate(outputDir);
}
