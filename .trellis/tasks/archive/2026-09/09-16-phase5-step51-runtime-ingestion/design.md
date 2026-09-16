# Design: Phase 5 Step 5.1 Runtime Ingestion Pre-Flight Contract

## Module Boundaries

```
crypto-canonical.ts    ← pure functions, no I/O, no state
  ├── UnicodeSecurityError
  ├── CanonicalizationError
  ├── assertWellFormedUnicode / encodeUtf8 / compareUtf8Bytes
  ├── canonicalizeJson (RFC 8785 JCS)
  ├── computeCanonicalFileListHash
  └── computeScenePackDigest

matrix4-math.ts        ← pure functions, no I/O
  ├── Matrix4 type (readonly 16-tuple)
  ├── determinant4x4
  ├── assertValidProjectionMatrix
  └── assertValidViewMatrix

manifest-validator.ts  ← depends on crypto-canonical (SHA256 regex)
  ├── isRecord / isUnknownArray
  ├── auditPlainDataObject (shallow)
  ├── buildStrictRuntimeManifest (deep, zero as)
  └── assertStrictRuntimeManifest (wrapper)

pure-json-freeze.ts    ← depends on no other runtime module
  ├── JsonAstSecurityError
  └── deepFreezePureJson (pure-tree enforcement)

runtime-loader.ts      ← depends on all above
  ├── ImmutableAssetRegistry (#entries, clone-then-hash)
  ├── RuntimeScenePackLoader.load()
  └── LoadedRuntimeScene (frozen output)
```

## Data Flow (load path)

```
raw manifest (unknown)
  → buildStrictRuntimeManifest → StrictRuntimeManifest (deep frozen)
raw buffers (Map<path, ArrayBuffer>)
  → ImmutableAssetRegistry (clone on ingest, #entries private)
  → exact set match (manifest.files ↔ registry keys)
  → per-asset: clone buffer → SHA-256 → compare manifest.sha256
  → computeCanonicalFileListHash → compare manifest.rootHash
  → computeScenePackDigest → compare manifest.scenePackDigest
  → deepFreezePureJson(sceneJson)
  → LoadedRuntimeScene (frozen)
```

## Key Security Invariants

1. **TOCTOU immunity**: buildStrictRuntimeManifest clones all data before freezing. Caller's raw object can mutate after validation without affecting snapshot.
2. **Clone-then-hash**: ImmutableAssetRegistry clones buffers on both ingest and read. External buffer mutation after load cannot affect internal state.
3. **Unicode safety**: All strings entering hash/comparison pass through assertWellFormedUnicode. Lone surrogates rejected before TextEncoder can silently replace them.
4. **RFC 8785 determinism**: canonicalizeJson enforces pure-data constraints before serialization. Key order = UTF-16 code unit sort. No whitespace. -0 → 0.
5. **Domain-isolated digest**: scenePackDigest = SHA256("SCENE_PACK_v1:" + canonical(manifest without digest) + "\n" + H_files). Prevents cross-domain hash collisions.
6. **Pure tree only**: deepFreezePureJson rejects cycles (WeakSet), shared references, non-finite numbers, binary buffers, functions, symbols.

## Error Code Taxonomy

| Module | Error Codes |
|---|---|
| crypto-canonical | INVALID_UNICODE_STRING, LONE_SURROGATE, INVALID_SURROGATE_PAIR, CANONICALIZATION_FAILED, NON_FINITE_NUMBER, ILLEGAL_PROTOTYPE, SYMBOL_KEY_FORBIDDEN, ACCESSOR_PROPERTY_FORBIDDEN, NON_ENUMERABLE_PROPERTY_FORBIDDEN, SPARSE_ARRAY_FORBIDDEN, ILLEGAL_ARRAY_PROPERTY, ARRAY_LENGTH_*, ILLEGAL_DATA_TYPE, FILE_LIST_HASH_*, DIGEST_INTEGRITY_MISMATCH, PACK_DIGEST_OUTPUT_INVALID |
| matrix4-math | PROJECTION_NON_FINITE, PROJECTION_SINGULAR, VIEW_NON_FINITE, VIEW_NOT_AFFINE, VIEW_TRANSLATION_NON_FINITE, VIEW_ROTATION_NOT_NORMALIZED, VIEW_ROTATION_NOT_ORTHOGONAL, VIEW_ROTATION_CHIRALITY_INVALID |
| manifest-validator | *_NOT_PLAIN_OBJECT, *_POLLUTED_PROTOTYPE, *_SYMBOL_KEY_FORBIDDEN, *_UNKNOWN_FIELD, *_MISSING_DESCRIPTOR, *_ACCESSOR_FORBIDDEN, *_NON_ENUMERABLE_FORBIDDEN, *_MISSING_FIELD, MANIFEST_VERSION_INVALID, MANIFEST_SCENE_ID_INVALID, MANIFEST_ROOT_HASH_INVALID, MANIFEST_PACK_DIGEST_INVALID, MANIFEST_FILE_COUNT_INVALID, MANIFEST_FILES_*, MANIFEST_ENTRY_*, MANIFEST_DUPLICATE_PATH, MANIFEST_BLOCKED_REASON_*, MANIFEST_AVAILABLE_REASON_FORBIDDEN |
| pure-json-freeze | JSON_AST_SECURITY_VIOLATION, NON_FINITE_NUMBER, ILLEGAL_PRIMITIVE, BINARY_IN_JSON_FORBIDDEN, NON_TREE_REFERENCE_REJECTED, ILLEGAL_PROTOTYPE, ARRAY_LENGTH_*, SYMBOL_KEY_FORBIDDEN, ILLEGAL_ARRAY_PROPERTY, SPARSE_ARRAY_FORBIDDEN, ACCESSOR_FORBIDDEN, NON_ENUMERABLE_FORBIDDEN |
| runtime-loader | RUNTIME_ASSET_MISSING, RUNTIME_ASSET_TAMPERED, RUNTIME_INTEGRITY_FAIL, RUNTIME_ROOT_HASH_MISMATCH, RUNTIME_SCENE_PACK_DIGEST_MISMATCH |

## Test Architecture

Single test file: tests/chinese-aesthetic/runtime/runtime-ingestion.test.ts
- INGEST-01~15: end-to-end loader behavior
- MAT-01~08: matrix math vectors
- RFC-VEC-01~06: canonicalization vectors (raw string comparison, no JSON.parse on expected)
- Unit-level: Unicode, compareUtf8Bytes, auditPlainDataObject, deepFreezePureJson adversarial cases
