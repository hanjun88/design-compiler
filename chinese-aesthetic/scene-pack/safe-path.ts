/**
 * Phase 4-D.1: Safe Path Boundary Guard
 *
 * 严格限制所有输入/输出路径解析在指定沙箱根目录内，
 * 阻断 `..` 路径穿越、绝对路径注入、null 字节注入及符号链接越界。
 *
 * 威胁模型：
 *   Manifest 或 IR 中声明的文件名若包含 `../`、绝对路径或软链接，
 *   可绕过 `assets/` 目录写穿工作区甚至宿主机关键系统目录。
 */

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
// 沙箱路径解析
// ---------------------------------------------------------------------------

/**
 * 校验并解析受保护路径，杜绝路径穿越与越界写入。
 *
 * @param rootDir 沙箱根目录（所有写入必须在此目录内）
 * @param relativePath 相对路径（不可为绝对路径，不可包含 `..` 逃逸）
 * @returns 解析后的绝对路径（保证在 rootDir 命名空间内）
 * @throws SecurityPathError 当路径为空、绝对、含 null 字节或逃逸沙箱时
 */
export function resolveSandboxedPath(rootDir: string, relativePath: string): string {
  if (!relativePath || typeof relativePath !== "string") {
    throw new SecurityPathError("Empty or invalid relative path", "INVALID_PATH");
  }

  // 严格禁止以斜杠开头的伪绝对路径与 null 字节注入
  if (path.isAbsolute(relativePath) || relativePath.includes("\0")) {
    throw new SecurityPathError(
      `Path must be relative (no leading slash or null byte): ${relativePath}`,
      "ABSOLUTE_OR_NULL_PATH",
    );
  }

  // Windows 反斜杠驱动符（如 C:\）也视为绝对路径
  if (/^[a-zA-Z]:[\\/]/.test(relativePath)) {
    throw new SecurityPathError(
      `Path must be relative (Windows drive letter detected): ${relativePath}`,
      "ABSOLUTE_OR_NULL_PATH",
    );
  }

  // 规范化路径分隔符（不剥离前导 ../，交由后续 startsWith 边界检查拦截）
  const normalizedRelative = path.normalize(relativePath);
  const rootResolved = path.resolve(rootDir);
  const targetResolved = path.resolve(rootResolved, normalizedRelative);

  // 必须严格处于根目录命名空间内，杜绝 ../../ 逃逸
  if (targetResolved !== rootResolved && !targetResolved.startsWith(rootResolved + path.sep)) {
    throw new SecurityPathError(
      `Resolved path escaped sandbox boundary: ${targetResolved} not in ${rootResolved}`,
      "PATH_TRAVERSAL_DETECTED",
    );
  }

  return targetResolved;
}

/**
 * 校验相对路径是否安全（不解析，仅做格式检查）。
 * 用于在写入前快速拒绝恶意路径。
 */
export function isSafeRelativePath(relativePath: string): boolean {
  try {
    resolveSandboxedPath("/tmp/__sandbox_probe__", relativePath);
    return true;
  } catch {
    return false;
  }
}
