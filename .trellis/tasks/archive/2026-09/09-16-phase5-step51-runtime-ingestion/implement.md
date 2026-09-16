# Implement Plan: Phase 5 Step 5.1 Runtime Ingestion

## Execution Order (dependency-respecting)

### Step 1: crypto-canonical.ts (foundation, no deps)
- UnicodeSecurityError class
- assertWellFormedUnicode / encodeUtf8 / compareUtf8Bytes
- canonicalizeJson (RFC 8785 JCS)
- computeCanonicalFileListHash
- computeScenePackDigest
- SHA256_HEX_REGEX, Sha256Provider interface

### Step 2: matrix4-math.ts (no deps)
- Matrix4 type
- determinant4x4
- assertValidProjectionMatrix
- assertValidViewMatrix

### Step 3: manifest-validator.ts (depends on crypto-canonical SHA256 regex)
- isRecord / isUnknownArray
- auditPlainDataObject
- parseMimeType / parseTruthClass / parseAvailability
- buildStrictRuntimeManifest (zero as assertions)
- assertStrictRuntimeManifest wrapper

### Step 4: pure-json-freeze.ts (no deps)
- JsonAstSecurityError
- deepFreezePureJson (WeakSet cycle detection)

### Step 5: runtime-loader.ts (depends on all above)
- ImmutableAssetRegistry (#entries private, clone-then-hash)
- RuntimeScenePackLoader.load()
- LoadedRuntimeScene type

### Step 6: runtime-ingestion.test.ts
- Unit tests for each module
- INGEST-01~15
- MAT-01~08
- RFC-VEC-01~06
- TOCTOU / clone-then-hash adversarial tests

## Validation Gates

```bash
# Gate 1: Scoped TypeScript (must be 0 errors)
npx tsc --project tsconfig.chinese-aesthetic.json --noEmit

# Gate 2: Dual-gate baseline (GATE-A 0 + GATE-B 3/3)
node scripts/verify-baseline-ts.mjs

# Gate 3: Runtime tests
npx jest tests/chinese-aesthetic/runtime/ --runInBand

# Gate 4: Full regression
npx jest tests/chinese-aesthetic/ --runInBand

# Gate 5: Protected dirs
git diff --name-only b3c974d HEAD -- compiler-core/ evaluation/ schemas/
```

## Key Implementation Notes

1. **Zero `as` assertions**: Use local variable control-flow narrowing. For union type parsing, use explicit if-else with literal comparison.
2. **RFC 8785 expected strings**: In tests, read expected files with readFileSync and compare with `.toBe()`. NEVER JSON.parse the expected canonical output.
3. **Clone-then-hash**: In RuntimeLoader, hash the CLONED buffer, not the original. This proves external mutation cannot affect computed hash.
4. **Array length descriptor**: Do NOT require writable:true (Object.freeze sets it false). Require: exists, has value, enumerable:false, value is non-negative safe integer.
5. **compareUtf8Bytes**: Must call assertWellFormedUnicode on BOTH inputs before the `a === b` fast-path.
6. **scenePackDigest**: Domain prefix "SCENE_PACK_v1:" + canonicalizeJson(manifestWithoutDigest) + "\n" + canonicalFileListHash. manifest.files order preserved (not sorted).
