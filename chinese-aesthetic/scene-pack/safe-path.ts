/**
 * Phase 4-D.2: Cross-Platform Physical Sandbox Path Guard
 *
 * Rejects cross-platform absolute paths, drive-qualified paths, UNC paths,
 * traversal tokens, null bytes, and existing symlinks in the path hierarchy.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export class SecurityPathError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(`[PATH_SECURITY_VIOLATION] ${code}: ${message}`);
    this.name = "SecurityPathError";
    this.code = code;
  }
}

function rejectCrossPlatformAbsolutePath(relativePath: string): void {
  if (relativePath.includes("\0")) {
    throw new SecurityPathError("Null byte detected", "NULL_BYTE_DETECTED");
  }

  // Reject drive-qualified paths, including C:foo (not only C:\\foo).
  if (/^[a-zA-Z]:/.test(relativePath)) {
    throw new SecurityPathError(
      `Drive-qualified path rejected: ${relativePath}`,
      "DRIVE_OR_UNC_DETECTED",
    );
  }

  // Check both slash conventions before host-platform path parsing.
  if (relativePath.startsWith("\\\\") || relativePath.startsWith("//")) {
    throw new SecurityPathError(
      `UNC path rejected: ${relativePath}`,
      "DRIVE_OR_UNC_DETECTED",
    );
  }

  const unified = relativePath.replace(/\\/g, "/");
  if (unified.startsWith("/")) {
    throw new SecurityPathError(
      `Absolute path rejected: ${relativePath}`,
      "ABSOLUTE_PATH",
    );
  }

  for (const segment of unified.split("/")) {
    if (segment === "." || segment === "..") {
      throw new SecurityPathError(
        `Traversal token rejected: ${segment}`,
        "PATH_TRAVERSAL_TOKEN",
      );
    }
  }
}

/**
 * Resolve a path inside a sandbox and audit the existing physical hierarchy.
 *
 * The returned path may contain not-yet-created leaf components. Every
 * existing component is checked with lstat/realpath so an ancestral symlink
 * cannot redirect access outside the physical sandbox root.
 */
export function resolveStrictSandboxedPath(
  rootDir: string,
  relativePath: string,
): string {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw new SecurityPathError("Empty or invalid relative path", "INVALID_PATH");
  }

  rejectCrossPlatformAbsolutePath(relativePath);

  const rootResolved = path.resolve(rootDir);
  const unified = relativePath.replace(/\\/g, "/");
  const segments = unified.split("/");
  const targetResolved = path.resolve(rootResolved, ...segments);

  if (
    targetResolved !== rootResolved &&
    !targetResolved.startsWith(rootResolved + path.sep)
  ) {
    throw new SecurityPathError(
      `Resolved path escaped sandbox boundary: ${targetResolved}`,
      "PATH_TRAVERSAL_DETECTED",
    );
  }

  if (!fs.existsSync(rootResolved)) {
    return targetResolved;
  }

  const realRoot = fs.realpathSync(rootResolved);
  let physicalCurrent = realRoot;

  for (const segment of segments) {
    physicalCurrent = path.join(physicalCurrent, segment);

    if (!fs.existsSync(physicalCurrent)) {
      continue;
    }

    const stat = fs.lstatSync(physicalCurrent);
    if (stat.isSymbolicLink()) {
      throw new SecurityPathError(
        `Symbolic link detected in path hierarchy: ${physicalCurrent}`,
        "ANCESTRAL_SYMLINK_DETECTED",
      );
    }

    const realCurrent = fs.realpathSync(physicalCurrent);
    if (
      realCurrent !== realRoot &&
      !realCurrent.startsWith(realRoot + path.sep)
    ) {
      throw new SecurityPathError(
        `Realpath escaped sandbox boundary: ${realCurrent}`,
        "REALPATH_ESCAPE_DETECTED",
      );
    }
  }

  return targetResolved;
}

/**
 * Backward-compatible alias. New code should use resolveStrictSandboxedPath.
 */
export function resolveSandboxedPath(
  rootDir: string,
  relativePath: string,
): string {
  return resolveStrictSandboxedPath(rootDir, relativePath);
}

export function isSafeRelativePath(relativePath: string): boolean {
  try {
    resolveStrictSandboxedPath("/tmp/__sandbox_probe__", relativePath);
    return true;
  } catch {
    return false;
  }
}
