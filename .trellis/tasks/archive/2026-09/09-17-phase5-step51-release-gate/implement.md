# Implement Plan: Phase 5 Step 5.1 Release Gate Evidence

## Execution Order

### Step 1: Fetch RFC 8785 Official Test Vectors
- Source: https://raw.githubusercontent.com/cyberphone/json-canonicalization/master/testdata/
- Download all available vector files to tests/chinese-aesthetic/runtime/fixtures/rfc8785/
- Inspect vector format (typically {input: ..., expected: "..."} or separate files)

### Step 2: Wire Official Vectors into Tests
- Add test block "RFC 8785 Official Vectors (from cyberphone/json-canonicalization)"
- For each vector: read input file → JSON.parse → canonicalizeJson → compare to raw expected string
- CRITICAL: expected must be read as raw string, NEVER JSON.parse(expected)
- Verify vector count and list them in test output

### Step 3: Capture Full Raw Test Logs
- npx jest tests/chinese-aesthetic/runtime/ --runInBand --verbose > logs/runtime-tests.log 2>&1
- npx jest tests/chinese-aesthetic/ --runInBand --verbose > logs/full-regression.log 2>&1
- node scripts/verify-baseline-ts.mjs > logs/dual-gate-ts.log 2>&1
- git rev-parse HEAD > logs/commit-hash.txt
- git status --short > logs/git-status.txt

### Step 4: Line-by-Line Contract Audit
- For each P0/P1 requirement in REV-06, map to code location and verify
- P0-01: buildStrictRuntimeManifest as sole entry, no asserts predicate
- P0-02: RFC 8785 official vectors + raw string assertion methodology
- P1-01: zero as assertions, local variable narrowing, parse* functions
- P1-02: array length descriptor (exists, has value, enumerable:false, non-negative safe int, no writable requirement)
- P1-03: filePaths sorted by compareUtf8Bytes (not JS .sort())
- P1-04: computeCanonicalFileListHash input validation (\n, :, 64-hex) + output self-check
- P1-05: auditPlainDataObject shallow only, buildStrictRuntimeManifest owns deep validation
- Produce docs/PHASE5-STEP51-CONTRACT-AUDIT.md

### Step 5: Commit & Push
- Commit fixtures + test updates + logs + audit report
- task.py archive + add_session
- Push
