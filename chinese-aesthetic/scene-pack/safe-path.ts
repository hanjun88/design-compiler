/**
 * Phase 4-D.1 / 4-D.2: Safe Path Boundary Guard
 *
 * 严格限制所有输入/输出路径解析在指定沙箱根目录内，
 * 阻断 `..` 路径穿越、绝对路径注入、null 字节注入、
 * Windows 盘符/UNC 路径、混合分隔符及祖先目录符号链接穿透。
 *
 * 威胁模型：
 *   Manifest 或 IR 中声明的文件名若包含 `../`、绝对路径、软链接或 UNC，
 *   可绕过 `assets/` 目录写穿工作区甚至宿主机关键系统目录。
 *
 * Phase 4-D.2 加固：
 * - 跨平台分隔符统一（\ → /），逐段拒绝 . / ..
 * - Windows 盘符（C:foo, C:\, C:/）与 UNC（\\server\share, //server/share）拦截
 * - 祖先目录符号链接物理检测（逐段 lstat + realpath 边界复核）
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// 安全路径错误
// ---------------------------------------------------------------------------

export class SecurityPathError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(`[PATH_SECURITY_VIOLATION] ${code}: ${message}`);
    this.name = "SecurityPathError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// 严格沙箱路径解析（Phase 4-D.2）
// ---------------------------------------------------------------------------

/**
 * 跨平台物理沙箱路径校验。
 *
 * 执行层级：
 * 1. 词法拦截：null 字节、Windows 盘符、UNC 路径、绝对路径
 * 2. 分隔符统一：\ → /，逐段拒绝 . / ..
 * 3. 词法边界：path.resolve 后必须以 rootDir 为前缀
 * 4. 物理边界：逐段 lstat 检测祖先符号链接，realpath 复核真实路径
 *
 * @param rootDir 沙箱根目录
 * @param relativePath 相对路径（不可含 .. / . / 绝对路径 / 盘符 / UNC）
 * @returns 解析后的词法绝对路径（在 rootDir 命名空间内）
 * @throws SecurityPathError 任一层级校验失败时
 */
export function resolveStrictSandboxedPath(rootDir: string, relativePath: string): string {
  if (!relativePath || typeof relativePath !== "string") {
    throw new SecurityPathError("Empty or invalid relative path", "INVALID_PATH");
  }

  // ── 1. Null 字节注入 ──
  if (relativePath.includes("\0")) {
    throw new SecurityPathError(
      `Null byte detected in path: ${relativePath}`,
      "NULL_BYTE_DETECTED",
    );
  }

  // ── 2. Windows 盘符与 UNC 路径拦截 ──
  // 覆盖 C:foo, C:\, C:/, \\server\share, //server/share
  if (/^[a-zA-Z]:/.test(relativePath)) {
    throw new SecurityPathError(
      `Windows drive-qualified path rejected: ${relativePath}`,
      "DRIVE_OR_UNC_DETECTED",
    );
  }
  if (relativePath.startsWith("\\\\") || relativePath.startsWith("//")) {
    throw new SecurityPathError(
      `UNC path rejected: ${relativePath}`,
      "DRIVE_OR_UNC_DETECTED",
    );
  }

  // ── 3. 分隔符统一并逐段校验 ──
  const unified = relativePath.replace(/\\/g, "/");
  if (unified.startsWith("/")) {
    throw new SecurityPathError(
      `Path must be relative (leading slash): ${relativePath}`,
      "ABSOLUTE_PATH",
    );
  }

  const segments = unified.split("/");
  for (const seg of segments) {
    if (seg === ".." || seg === ".") {
      throw new SecurityPathError(
        `Relative traversal token "${seg}" detected in: ${relativePath}`,
        "PATH_TRAVERSAL_TOKEN",
      );
    }
  }

  // ── 4. 词法边界校验 ──
  const rootResolved = path.resolve(rootDir);
  // 过滤空段（如连续斜杠产生的空字符串）
  const cleanSegments = segments.filter((s) => s.length > 0);
  const targetResolved = cleanSegments.length > 0
    ? path.resolve(rootResolved, path.join(...cleanSegments))
    : rootResolved;

  if (targetResolved !== rootResolved && !targetResolved.startsWith(rootResolved + path.sep)) {
    throw new SecurityPathError(
      `Resolved path escaped sandbox boundary: ${targetResolved} not in ${rootResolved}`,
      "PATH_TRAVERSAL_DETECTED",
    );
  }

  // ── 5. 物理祖先符号链接检测（仅对已存在的路径组件） ──
  // 若 rootDir 不存在，无法进行物理检测，仅依赖词法边界。
  if (fs.existsSync(rootResolved)) {
    const realRoot = fs.realpathSync(rootResolved);
    let current = realRoot;

    for (const seg of cleanSegments) {
      current = path.join(current, seg);
      if (fs.existsSync(current)) {
        // lstat 不跟随符号链接，可检测当前级是否为 symlink
        const stat = fs.lstatSync(current);
        if (stat.isSymbolicLink()) {
          throw new SecurityPathError(
            `Symbolic link detected in path hierarchy: ${current}`,
            "ANCESTRAL_SYMLINK_DETECTED",
          );
        }
        // realpath 复核：即使不是 symlink，也确认真实物理路径在沙箱内
        const realCurrent = fs.realpathSync(current);
        if (realCurrent !== realRoot && !realCurrent.startsWith(realRoot + path.sep)) {
          throw new SecurityPathError(
            `Realpath boundary escaped (likely symlink): ${realCurrent} not in ${realRoot}`,
            "REALPATH_ESCAPE_DETECTED",
          );
        }
      }
      // 若当前级不存在，后续级也必然不存在，停止物理检测
      else {
        break;
      }
    }
  }

  return targetResolved;
}

// ---------------------------------------------------------------------------
// 兼容别名（Phase 4-D.1 API，内部委托给严格版本）
// ---------------------------------------------------------------------------

/**
 * 兼容别名：委托给 resolveStrictSandboxedPath。
 * Phase 4-D.1 的调用方自动获得 4-D.2 的全部加固。
 */
export function resolveSandboxedPath(rootDir: string, relativePath: string): string {
  return resolveStrictSandboxedPath(rootDir, relativePath);
}

/**
 * 校验相对路径是否安全（不解析，仅做格式检查）。
 * 用于在写入前快速拒绝恶意路径。
 */
export function isSafeRelativePath(relativePath: string): boolean {
  try {
    resolveStrictSandboxedPath("/tmp/__sandbox_probe__", relativePath);
    return true;
  } catch {
    return false;
  }
}
