/**
 * crypto-canonical.ts — Unicode Safety, RFC 8785 JCS, and Canonical Hashing
 *
 * Phase 5 Step 5.1 foundation module. Provides:
 * - Unicode well-formedness validation (reject lone surrogates before TextEncoder)
 * - UTF-8 byte-order string comparison
 * - RFC 8785 JSON Canonicalization Scheme (JCS) with pure-data enforcement
 * - Canonical file list hash (path:sha256 tokens, UTF-8 sorted, newline-joined)
 * - Scene pack digest with domain-isolated prefix
 */

// ---------------------------------------------------------------------------
// Unicode Security
// ---------------------------------------------------------------------------

export class UnicodeSecurityError extends Error {
  constructor(message: string, public readonly code: string = "INVALID_UNICODE_STRING") {
    super(`[UNICODE_SECURITY_VIOLATION] ${code}: ${message}`);
    this.name = "UnicodeSecurityError";
  }
}

/**
 * Strictly validate that a UTF-16 string contains no unpaired surrogates.
 * Throws UnicodeSecurityError on lone high/low surrogate or invalid pair.
 */
export function assertWellFormedUnicode(s: string): void {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      // High surrogate — must be followed by a low surrogate
      if (i + 1 >= s.length) {
        throw new UnicodeSecurityError(
          `Lone high surrogate at end: U+${c.toString(16)}`,
          "LONE_SURROGATE",
        );
      }
      const next = s.charCodeAt(i + 1);
      if (next < 0xdc00 || next > 0xdfff) {
        throw new UnicodeSecurityError(
          `High surrogate U+${c.toString(16)} not followed by low surrogate (got U+${next.toString(16)})`,
          "INVALID_SURROGATE_PAIR",
        );
      }
      i++; // skip the valid low surrogate
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      throw new UnicodeSecurityError(
        `Lone low surrogate encountered: U+${c.toString(16)}`,
        "LONE_SURROGATE",
      );
    }
  }
}

/**
 * Encode a string to UTF-8 bytes with Unicode well-formedness pre-validation.
 * TextEncoder would silently replace lone surrogates with U+FFFD; we reject first.
 */
export function encodeUtf8(str: string): Uint8Array {
  assertWellFormedUnicode(str);
  return new TextEncoder().encode(str);
}

/**
 * Compare two strings by UTF-8 byte order (not UTF-16 code unit order).
 * Contract: validate Unicode well-formedness of BOTH inputs before any fast-path.
 */
export function compareUtf8Bytes(a: string, b: string): number {
  assertWellFormedUnicode(a);
  assertWellFormedUnicode(b);
  if (a === b) return 0;
  const bufA = encodeUtf8(a);
  const bufB = encodeUtf8(b);
  const minLen = Math.min(bufA.length, bufB.length);
  for (let i = 0; i < minLen; i++) {
    if (bufA[i] !== bufB[i]) {
      return bufA[i] - bufB[i];
    }
  }
  return bufA.length - bufB.length;
}

// ---------------------------------------------------------------------------
// RFC 8785 JSON Canonicalization Scheme (JCS)
// ---------------------------------------------------------------------------

export class CanonicalizationError extends Error {
  constructor(message: string, public readonly code: string = "CANONICALIZATION_FAILED") {
    super(`[CANONICALIZE_ERROR] ${code}: ${message}`);
    this.name = "CanonicalizationError";
  }
}

/**
 * Strict RFC 8785 (JCS) canonicalizer with pure-data enforcement.
 *
 * Rules:
 * - Objects: prototype must be Object.prototype or null; no symbol keys;
 *   all own properties must be enumerable data properties (no accessors);
 *   keys sorted by UTF-16 code unit order (ECMAScript < / >).
 * - Arrays: prototype must be Array.prototype or null; length descriptor
 *   must exist, have value, be non-enumerable, value is non-negative safe integer
 *   (writable may be false to support frozen arrays); no non-index properties;
 *   no sparse holes; all indices enumerable data properties.
 * - Numbers: no NaN/Infinity/-Infinity; -0 → "0"; ECMA-262 ToString(Number).
 * - Strings: well-formed Unicode; escape ", \, control chars; slash NOT escaped.
 * - No functions, symbols, bigint, undefined.
 */
