/**
 * Phase 4-D: Scene Pack Disk Validator
 * Phase 4-D.1: Manifest Trust Boundary & Symlink Rejection
 *
 * 磁盘场景包验证器——冷启动文件读取与物理 SHA-256 二次复核。
 *
 * 核心原则：
 * - 脱离内存上下文，仅依据磁盘二进制进行验证
 * - 不依赖 mtime/atime/ctime/inode，唯一物理依据为 SHA-256
 * - 篡改检测：任意 1 字节变更必须被拦截
 * - 目录完整性：缺失/多余文件均需报告
 * - Manifest 信任边界：schema 强校验，阻断畸形/伪造清单
 * - 符号链接拒绝：资产文件不得为软链接（防止越界读取）
 * - 路径边界：所有读取路径经 resolveSandboxedPath 校验
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { sha256Bytes, sha256String } from "./asset-ledger";
import type { PackDirectoryManifest, ManifestFileEntry } from "./disk-emitter";
import { resolveSandboxedPath, SecurityPathError } from "./safe-path";

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** SHA-256 十六进制格式：64 位小写十六进制字符 */
const SHA256_HEX_REGEX = /^[a-f0-9]{64}$/;

/** 支持的 manifest 版本白名单 */
const SUPPORTED_MANIFEST_VERSIONS = Object.freeze(["1.0.0"] as const);
/** 支持的 pack 版本白名单 */
const SUPPORTED_PACK_VERSIONS = Object.freeze(["1.0.0"] as const);

/**
 * 根对象允许的字段集合（严格闭包 Schema）。
 * - 必填：manifestVersion, packVersion, sceneId, generatedAt, scenePackDigest, rootHash, fileCount, files
 * - 可选：evidenceDigest（若存在必须为 64 位小写十六进制）
 */
const ALLOWED_ROOT_FIELDS = Object.freeze(new Set([
  "manifestVersion", "packVersion", "sceneId", "generatedAt",
  "scenePackDigest", "rootHash", "fileCount", "files",
  "evidenceDigest",
]));

/** entry 对象允许的字段集合 */
const ALLOWED_ENTRY_FIELDS = Object.freeze(new Set([
  "path", "sha256", "byteSize", "mimeType", "truthClass",
]));

/**
 * 规范化相对路径：去除 ./ 前缀、连续斜杠、末尾斜杠，统一分隔符为 /。
 * 用于 Canonical Path Deduplication，确保 assets/scene.webp 与 ./assets//scene.webp 被识别为同一文件。
 */
function canonicalizeRelativePath(p: string): string {
  let result = p.replace(/\\/g, "/");
  // 去除前导 ./
  while (result.startsWith("./")) {
    result = result.slice(2);
  }
  // 合并连续斜杠
  result = result.replace(/\/+/g, "/");
  // 去除末尾斜杠
  result = result.replace(/\/+$/, "");
  return result;
}

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
  /** 错误信息（如 manifest.json 无法读取/解析、schema 校验失败、symlink 检测） */
  errors: string[];
  /** 检测到的符号链接文件 */
  symlinkFiles: string[];
}

// ---------------------------------------------------------------------------
// Manifest Schema 强校验（Phase 4-D.1）
// ---------------------------------------------------------------------------

/**
 * Manifest schema 校验错误。
 */
export class ManifestSchemaError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(`[MANIFEST_SCHEMA_ERROR] ${code}: ${message}`);
    this.name = "ManifestSchemaError";
    this.code = code;
  }
}

/**
 * 对解析后的 manifest 对象进行零宽容严格 schema 校验（Phase 4-D.2）。
 *
 * 原则：外部输入非法即刻拒绝，严禁静默填充默认值。
 *
 * 必填字段（缺失即拒绝）：
 * - manifestVersion（版本白名单：1.0.0）
 * - packVersion（版本白名单：1.0.0）
 * - sceneId（非空字符串）
 * - generatedAt（非空字符串）
 * - scenePackDigest（64 位小写十六进制）
 * - rootHash（64 位小写十六进制）
 * - fileCount（与 files.length 一致）
 * - files（数组，每个 entry 含 path/sha256/byteSize）
 *
 * 可选字段：mimeType, truthClass（元数据，不影响安全判定）
 *
 * @throws ManifestSchemaError 当任何校验项失败时
 */
