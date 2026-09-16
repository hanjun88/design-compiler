# Implement Plan: GATE-A Independent Scoped TS Execution

## Step 1: Create tsconfig.chinese-aesthetic.json

Extend base compilerOptions, include only chinese-aesthetic/**/*.ts:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["chinese-aesthetic/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

Note: extends inherits paths mapping (@compiler/* etc.) which is fine — chinese-aesthetic doesn't use them but no harm.

## Step 2: Verify scoped tsc runs clean

Run: `npx tsc --project tsconfig.chinese-aesthetic.json --noEmit`

Expected: exit 0, 0 errors. If errors appear, they are real chinese-aesthetic type errors that must be fixed (not filtered).

## Step 3: Rewrite verify-baseline-ts.mjs

### GATE-A (independent)
1. Check `existsSync("tsconfig.chinese-aesthetic.json")` → missing = FAIL
2. Run `npx tsc --project tsconfig.chinese-aesthetic.json --noEmit`
3. Capture exit code, stdout, stderr
4. Parse diagnostics, normalize paths to repo-relative (strip cwd prefix, strip leading ./)
5. PASS iff exit code 0 AND 0 diagnostics

### GATE-B (independent, full repo)
1. Run `npx tsc --noEmit` (default tsconfig.json)
2. Capture exit code, stdout, stderr
3. Parse diagnostics, normalize paths
4. Match against BASELINE_FINGERPRINTS (errorCode + file + messagePattern)
5. PASS iff exactly 3 diagnostics, all matched, 0 unmatched, 0 missing

### Path normalization
```js
function normalizePath(p, repoRoot) {
  let r = p;
  if (r.startsWith(repoRoot)) r = r.slice(repoRoot.length + 1);
  if (r.startsWith("./")) r = r.slice(2);
  return r;
}
```

## Step 4: Run full verification

`node scripts/verify-baseline-ts.mjs` → expect OVERALL: PASS (exit 0)

## Step 5: Verify protected dirs

`git diff --name-only 2622490 HEAD -- compiler-core/ evaluation/ schemas/` → empty

## Step 6: Commit & push

- tsconfig.chinese-aesthetic.json (new)
- scripts/verify-baseline-ts.mjs (modified)
- .trellis/tasks/ archive (via task.py archive)

## Validation Commands

```bash
npx tsc --project tsconfig.chinese-aesthetic.json --noEmit  # GATE-A direct
node scripts/verify-baseline-ts.mjs                         # dual-gate
git diff --name-only 2622490 HEAD -- compiler-core/ evaluation/ schemas/  # ZERO DIFF
```