export function canonicalizeJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new CanonicalizationError(
        `Non-finite numbers forbidden in JCS: ${value}`,
        "NON_FINITE_NUMBER",
      );
    }
    // Negative zero canonicalizes to "0"
    if (Object.is(value, -0)) return "0";
    // ECMA-262 Section 7.1.12.1 ToString(Number) — deterministic
    return String(value);
  }

  if (typeof value === "string") {
    assertWellFormedUnicode(value);
    let out = '"';
    for (let i = 0; i < value.length; i++) {
      const c = value.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff) {
        // Valid surrogate pair — preserve both code units verbatim
        out += value.charAt(i) + value.charAt(i + 1);
        i++;
        continue;
      }
      if (c === 0x22) out += '\\"';
      else if (c === 0x5c) out += "\\\\";
      else if (c === 0x08) out += "\\b";
      else if (c === 0x09) out += "\\t";
      else if (c === 0x0a) out += "\\n";
      else if (c === 0x0c) out += "\\f";
      else if (c === 0x0d) out += "\\r";
      else if (c < 0x20) {
        out += "\\u" + c.toString(16).padStart(4, "0");
      } else {
        out += value.charAt(i);
      }
    }
    out += '"';
    return out;
  }

  if (Array.isArray(value)) {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Array.prototype && proto !== null) {
      throw new CanonicalizationError("Illegal array prototype", "ILLEGAL_PROTOTYPE");
    }
    // Array length descriptor audit (compatible with Object.freeze → writable:false)
    const lengthDesc = Object.getOwnPropertyDescriptor(value, "length");
    if (!lengthDesc || !("value" in lengthDesc)) {
      throw new CanonicalizationError("Array length descriptor invalid", "ARRAY_LENGTH_DESCRIPTOR_INVALID");
    }
    if (lengthDesc.enumerable !== false) {
      throw new CanonicalizationError("Array length must be non-enumerable", "ARRAY_LENGTH_NON_ENUMERABLE_REQUIRED");
    }
    if (
      typeof lengthDesc.value !== "number" ||
      !Number.isSafeInteger(lengthDesc.value) ||
      lengthDesc.value < 0
    ) {
      throw new CanonicalizationError("Array length must be a non-negative safe integer", "ARRAY_LENGTH_INVALID");
    }
    // Reject non-index own properties and symbol keys
    const ownKeys = Reflect.ownKeys(value);
    for (const k of ownKeys) {
      if (typeof k === "symbol") {
        throw new CanonicalizationError("Symbol keys forbidden on arrays in JCS", "SYMBOL_KEY_FORBIDDEN");
      }
      if (k !== "length") {
        const index = Number(k);
        if (
          !Number.isSafeInteger(index) ||
          index < 0 ||
          String(index) !== k ||
          index >= value.length
        ) {
          throw new CanonicalizationError(
            `Non-index or out-of-bounds property "${String(k)}" forbidden on array`,
            "ILLEGAL_ARRAY_PROPERTY",
          );
        }
      }
    }
    const items: string[] = [];
    for (let i = 0; i < value.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(value, String(i))) {
        throw new CanonicalizationError(`Sparse array detected at index ${i}`, "SPARSE_ARRAY_FORBIDDEN");
      }
      const desc = Object.getOwnPropertyDescriptor(value, String(i));
      if (!desc || !("value" in desc)) {
        throw new CanonicalizationError(`Accessor property forbidden on array index ${i}`, "ACCESSOR_PROPERTY_FORBIDDEN");
      }
      if (desc.enumerable !== true) {
        throw new CanonicalizationError(`Non-enumerable index "${i}" on array forbidden`, "NON_ENUMERABLE_PROPERTY_FORBIDDEN");
      }
      items.push(canonicalizeJson(desc.value));
    }
    return `[${items.join(",")}]`;
  }

  if (typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new CanonicalizationError(
        "Only plain objects or null-prototype objects allowed in JCS",
        "ILLEGAL_PROTOTYPE",
      );
    }
    const ownKeys = Reflect.ownKeys(value);
    const sortedStringKeys: string[] = [];
    for (const k of ownKeys) {
      if (typeof k === "symbol") {
        throw new CanonicalizationError("Symbol keys forbidden in JCS objects", "SYMBOL_KEY_FORBIDDEN");
      }
      const desc = Object.getOwnPropertyDescriptor(value, k);
      if (!desc) {
        throw new CanonicalizationError(`Descriptor missing for key "${String(k)}"`, "DESCRIPTOR_MISSING");
      }
      if (!("value" in desc)) {
        throw new CanonicalizationError(`Accessor property "${String(k)}" forbidden in JCS`, "ACCESSOR_PROPERTY_FORBIDDEN");
      }
      if (desc.enumerable !== true) {
        throw new CanonicalizationError(`Non-enumerable property "${String(k)}" forbidden in JCS`, "NON_ENUMERABLE_PROPERTY_FORBIDDEN");
      }
      sortedStringKeys.push(k);
    }
    // RFC 8785 Section 3.2.3: UTF-16 code unit lexicographic ascending
    sortedStringKeys.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const entries: string[] = [];
    for (const k of sortedStringKeys) {
      const desc = Object.getOwnPropertyDescriptor(value, k)!;
      entries.push(`${canonicalizeJson(k)}:${canonicalizeJson(desc.value)}`);
    }
    return `{${entries.join(",")}}`;
  }

  throw new CanonicalizationError(`Illegal type for JCS: ${typeof value}`, "ILLEGAL_DATA_TYPE");
}

