# Phase 5 Step 5.1: Runtime Ingestion Pre-Flight Contract

## Goal

Implement Phase 5 Step 5.1 pre-flight architectural contract per CHINESE-AESTHETIC-P5-S5.1-REV-06. Five production modules + comprehensive test matrix. Resolves BLOCKED_ENV and establishes the security foundation for Downstream Runtime Ingestion.

## Background

Phase 4-D.5 sealed the disk emitter with dual-gate TypeScript contract. Phase 5 requires a runtime loader that consumes scene packs with forensic-level integrity: immutable snapshots, clone-then-hash, RFC 8785 canonicalization, Unicode safety, and matrix math validation.

## Requirements

### Module 1: crypto-canonical.ts
- `assertWellFormedUnicode(s)`: reject lone surrogates (LONE_SURROGATE, INVALID_SURROGATE_PAIR)
- `encodeUtf8(str)`: TextEncoder with Unicode pre-validation
- `compareUtf8Bytes(a, b)`: UTF-8 byte-order comparison with Unicode validation before fast-path
- `canonicalizeJson(value)`: RFC 8785 JCS with pure-data enforcement (prototype, symbol keys, accessors, non-enumerable, sparse arrays, non-finite numbers)
- `computeCanonicalFileListHash(files, crypto)`: path+sha256 tokens, UTF-8 sorted, newline-joined, SHA-256
- `computeScenePackDigest(manifest, canonicalFileListHash, crypto)`: domain-prefixed "SCENE_PACK_v1:" + canonical manifest + H_files

### Module 2: matrix4-math.ts
- `determinant4x4(m)`: column-major 4x4 determinant
- `assertValidProjectionMatrix(m, label)`: finite + non-singular (det > 1e-7)
- `assertValidViewMatrix(m, label)`: SE(3) structure — affine bottom row, normalized columns, orthogonal columns, det(R)=+1

### Module 3: manifest-validator.ts
- `auditPlainDataObject(value, label, mandatoryKeys, allowedKeys)`: shallow descriptor audit → Object.create(null) snapshot
- `buildStrictRuntimeManifest(raw)`: deep-frozen snapshot, zero `as` assertions, local variable narrowing, parseMimeType/parseTruthClass/parseAvailability
- `assertStrictRuntimeManifest(raw)`: safe wrapper returning frozen snapshot

### Module 4: pure-json-freeze.ts
- `deepFreezePureJson<T>(root)`: recursive deep freeze with pure-tree enforcement (no cycles/DAG), prototype validation, array length descriptor audit, non-finite rejection, binary buffer rejection

### Module 5: runtime-loader.ts
- `ImmutableAssetRegistry`: private #entries Map, clone-on-ingest, clone-on-read, filePaths sorted by compareUtf8Bytes
- `RuntimeScenePackLoader.load(manifest, rawBuffers, crypto)`: manifest validation → exact set match → clone-then-hash → SHA-256 verification → root hash + pack digest verification → frozen LoadedRuntimeScene

## Acceptance Criteria

- [ ] All 5 modules exist under chinese-aesthetic/runtime/
- [ ] INGEST-01 through INGEST-15 all PASS
- [ ] MAT-01 through MAT-08 all PASS
- [ ] RFC-VEC-01 through RFC-VEC-06 all PASS (expected strings read raw, no JSON.parse on expected)
- [ ] node scripts/verify-baseline-ts.mjs → OVERALL PASS (GATE-A 0 errors, GATE-B 3/3 matched)
- [ ] Full chinese-aesthetic test suite PASS
- [ ] Protected directories (compiler-core/, evaluation/, schemas/) ZERO DIFF
- [ ] Zero `as` assertions, zero `any`, zero implicit type escapes in runtime/
- [ ] git status --short empty before commit

## Non-Goals

- No WebGL/WebGPU rendering (Phase 5 Step 5.2+)
- No HeartMirror business semantics (Kunlun/Spacetime/Mandala etc.)
- No GitHub Actions configuration (P2)
- No modification to existing scene-pack/ disk-emitter code

## Constraints

- Branch: feature/chinese-aesthetic-runtime-ingestion from b3c974d
- SHA-256 only (no FNV-1a)
- SOURCE/DERIVED/GENERATED strict truth boundary
- No aestheticScore / ChineseScore
- All errors must be machine-readable with explicit error codes
