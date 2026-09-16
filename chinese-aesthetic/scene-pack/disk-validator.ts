/**
 * Phase 4-D.1: hardened Scene Pack Disk Validator.
 *
 * Validates manifest shape, relative paths, hashes, counts, file types,
 * and physical contents before exposing a pack to downstream consumers.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { sha256Bytes, sha256String } from "./asset-ledger";
import type { PackDirectoryManifest } from "./disk-emitter";

export interface HashMismatch {
  path: string;
  expectedSha256: string;
  actualSha256: string;
}

export interface DiskValidationResult {
  valid: boolean;
  outputDir: string;
  manifest: PackDirectoryManifest | null;
  mismatches: HashMismatch[];
  missingFiles: string[];
  extraFiles: string[];
  rootHashValid: boolean;
  expectedRootHash?: string;
  actualRootHash?: string;
  errors: string[];
}

const SHA256_RE = /^[a-f0-9]{64}$/;

function normalizeAndValidateRelativePath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (value.includes("\\") || path.posix.isAbsolute(value)) return null;
  const normalized = path.posix.normalize(value);
  if (normalized === "." || normalized.startsWith("../") || normalized.includes("/../") || normalized.includes("/./")) return null;
  if (normalized !== value || value.split("/").some((part) => part === "" || part === "." || part === "..")) return null;
  return normalized;
}

function resolveInside(root: string, relativePath: string): string | null {
  const rootResolved = path.resolve(root);
  const candidate = path.resolve(rootResolved, ...relativePath.split("/"));
  const prefix = rootResolved.endsWith(path.sep) ? rootResolved : `${rootResolved}${path.sep}`;
  return candidate === rootResolved || candidate.startsWith(prefix) ? candidate : null;
}

function collectFilesRecursive(dir: string, baseDir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const result: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      result.push(path.relative(baseDir, full).split(path.sep).join("/"));
    } else if (entry.isDirectory()) {
      result.push(...collectFilesRecursive(full, baseDir));
    } else {
      result.push(path.relative(baseDir, full).split(path.sep).join("/"));
    }
  }
  return result;
}

function invalidManifest(manifest: unknown): string[] {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return ["Manifest must be an object"];
  const value = manifest as Record<string, unknown>;
  const errors: string[] = [];
  if (value.manifestVersion !== "1.0.0") errors.push("Unsupported manifestVersion");
  if (value.packVersion !== "1.0.0") errors.push("Unsupported packVersion");
  if (typeof value.sceneId !== "string" || value.sceneId.length === 0) errors.push("Invalid sceneId");
  if (typeof value.generatedAt !== "string") errors.push("Invalid generatedAt");
  if (typeof value.rootHash !== "string" || !SHA256_RE.test(value.rootHash)) errors.push("Invalid rootHash");
  if (!Number.isSafeInteger(value.fileCount) || (value.fileCount as number) < 0) errors.push("Invalid fileCount");
  if (!Array.isArray(value.files)) return [...errors, "files must be an array"];
  if (value.fileCount !== value.files.length) errors.push("fileCount does not match files.length");
  const seen = new Set<string>();
  for (const [index, item] of value.files.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) { errors.push(`Invalid file entry at index ${index}`); continue; }
    const file = item as Record<string, unknown>;
    const relative = normalizeAndValidateRelativePath(file.path);
    if (!relative) errors.push(`Invalid relative path at index ${index}`);
    else if (seen.has(relative)) errors.push(`Duplicate manifest path: ${relative}`);
    else seen.add(relative);
    if (typeof file.sha256 !== "string" || !SHA256_RE.test(file.sha256)) errors.push(`Invalid sha256 at index ${index}`);
    if (!Number.isSafeInteger(file.byteSize) || (file.byteSize as number) < 0) errors.push(`Invalid byteSize at index ${index}`);
    if (typeof file.mimeType !== "string" || file.mimeType.length === 0) errors.push(`Invalid mimeType at index ${index}`);
  }
  return errors;
}

export class DiskValidator {
  validate(outputDir: string): DiskValidationResult {
    const mismatches: HashMismatch[] = [];
    const missingFiles: string[] = [];
    const errors: string[] = [];
    const manifestPath = path.join(outputDir, "manifest.json");
    if (!fs.existsSync(manifestPath)) return { valid: false, outputDir, manifest: null, mismatches, missingFiles, extraFiles: [], rootHashValid: false, errors: [`manifest.json not found at ${manifestPath}`] };

    let manifest: PackDirectoryManifest;
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as PackDirectoryManifest; }
    catch (error) { return { valid: false, outputDir, manifest: null, mismatches, missingFiles, extraFiles: [], rootHashValid: false, errors: [`Failed to parse manifest.json: ${error instanceof Error ? error.message : String(error)}`] }; }

    errors.push(...invalidManifest(manifest));
    if (errors.length > 0) return { valid: false, outputDir, manifest, mismatches, missingFiles, extraFiles: [], rootHashValid: false, expectedRootHash: manifest.rootHash, errors };

    for (const file of manifest.files) {
      const safePath = resolveInside(outputDir, file.path);
      if (!safePath || file.path === "manifest.json") { errors.push(`Unsafe manifest path: ${file.path}`); continue; }
      let stat: fs.Stats;
      try { stat = fs.lstatSync(safePath); }
      catch { missingFiles.push(file.path); continue; }
      if (!stat.isFile() || stat.isSymbolicLink()) { errors.push(`Manifest path is not a regular file: ${file.path}`); continue; }
      const bytes = fs.readFileSync(safePath);
      const actualHash = sha256Bytes(bytes);
      if (actualHash !== file.sha256 || bytes.length !== file.byteSize) mismatches.push({ path: file.path, expectedSha256: file.sha256, actualSha256: actualHash });
    }

    const diskFiles = collectFilesRecursive(outputDir, outputDir);
    const manifestPaths = new Set(manifest.files.map((file) => file.path));
    manifestPaths.add("manifest.json");
    const extraFiles = diskFiles.filter((file) => !manifestPaths.has(file));
    const sortedFiles = [...manifest.files].sort((a, b) => a.path.localeCompare(b.path));
    const actualRootHash = sha256String(sortedFiles.map((file) => file.sha256).join(""));
    const rootHashValid = actualRootHash === manifest.rootHash;
    const valid = mismatches.length === 0 && missingFiles.length === 0 && extraFiles.length === 0 && rootHashValid && errors.length === 0;
    return { valid, outputDir, manifest, mismatches, missingFiles, extraFiles, rootHashValid, expectedRootHash: manifest.rootHash, actualRootHash, errors };
  }

  validateFile(outputDir: string, relativePath: string): { valid: boolean; expectedSha256?: string; actualSha256?: string; error?: string } {
    const safeRelative = normalizeAndValidateRelativePath(relativePath);
    if (!safeRelative) return { valid: false, error: "Invalid relative path" };
    const result = this.validate(outputDir);
    if (!result.manifest || result.errors.length > 0) return { valid: false, error: result.errors.join("; ") || "Invalid manifest" };
    const entry = result.manifest.files.find((file) => file.path === safeRelative);
    if (!entry) return { valid: false, error: `File "${safeRelative}" not in manifest` };
    const safePath = resolveInside(outputDir, safeRelative);
    if (!safePath || !fs.existsSync(safePath)) return { valid: false, expectedSha256: entry.sha256, error: "File not found on disk" };
    const actualSha256 = sha256Bytes(fs.readFileSync(safePath));
    return { valid: actualSha256 === entry.sha256, expectedSha256: entry.sha256, actualSha256 };
  }
}

export function validateScenePackOnDisk(outputDir: string): DiskValidationResult {
  return new DiskValidator().validate(outputDir);
}
