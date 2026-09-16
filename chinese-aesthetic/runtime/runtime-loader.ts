/**
 * runtime-loader.ts — Immutable Asset Registry & Runtime Scene Pack Loader
 *
 * Phase 5 Step 5.1. The runtime ingestion entry point.
 *
 * Key invariants:
 * - Clone-then-hash: buffers are cloned on ingest AND on read; external mutation
 *   after load cannot affect internal state or computed hashes.
 * - Exact set match: manifest.files and supplied buffers must be bidirectionally
 *   identical (no missing, no extra).
 * - Per-asset SHA-256 verification against manifest.
 * - Root hash (canonical file list hash) and scenePackDigest (domain-isolated)
 *   both verified.
 * - Output is deeply frozen; assignment throws TypeError.
 * - Platform-neutral: zero direct imports of Node.js crypto or Buffer.
 *   All hashing goes through Sha256Provider(Uint8Array) abstraction.
 */

import {
  type Sha256Provider,
  computeCanonicalFileListHash,
  computeScenePackDigest,
  compareUtf8Bytes,
  encodeUtf8,
} from "./crypto-canonical";
import {
  type StrictRuntimeManifest,
  type StrictRuntimeManifestEntry,
  buildStrictRuntimeManifest,
} from "./manifest-validator";
import { deepFreezePureJson } from "./pure-json-freeze";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LoadedAsset {
  readonly buffer: ArrayBuffer;
  readonly mimeType: string;
  readonly availability: "AVAILABLE" | "BLOCKED";
  readonly sha256: string;
  readonly byteSize: number;
  readonly truthClass: "SOURCE" | "DERIVED" | "GENERATED";
  readonly blockedReason?: string;
}

export interface LoadedRuntimeScene {
  readonly manifest: StrictRuntimeManifest;
  readonly assets: ImmutableAssetRegistry;
  readonly assetIndex: ReadonlyMap<string, LoadedAsset>;
  readonly sceneJson: Readonly<unknown>;
}

export type RawBufferMap = ReadonlyMap<string, ArrayBuffer>;

// ---------------------------------------------------------------------------
// Immutable Asset Registry (Clone-then-Hash)
// ---------------------------------------------------------------------------

interface RegistryEntry {
  readonly buffer: ArrayBuffer;
  readonly mimeType: string;
  readonly availability: "AVAILABLE" | "BLOCKED";
}

/**
 * Immutable asset registry with ECMAScript private field encapsulation.
 *
 * - Constructor clones all incoming buffers (cuts alias escape).
 * - get() returns a fresh clone (prevents downstream detach/transfer pollution).
 * - filePaths sorted by compareUtf8Bytes (UTF-8 byte order, not JS .sort()).
 */
export class ImmutableAssetRegistry {
  readonly #entries = new Map<string, RegistryEntry>();

  constructor(
    entries: Iterable<
      [string, { buffer: ArrayBuffer; mimeType: string; availability: "AVAILABLE" | "BLOCKED" }]
    >,
  ) {
    for (const [pathKey, val] of entries) {
      // Internal protective clone: cuts alias escape at ingest boundary
      this.#entries.set(pathKey, {
        buffer: val.buffer.slice(0),
        mimeType: val.mimeType,
        availability: val.availability,
      });
    }
  }

  public get(
    pathKey: string,
  ):
    | {
        readonly buffer: ArrayBuffer;
        readonly mimeType: string;
        readonly availability: "AVAILABLE" | "BLOCKED";
      }
    | undefined {
    const item = this.#entries.get(pathKey);
    if (!item) return undefined;
    // Return fresh ArrayBuffer clone: prevents downstream transfer/detach
    return {
      buffer: item.buffer.slice(0),
      mimeType: item.mimeType,
      availability: item.availability,
    };
  }

  public has(pathKey: string): boolean {
    return this.#entries.has(pathKey);
  }

  /** Paths sorted by UTF-8 byte order (compareUtf8Bytes), frozen snapshot. */
  public get filePaths(): readonly string[] {
    const keys = Array.from(this.#entries.keys());
    keys.sort((a, b) => compareUtf8Bytes(a, b));
    return Object.freeze(keys);
  }

  public get size(): number {
    return this.#entries.size;
  }
}

// ---------------------------------------------------------------------------
// Runtime Scene Pack Loader
// ---------------------------------------------------------------------------

