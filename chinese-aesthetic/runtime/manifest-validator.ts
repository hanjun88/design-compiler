/**
 * manifest-validator.ts — Zero-`as` Strict Runtime Manifest Builder
 *
 * Phase 5 Step 5.1. Provides the ONLY safe entry point for converting raw
 * untrusted manifest data into an immutable, deeply-frozen StrictRuntimeManifest.
 *
 * Key invariants:
 * - Zero `as` type assertions. All narrowing via local variables + literal comparison.
 * - auditPlainDataObject does SHALLOW descriptor audit only; its output must
 *   NEVER flow directly to downstream code. buildStrictRuntimeManifest owns
 *   deep validation, cloning, and freezing.
 * - TOCTOU immunity: all values are copied into frozen snapshots; caller's
 *   raw object can mutate after validation without affecting the result.
 */

import { SHA256_HEX_REGEX } from "./crypto-canonical";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ManifestMimeType =
  | "image/webp"
  | "image/png"
  | "application/json"
  | "application/octet-stream";

export type ManifestTruthClass = "SOURCE" | "DERIVED" | "GENERATED";

export type ManifestAvailability = "AVAILABLE" | "BLOCKED";

export interface StrictRuntimeManifestEntry {
  readonly path: string;
  readonly sha256: string;
  readonly byteSize: number;
  readonly mimeType: ManifestMimeType;
  readonly truthClass: ManifestTruthClass;
  readonly availability: ManifestAvailability;
  readonly blockedReason?: string;
}

export interface StrictRuntimeManifest {
  readonly manifestVersion: "1.0.0";
  readonly packVersion: "1.0.0";
  readonly sceneId: string;
  readonly scenePackDigest: string;
  readonly rootHash: string;
  readonly fileCount: number;
  readonly files: readonly StrictRuntimeManifestEntry[];
}

// ---------------------------------------------------------------------------
// Type Guards (zero as)
// ---------------------------------------------------------------------------

export function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Field Parsers (explicit literal comparison, zero as)
// ---------------------------------------------------------------------------

function parseMimeType(val: unknown, entryPath: string): ManifestMimeType {
  if (
    val === "image/webp" ||
    val === "image/png" ||
    val === "application/json" ||
    val === "application/octet-stream"
  ) {
    return val;
  }
  throw new Error(`MANIFEST_ENTRY_INVALID_MIME: Unsupported mimeType in "${entryPath}"`);
}

function parseTruthClass(val: unknown, entryPath: string): ManifestTruthClass {
  if (val === "SOURCE" || val === "DERIVED" || val === "GENERATED") {
    return val;
  }
  throw new Error(`MANIFEST_ENTRY_INVALID_TRUTH_CLASS: Unsupported truthClass in "${entryPath}"`);
}

function parseAvailability(val: unknown, entryPath: string): ManifestAvailability {
  if (val === "AVAILABLE" || val === "BLOCKED") {
    return val;
  }
  throw new Error(`MANIFEST_ENTRY_INVALID_AVAILABILITY: Unsupported availability in "${entryPath}"`);
}

// ---------------------------------------------------------------------------
// Shallow Plain Data Object Auditor
// ---------------------------------------------------------------------------

/**
 * Audit a plain data object's own properties and return a shallow snapshot
 * stored in Object.create(null).
 *
 * Error priority (strict):
 * 1. NOT_PLAIN_OBJECT  2. POLLUTED_PROTOTYPE  3. SYMBOL_KEY_FORBIDDEN
 * 4. UNKNOWN_FIELD     5. MISSING_DESCRIPTOR  6. ACCESSOR_FORBIDDEN
 * 7. NON_ENUMERABLE_FORBIDDEN  8. MISSING_FIELD
 *
 * CONTRACT: The returned snapshot MUST NOT flow directly to downstream code.
 * Only buildStrictRuntimeManifest may consume it after deep validation.
 */