// ---------------------------------------------------------------------------
// Cryptographic Abstraction & Canonical Hashing
// ---------------------------------------------------------------------------

export const SHA256_HEX_REGEX = /^[a-f0-9]{64}$/;

export interface Sha256Provider {
  /** Compute standard 64-char lowercase hex SHA-256 digest from raw bytes. */
  digestHex(bytes: Uint8Array): Promise<string>;
}

/**
 * Compute canonical file list hash.
 *
 * Token structure: `${path}:${sha256}`
 * Sort: by path UTF-8 byte order ascending (compareUtf8Bytes)
 * Join: "\n"
 *
 * Constraints:
 * 1. path must not contain "\n" or ":" (token delimiter ambiguity)
 * 2. sha256 must be 64-char lowercase hex
 * 3. output must pass 64-char lowercase hex self-check
 */
export async function computeCanonicalFileListHash(
  files: readonly { readonly path: string; readonly sha256: string }[],
  crypto: Sha256Provider,
): Promise<string> {
  for (const f of files) {
    assertWellFormedUnicode(f.path);
    if (f.path.includes("\n") || f.path.includes(":")) {
      throw new Error(
        `FILE_LIST_HASH_ILLEGAL_PATH: Path "${f.path}" contains illegal token delimiter (":" or "\\n")`,
      );
    }
    if (!SHA256_HEX_REGEX.test(f.sha256)) {
      throw new Error(`FILE_LIST_HASH_ILLEGAL_SHA256: Invalid hash in "${f.path}"`);
    }
  }
  const sortedTokens = [...files]
    .sort((a, b) => compareUtf8Bytes(a.path, b.path))
    .map((f) => `${f.path}:${f.sha256}`);
  const payload = sortedTokens.join("\n");
  const digest = await crypto.digestHex(encodeUtf8(payload));
  if (!SHA256_HEX_REGEX.test(digest)) {
    throw new Error(
      `FILE_LIST_HASH_OUTPUT_INVALID: Digest "${digest}" is not 64-character lowercase hex`,
    );
  }
  return digest;
}

// ---------------------------------------------------------------------------
// Scene Pack Digest (domain-isolated)
// ---------------------------------------------------------------------------

/**
 * Minimal manifest shape needed for digest computation.
 * Kept structurally minimal to avoid circular import with manifest-validator.
 */
export interface DigestManifest {
  readonly manifestVersion: string;
  readonly packVersion: string;
  readonly sceneId: string;
  readonly rootHash: string;
  readonly fileCount: number;
  readonly files: readonly { readonly path: string; readonly sha256: string }[];
}

/**
 * Compute scenePackDigest with domain-isolated prefix.
 *
 * Formula:
 *   PackDigestInput = "SCENE_PACK_v1:" + canonicalizeJson(M_withoutDigest) + "\n" + H_files
 *   scenePackDigest = SHA256(encodeUtf8(PackDigestInput))
 *
 * M_withoutDigest is an explicit whitelist copy (manifestVersion, packVersion,
 * sceneId, rootHash, fileCount, files) — never uses object spread.
 * files array order is preserved (Array Order Invariant); file content integrity
 * is carried separately by H_files (sorted).
 *
 * Precondition: canonicalFileListHash must equal manifest.rootHash.
 */
export async function computeScenePackDigest(
  manifest: DigestManifest,
  canonicalFileListHash: string,
  crypto: Sha256Provider,
): Promise<string> {
  if (manifest.rootHash !== canonicalFileListHash) {
    throw new Error(
      `DIGEST_INTEGRITY_MISMATCH: Manifest rootHash (${manifest.rootHash}) does not match H_files (${canonicalFileListHash})`,
    );
  }
  // Explicit whitelist construction — NEVER use object spread
  const manifestWithoutDigest: Record<string, unknown> = {
    manifestVersion: manifest.manifestVersion,
    packVersion: manifest.packVersion,
    sceneId: manifest.sceneId,
    rootHash: manifest.rootHash,
    fileCount: manifest.fileCount,
    files: manifest.files,
  };
  const canonicalManifest = canonicalizeJson(manifestWithoutDigest);
  const payloadString = `SCENE_PACK_v1:${canonicalManifest}\n${canonicalFileListHash}`;
  const payloadBytes = encodeUtf8(payloadString);
  const digest = await crypto.digestHex(payloadBytes);
  if (!SHA256_HEX_REGEX.test(digest)) {
    throw new Error(
      `PACK_DIGEST_OUTPUT_INVALID: Computed digest "${digest}" is not 64-character lowercase hex`,
    );
  }
  return digest;
}