export class RuntimeScenePackLoader {
  /**
   * Load a scene pack from raw manifest + raw buffers.
   *
   * Pipeline:
   * 1. buildStrictRuntimeManifest (validate + deep-freeze manifest snapshot)
   * 2. ImmutableAssetRegistry (clone all buffers on ingest)
   * 3. Exact set match (manifest.files ↔ registry keys, bidirectional)
   * 4. Per-asset: clone buffer → SHA-256 → compare manifest.sha256
   * 5. computeCanonicalFileListHash → compare manifest.rootHash
   * 6. computeScenePackDigest → compare manifest.scenePackDigest
   * 7. deepFreezePureJson on scene metadata
   * 8. Return frozen LoadedRuntimeScene
   */
  public static async load(
    manifestRaw: unknown,
    rawBuffers: RawBufferMap,
    crypto: Sha256Provider,
  ): Promise<LoadedRuntimeScene> {
    // 1. Manifest validation (TOCTOU-immune frozen snapshot)
    const manifest = buildStrictRuntimeManifest(manifestRaw);

    // 2. Immutable registry (clone on ingest)
    const registry = new ImmutableAssetRegistry(
      Array.from(rawBuffers.entries()).map(([p, buf]) => [
        p,
        { buffer: buf, mimeType: "application/octet-stream", availability: "AVAILABLE" as const },
      ]),
    );

    // 3. Exact set match (bidirectional)
    const manifestPaths = new Set(manifest.files.map((f) => f.path));
    const registryPaths = new Set(registry.filePaths);

    for (const mp of manifestPaths) {
      if (!registryPaths.has(mp)) {
        throw new Error(
          `RUNTIME_ASSET_MISSING: Manifest declares "${mp}" but no buffer supplied`,
        );
      }
    }
    for (const rp of registryPaths) {
      if (!manifestPaths.has(rp)) {
        throw new Error(
          `RUNTIME_INTEGRITY_FAIL: Buffer "${rp}" supplied but not declared in manifest`,
        );
      }
    }

    // 4. Per-asset SHA-256 verification (clone-then-hash)
    const assetIndex = new Map<string, LoadedAsset>();
    const hashEntries: { path: string; sha256: string }[] = [];

    for (const entry of manifest.files) {
      const regItem = registry.get(entry.path);
      if (!regItem) {
        throw new Error(`RUNTIME_ASSET_MISSING: "${entry.path}" not found in registry`);
      }
      // Clone before hashing: proves external mutation cannot affect computed hash
      const clonedBuffer = regItem.buffer.slice(0);
      const bytes = new Uint8Array(clonedBuffer);
      const computedHash = await crypto.digestHex(bytes);

      if (computedHash !== entry.sha256) {
        throw new Error(
          `RUNTIME_ASSET_TAMPERED: "${entry.path}" expected ${entry.sha256}, got ${computedHash}`,
        );
      }
      if (clonedBuffer.byteLength !== entry.byteSize) {
        throw new Error(
          `RUNTIME_ASSET_TAMPERED: "${entry.path}" byteSize mismatch (expected ${entry.byteSize}, got ${clonedBuffer.byteLength})`,
        );
      }

      const loadedAsset: LoadedAsset = {
        buffer: clonedBuffer,
        mimeType: entry.mimeType,
        availability: entry.availability,
        sha256: entry.sha256,
        byteSize: entry.byteSize,
        truthClass: entry.truthClass,
        ...(entry.blockedReason !== undefined ? { blockedReason: entry.blockedReason } : {}),
      };
      assetIndex.set(entry.path, Object.freeze(loadedAsset));
      hashEntries.push({ path: entry.path, sha256: entry.sha256 });
    }

    // 5. Root hash verification (canonical file list hash)
    const computedRootHash = await computeCanonicalFileListHash(hashEntries, crypto);
    if (computedRootHash !== manifest.rootHash) {
      throw new Error(
        `RUNTIME_ROOT_HASH_MISMATCH: Expected ${manifest.rootHash}, computed ${computedRootHash}`,
      );
    }

    // 6. Scene pack digest verification (domain-isolated)
    const computedDigest = await computeScenePackDigest(manifest, computedRootHash, crypto);
    if (computedDigest !== manifest.scenePackDigest) {
      throw new Error(
        `RUNTIME_SCENE_PACK_DIGEST_MISMATCH: Expected ${manifest.scenePackDigest}, computed ${computedDigest}`,
      );
    }

    // 7. Build and freeze scene JSON metadata
    const sceneJson = deepFreezePureJson({
      sceneId: manifest.sceneId,
      manifestVersion: manifest.manifestVersion,
      packVersion: manifest.packVersion,
      fileCount: manifest.fileCount,
      assetCount: assetIndex.size,
    });

    // 8. Return frozen scene
    return Object.freeze({
      manifest,
      assets: registry,
      assetIndex: Object.freeze(assetIndex),
      sceneJson,
    });
  }
}

// ---------------------------------------------------------------------------
// Node.js SHA-256 Provider (convenience for Node environments)
//
// NOTE: This is a separate export. The loader core does NOT import it.
// Consumers in browser/WebGL must provide their own Sha256Provider.
// ---------------------------------------------------------------------------

/**
 * Node.js SHA-256 provider implementation.
 * Imported separately from the loader core to maintain platform neutrality.
 */
export class NodeSha256Provider implements Sha256Provider {
  public async digestHex(bytes: Uint8Array): Promise<string> {
    const nodeCrypto = await import("node:crypto");
    return nodeCrypto.createHash("sha256").update(bytes).digest("hex");
  }
}

/** Re-export encodeUtf8 for consumers that need to hash arbitrary strings. */
export { encodeUtf8 };