export function auditPlainDataObject(
  value: unknown,
  label: string,
  mandatoryKeys: readonly string[],
  allowedKeys: ReadonlySet<string>,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label}_NOT_PLAIN_OBJECT: Expected non-null plain object`);
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    throw new Error(`${label}_POLLUTED_PROTOTYPE: Prototype must be Object.prototype or null`);
  }
  const ownKeys = Reflect.ownKeys(value);
  const foundKeys = new Set<string>();
  const snapshot: Record<string, unknown> = Object.create(null);

  for (const k of ownKeys) {
    if (typeof k === "symbol") {
      throw new Error(`${label}_SYMBOL_KEY_FORBIDDEN: Symbol keys are forbidden`);
    }
    if (!allowedKeys.has(k)) {
      throw new Error(`${label}_UNKNOWN_FIELD: Unknown field "${k}"`);
    }
    const desc = Object.getOwnPropertyDescriptor(value, k);
    if (!desc) {
      throw new Error(`${label}_MISSING_DESCRIPTOR: Descriptor missing for "${k}"`);
    }
    if (!("value" in desc)) {
      throw new Error(`${label}_ACCESSOR_FORBIDDEN: Accessor property forbidden on "${k}"`);
    }
    if (desc.enumerable !== true) {
      throw new Error(`${label}_NON_ENUMERABLE_FORBIDDEN: Non-enumerable property forbidden on "${k}"`);
    }
    snapshot[k] = desc.value;
    foundKeys.add(k);
  }

  for (const mk of mandatoryKeys) {
    if (!foundKeys.has(mk)) {
      throw new Error(`${label}_MISSING_FIELD: Mandatory field "${mk}" is missing`);
    }
  }
  return snapshot;
}

// ---------------------------------------------------------------------------
// Strict Runtime Manifest Builder (唯一准入主路径)
// ---------------------------------------------------------------------------

const ENTRY_PATH_REGEX = /^[a-zA-Z0-9_\-]+(\/[a-zA-Z0-9_\-]+)*\.[a-zA-Z0-9]+$/;

/**
 * Validate and construct an immutable, deeply-frozen manifest snapshot.
 * This is the ONLY safe entry point. assertStrictRuntimeManifest delegates here.
 */
export function buildStrictRuntimeManifest(raw: unknown): StrictRuntimeManifest {
  // 1. Root object shallow audit
  const mandatoryRootKeys = [
    "manifestVersion",
    "packVersion",
    "sceneId",
    "scenePackDigest",
    "rootHash",
    "fileCount",
    "files",
  ] as const;
  const allowedRootKeys = new Set<string>(mandatoryRootKeys);
  const rootSnapshot = auditPlainDataObject(raw, "MANIFEST_ROOT", mandatoryRootKeys, allowedRootKeys);

  // 2. Root field type & format validation (local variable narrowing, zero as)
  const manifestVersion = rootSnapshot["manifestVersion"];
  if (manifestVersion !== "1.0.0") {
    throw new Error('MANIFEST_VERSION_INVALID: manifestVersion must be "1.0.0"');
  }
  const packVersion = rootSnapshot["packVersion"];
  if (packVersion !== "1.0.0") {
    throw new Error('MANIFEST_VERSION_INVALID: packVersion must be "1.0.0"');
  }
  const sceneId = rootSnapshot["sceneId"];
  if (typeof sceneId !== "string" || sceneId.trim() === "") {
    throw new Error("MANIFEST_SCENE_ID_INVALID: sceneId must be a non-empty string");
  }
  const rootHash = rootSnapshot["rootHash"];
  if (typeof rootHash !== "string" || !SHA256_HEX_REGEX.test(rootHash)) {
    throw new Error("MANIFEST_ROOT_HASH_INVALID: rootHash must be 64-char lowercase hex SHA-256");
  }
  const scenePackDigest = rootSnapshot["scenePackDigest"];
  if (typeof scenePackDigest !== "string" || !SHA256_HEX_REGEX.test(scenePackDigest)) {
    throw new Error("MANIFEST_PACK_DIGEST_INVALID: scenePackDigest must be 64-char lowercase hex SHA-256");
  }
  const fileCount = rootSnapshot["fileCount"];
  if (typeof fileCount !== "number" || !Number.isSafeInteger(fileCount) || fileCount < 0) {
    throw new Error("MANIFEST_FILE_COUNT_INVALID: fileCount must be a non-negative safe integer");
  }
  const rawFiles = rootSnapshot["files"];
  if (!isUnknownArray(rawFiles)) {
    throw new Error("MANIFEST_FILES_NOT_ARRAY: files must be a valid array");
  }

  // 3. Files array structural audit
  const filesProto = Object.getPrototypeOf(rawFiles);
  if (filesProto !== Array.prototype && filesProto !== null) {
    throw new Error("MANIFEST_FILES_ILLEGAL_PROTOTYPE: Custom array prototype rejected");
  }
  const filesLengthDesc = Object.getOwnPropertyDescriptor(rawFiles, "length");
  if (!filesLengthDesc || !("value" in filesLengthDesc)) {
    throw new Error("MANIFEST_FILES_LENGTH_DESCRIPTOR_INVALID");
  }
  if (filesLengthDesc.enumerable !== false) {
    throw new Error("MANIFEST_FILES_LENGTH_NON_ENUMERABLE_REQUIRED");
  }
  if (
    typeof filesLengthDesc.value !== "number" ||
    !Number.isSafeInteger(filesLengthDesc.value) ||
    filesLengthDesc.value < 0
  ) {
    throw new Error("MANIFEST_FILES_LENGTH_INVALID");
  }
  const filesKeys = Reflect.ownKeys(rawFiles);
  for (const fk of filesKeys) {
    if (typeof fk === "symbol") {
      throw new Error("MANIFEST_FILES_SYMBOL_KEY_FORBIDDEN");
    }
    if (fk !== "length") {
      const idx = Number(fk);
      if (!Number.isSafeInteger(idx) || idx < 0 || String(idx) !== fk || idx >= rawFiles.length) {
        throw new Error(`MANIFEST_FILES_ILLEGAL_PROPERTY: Non-index property "${String(fk)}" forbidden`);
      }
    }
  }
  if (rawFiles.length !== fileCount) {
    throw new Error(`MANIFEST_FILE_COUNT_MISMATCH: Declared ${fileCount}, actual ${rawFiles.length}`);
  }

  // 4. Entry-level audit, mutual exclusion, frozen snapshot construction
  const mandatoryEntryKeys = [
    "path",
    "sha256",
    "byteSize",
    "mimeType",
    "truthClass",
    "availability",
  ] as const;
  const allowedEntryKeys = new Set<string>([...mandatoryEntryKeys, "blockedReason"]);
  const pathSet = new Set<string>();
  const clonedEntries: StrictRuntimeManifestEntry[] = [];

  for (let i = 0; i < rawFiles.length; i++) {
    if (!Object.prototype.hasOwnProperty.call(rawFiles, String(i))) {
      throw new Error(`MANIFEST_FILES_SPARSE_ENTRY: Sparse entry at index ${i}`);
    }
    const itemDesc = Object.getOwnPropertyDescriptor(rawFiles, String(i));
    if (!itemDesc || !("value" in itemDesc)) {
      throw new Error(`MANIFEST_FILES_ACCESSOR_ENTRY: Accessor on entry index ${i}`);
    }
    if (itemDesc.enumerable !== true) {
      throw new Error(`MANIFEST_FILES_NON_ENUMERABLE_INDEX: Non-enumerable index "${i}" forbidden`);
    }
    const entrySnapshot = auditPlainDataObject(
      itemDesc.value,
      `MANIFEST_ENTRY[${i}]`,
      mandatoryEntryKeys,
      allowedEntryKeys,
    );

    // Path format & uniqueness
    const entryPath = entrySnapshot["path"];
    if (typeof entryPath !== "string" || !ENTRY_PATH_REGEX.test(entryPath)) {
      throw new Error(`MANIFEST_ENTRY_INVALID_PATH: Invalid path at index ${i}`);
    }
    if (pathSet.has(entryPath)) {
      throw new Error(`MANIFEST_DUPLICATE_PATH: Duplicate entry path "${entryPath}"`);
    }
    pathSet.add(entryPath);

    // Format validation
    const sha256 = entrySnapshot["sha256"];
    if (typeof sha256 !== "string" || !SHA256_HEX_REGEX.test(sha256)) {
      throw new Error(`MANIFEST_ENTRY_INVALID_HASH: Invalid sha256 in "${entryPath}"`);
    }
    const byteSize = entrySnapshot["byteSize"];
    if (typeof byteSize !== "number" || !Number.isSafeInteger(byteSize) || byteSize < 0) {
      throw new Error(`MANIFEST_ENTRY_INVALID_BYTESIZE: Invalid byteSize in "${entryPath}"`);
    }
    const mimeType = parseMimeType(entrySnapshot["mimeType"], entryPath);
    const truthClass = parseTruthClass(entrySnapshot["truthClass"], entryPath);
    const availability = parseAvailability(entrySnapshot["availability"], entryPath);

    // Mutual exclusion: BLOCKED requires blockedReason; AVAILABLE forbids it
    let validBlockedReason: string | undefined = undefined;
    if (availability === "BLOCKED") {
      const reason = entrySnapshot["blockedReason"];
      if (typeof reason !== "string" || reason.trim() === "") {
        throw new Error(`MANIFEST_BLOCKED_REASON_REQUIRED: "${entryPath}" is BLOCKED but blockedReason is missing`);
      }
      validBlockedReason = reason;
    } else {
      if ("blockedReason" in entrySnapshot) {
        throw new Error(`MANIFEST_AVAILABLE_REASON_FORBIDDEN: "${entryPath}" is AVAILABLE but contains blockedReason`);
      }
    }

    // Deep-frozen entry snapshot
    const frozenEntry: StrictRuntimeManifestEntry = Object.freeze({
      path: entryPath,
      sha256,
      byteSize,
      mimeType,
      truthClass,
      availability,
      ...(validBlockedReason !== undefined ? { blockedReason: validBlockedReason } : {}),
    });
    clonedEntries.push(frozenEntry);
  }

  // 5. Return top-level deeply-frozen snapshot
  return Object.freeze({
    manifestVersion,
    packVersion,
    sceneId,
    scenePackDigest,
    rootHash,
    fileCount,
    files: Object.freeze(clonedEntries),
  });
}

/**
 * Compatibility safe factory wrapper. Returns a frozen snapshot.
 * MUST NOT be used as `asserts raw is ...` type predicate — always consume return value.
 */
export function assertStrictRuntimeManifest(raw: unknown): StrictRuntimeManifest {
  return buildStrictRuntimeManifest(raw);
}