export function validateManifestSchema(raw: unknown): PackDirectoryManifest {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ManifestSchemaError("Root must be a non-null object", "MANIFEST_MALFORMED");
  }

  const doc = raw as Record<string, unknown>;

  // ── 严格闭包 Schema：拒绝未声明的根字段（杜绝隐蔽信道注入）──
  const unknownRootFields = Object.keys(doc).filter((k) => !ALLOWED_ROOT_FIELDS.has(k));
  if (unknownRootFields.length > 0) {
    throw new ManifestSchemaError(
      `Unknown root fields rejected (strict closed schema): ${unknownRootFields.join(", ")}`,
      "MANIFEST_UNKNOWN_FIELDS_REJECTED",
    );
  }

  // ── 必填字段缺失即刻拒绝（零宽容） ──
  const requiredFields = [
    "manifestVersion", "packVersion", "sceneId", "generatedAt",
    "scenePackDigest", "rootHash", "fileCount", "files",
  ] as const;
  for (const field of requiredFields) {
    const val = doc[field];
    if (val === undefined || val === null || val === "") {
      throw new ManifestSchemaError(
        `Mandatory field "${field}" is missing or empty`,
        "MANIFEST_FIELD_MISSING",
      );
    }
  }

  // ── 版本白名单精确锁定 ──
  if (!SUPPORTED_MANIFEST_VERSIONS.includes(doc["manifestVersion"] as "1.0.0")) {
    throw new ManifestSchemaError(
      `Unsupported manifestVersion: "${doc["manifestVersion"]}" (supported: ${SUPPORTED_MANIFEST_VERSIONS.join(", ")})`,
      "MANIFEST_UNSUPPORTED_VERSION",
    );
  }
  if (!SUPPORTED_PACK_VERSIONS.includes(doc["packVersion"] as "1.0.0")) {
    throw new ManifestSchemaError(
      `Unsupported packVersion: "${doc["packVersion"]}" (supported: ${SUPPORTED_PACK_VERSIONS.join(", ")})`,
      "MANIFEST_UNSUPPORTED_VERSION",
    );
  }

  // ── sceneId / generatedAt 类型校验 ──
  if (typeof doc["sceneId"] !== "string") {
    throw new ManifestSchemaError("sceneId must be a string", "MANIFEST_FIELD_TYPE_INVALID");
  }
  if (typeof doc["generatedAt"] !== "string") {
    throw new ManifestSchemaError("generatedAt must be a string", "MANIFEST_FIELD_TYPE_INVALID");
  }

  // ── 散列严格格式校验 ──
  if (typeof doc["scenePackDigest"] !== "string" || !SHA256_HEX_REGEX.test(doc["scenePackDigest"])) {
    throw new ManifestSchemaError(
      `scenePackDigest must be 64-character lowercase hex SHA-256, got: ${JSON.stringify(doc["scenePackDigest"])}`,
      "MANIFEST_INVALID_HASH",
    );
  }
  if (typeof doc["rootHash"] !== "string" || !SHA256_HEX_REGEX.test(doc["rootHash"])) {
    throw new ManifestSchemaError(
      `rootHash must be 64-character lowercase hex SHA-256, got: ${JSON.stringify(doc["rootHash"])}`,
      "MANIFEST_INVALID_ROOT_HASH",
    );
  }

  // ── 可选字段：evidenceDigest（若存在必须为 64 位小写十六进制）──
  if (doc["evidenceDigest"] !== undefined) {
    if (typeof doc["evidenceDigest"] !== "string" || !SHA256_HEX_REGEX.test(doc["evidenceDigest"])) {
      throw new ManifestSchemaError(
        `Optional field evidenceDigest must be 64-character lowercase hex SHA-256 if present, got: ${JSON.stringify(doc["evidenceDigest"])}`,
        "MANIFEST_INVALID_OPTIONAL_HASH",
      );
    }
  }

  // ── files 必须为数组 ──
  if (!Array.isArray(doc["files"])) {
    throw new ManifestSchemaError("files property must be an array", "MANIFEST_FILES_NOT_ARRAY");
  }

  // ── fileCount 强一致 ──
  if (typeof doc["fileCount"] !== "number" || doc["fileCount"] !== doc["files"].length) {
    throw new ManifestSchemaError(
      `fileCount (${doc["fileCount"]}) does not match files array length (${doc["files"].length})`,
      "MANIFEST_FILECOUNT_MISMATCH",
    );
  }

  // ── 逐 entry 严格校验 ──
  const pathSet = new Set<string>();
  const sanitizedFiles: ManifestFileEntry[] = [];

  for (let i = 0; i < doc["files"].length; i++) {
    const item = doc["files"][i];
    if (typeof item !== "object" || item === null) {
      throw new ManifestSchemaError(`Entry at index ${i} must be an object`, "MANIFEST_ENTRY_MALFORMED");
    }
    const entry = item as Record<string, unknown>;

    // 严格闭包 Schema：拒绝未声明的 entry 字段
    const unknownEntryFields = Object.keys(entry).filter((k) => !ALLOWED_ENTRY_FIELDS.has(k));
    if (unknownEntryFields.length > 0) {
      throw new ManifestSchemaError(
        `Unknown entry fields rejected (strict closed schema) at index ${i}: ${unknownEntryFields.join(", ")}`,
        "MANIFEST_ENTRY_UNKNOWN_FIELDS",
      );
    }

    // path 必填且非空
    const relPath = typeof entry["path"] === "string" ? entry["path"] : "";
    if (!relPath) {
      throw new ManifestSchemaError(`Entry at index ${i} has empty path`, "MANIFEST_ENTRY_EMPTY_PATH");
    }

    // path 安全校验：绝对路径、null 字节、盘符、UNC、.. 段
    if (relPath.includes("\0")) {
      throw new ManifestSchemaError(`Entry path contains null byte: "${relPath}"`, "MANIFEST_ENTRY_NULL_BYTE");
    }
    if (relPath.startsWith("/") || relPath.startsWith("\\") || path.isAbsolute(relPath)) {
      throw new ManifestSchemaError(
        `Entry path must be relative, got absolute: "${relPath}"`,
        "MANIFEST_ENTRY_ABSOLUTE_PATH",
      );
    }
    if (/^[a-zA-Z]:/.test(relPath) || relPath.startsWith("\\\\") || relPath.startsWith("//")) {
      throw new ManifestSchemaError(
        `Entry path contains drive or UNC prefix: "${relPath}"`,
        "MANIFEST_ENTRY_DRIVE_OR_UNC",
      );
    }

    // 先规范化路径（去除 ./ 前缀、连续斜杠、末尾斜杠），再做安全段检查与去重
    const canonicalPath = canonicalizeRelativePath(relPath);

    // 规范化后检查 .. 段（./ 前缀已被规范化移除，不应再触发）
    const canonicalSegments = canonicalPath.split("/");
    if (canonicalSegments.some((s) => s === ".." || s === ".")) {
      throw new ManifestSchemaError(
        `Entry path contains traversal token after canonicalization: "${canonicalPath}" (original: "${relPath}")`,
        "MANIFEST_ENTRY_TRAVERSAL_TOKEN",
      );
    }

    // 规范化路径去重（Canonical Path Deduplication）
    // 确保 assets/scene.webp 与 ./assets//scene.webp 等变体被识别为同一文件
    if (pathSet.has(canonicalPath)) {
      throw new ManifestSchemaError(
        `Duplicate path declared in manifest (canonical): "${canonicalPath}" (original: "${relPath}")`,
        "MANIFEST_DUPLICATE_PATH",
      );
    }
    pathSet.add(canonicalPath);

    // sha256 必填且格式合法
    const sha256 = typeof entry["sha256"] === "string" ? entry["sha256"] : "";
    if (!SHA256_HEX_REGEX.test(sha256)) {
      throw new ManifestSchemaError(
        `Invalid SHA-256 for "${relPath}": "${sha256}" (must be 64-char lowercase hex)`,
        "MANIFEST_ENTRY_INVALID_HASH",
      );
    }

    // byteSize 必填且为非负整数
    if (typeof entry["byteSize"] !== "number" || !Number.isSafeInteger(entry["byteSize"]) || entry["byteSize"] < 0) {
      throw new ManifestSchemaError(
        `Invalid byteSize for "${relPath}": ${JSON.stringify(entry["byteSize"])} (must be non-negative integer)`,
        "MANIFEST_ENTRY_INVALID_BYTESIZE",
      );
    }

    sanitizedFiles.push({
      path: canonicalPath,
      sha256,
      byteSize: entry["byteSize"],
      mimeType: typeof entry["mimeType"] === "string" ? entry["mimeType"] : "application/octet-stream",
      truthClass: typeof entry["truthClass"] === "string" ? entry["truthClass"] : undefined,
    });
  }

  // 构造经过严格校验的 manifest 对象（不填充任何默认值）
  const result: PackDirectoryManifest = {
    manifestVersion: doc["manifestVersion"] as "1.0.0",
    packVersion: doc["packVersion"] as "1.0.0",
    sceneId: doc["sceneId"] as string,
    generatedAt: doc["generatedAt"] as string,
    scenePackDigest: doc["scenePackDigest"] as string,
    rootHash: doc["rootHash"] as string,
    fileCount: doc["fileCount"] as number,
    files: sanitizedFiles,
  };
  if (typeof doc["evidenceDigest"] === "string") {
    (result as unknown as Record<string, unknown>).evidenceDigest = doc["evidenceDigest"];
  }
  return result;
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
 * Phase 4-D.1 加固：manifest schema 强校验 + symlink 拒绝 + 路径边界守卫。
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
    const symlinkFiles: string[] = [];
    const errors: string[] = [];

    // ── Step 1: 冷读取 manifest.json ──
    let manifestPath: string;
    try {
      manifestPath = resolveSandboxedPath(outputDir, "manifest.json");
    } catch (err) {
      return {
        valid: false,
        outputDir,
        manifest: null,
        mismatches: [],
        missingFiles: [],
        extraFiles: [],
        rootHashValid: false,
        errors: [`Path security violation for manifest.json: ${err instanceof Error ? err.message : String(err)}`],
        symlinkFiles: [],
      };
    }

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
        symlinkFiles: [],
      };
    }

    let manifest: PackDirectoryManifest;
    try {
      const raw = fs.readFileSync(manifestPath, "utf8");
      const parsed = JSON.parse(raw);
      // Phase 4-D.1: schema 强校验
      manifest = validateManifestSchema(parsed);
    } catch (error) {
      const isSchema = error instanceof ManifestSchemaError;
      return {
        valid: false,
        outputDir,
        manifest: null,
        mismatches: [],
        missingFiles: [],
        extraFiles: [],
        rootHashValid: false,
        errors: [
          isSchema
            ? `Manifest schema validation failed: ${error.message}`
            : `Failed to parse manifest.json: ${error instanceof Error ? error.message : String(error)}`,
        ],
        symlinkFiles: [],
      };
    }

    // ── Step 2: 逐个文件冷读取 + SHA-256 复核 + symlink 检测 ──
    for (const file of manifest.files) {
      let filePath: string;
      try {
        filePath = resolveSandboxedPath(outputDir, file.path);
      } catch (err) {
        errors.push(`Path security violation for "${file.path}": ${err instanceof Error ? err.message : String(err)}`);
        missingFiles.push(file.path);
        continue;
      }

      if (!fs.existsSync(filePath)) {
        missingFiles.push(file.path);
        continue;
      }

      // Phase 4-D.1: 符号链接检测——拒绝软链接资产
      const lstat = fs.lstatSync(filePath);
      if (lstat.isSymbolicLink()) {
        symlinkFiles.push(file.path);
        errors.push(`SECURITY_REJECTED: Symbolic link detected for asset "${file.path}"`);
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
      errors.length === 0 &&
      symlinkFiles.length === 0;

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
      symlinkFiles,
    };
  }

  /**
   * 验证指定文件的 SHA-256 是否与清单匹配。
   * 用于篡改检测的精准定位。
   * Phase 4-D.1: 增加 symlink 检测与路径边界守卫。
   */
  validateFile(
    outputDir: string,
    relativePath: string,
  ): { valid: boolean; expectedSha256?: string; actualSha256?: string; error?: string } {
    let manifestPath: string;
    try {
      manifestPath = resolveSandboxedPath(outputDir, "manifest.json");
    } catch (err) {
      return { valid: false, error: `Path security violation: ${err instanceof Error ? err.message : String(err)}` };
    }

    if (!fs.existsSync(manifestPath)) {
      return { valid: false, error: "manifest.json not found" };
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      const manifest = validateManifestSchema(parsed);
      const entry = manifest.files.find((f) => f.path === relativePath);
      if (!entry) {
        return { valid: false, error: `File "${relativePath}" not in manifest` };
      }

      const filePath = resolveSandboxedPath(outputDir, relativePath);

      // 使用 lstat 检测存在性（不跟随 symlink），确保悬空 symlink 也能被识别
      let fileStat: fs.Stats;
      try {
        fileStat = fs.lstatSync(filePath);
      } catch {
        return { valid: false, expectedSha256: entry.sha256, error: "File not found on disk" };
      }

      // symlink 检测
      if (fileStat.isSymbolicLink()) {
        return { valid: false, expectedSha256: entry.sha256, error: `SECURITY_REJECTED: Symbolic link detected for "${relativePath}"` };
      }

      const bytes = fs.readFileSync(filePath);
      const actualHash = sha256Bytes(bytes);
      return {
        valid: actualHash === entry.sha256,
        expectedSha256: entry.sha256,
        actualSha256: actualHash,
      };
    } catch (error) {
      const isSecurity = error instanceof SecurityPathError;
      const isSchema = error instanceof ManifestSchemaError;
      return {
        valid: false,
        error: isSecurity || isSchema
          ? error.message
          : `Validation error: ${error instanceof Error ? error.message : String(error)}`,
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
