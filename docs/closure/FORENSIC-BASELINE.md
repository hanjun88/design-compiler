# Forensic baseline (Phase 0)

Frozen before any closure change. Everything here was measured with commands, not recalled; the commands are in the right-hand column so each number can be re-run.

## Refs

| item | value |
|---|---|
| design-compiler default branch `master` | `bd2b3a1bd79c` |
| design-compiler locked trunk `feature/chinese-aesthetic-render-pipeline` | `6465c9ff25aa` (166 commits ahead of `master`'s fork point, 11 behind) |
| chinese-aesthetic-skill default branch `main` | `b0476c27839f` |
| forward-ported from `master` onto the trunk | `17e4010`, `50e2d8b`, `b3d7e51`, `bd2b3a1` (cherry-picked with `-x`, no conflicts) |
| not forward-ported (stay on `master`) | 7 commits: HeartMirror product docs ×5, duplicate evidence ×2 |

## Measured test baseline

| target | command | result |
|---|---|---|
| DC `master` | `npm test` / `npm run test:contract` / `npm run build` / `npm run validate:schemas` | 18/18; 13 suites 180 tests; `tsc` ok; 5/5 schemas — and **no CI file on `master`** (0 workflow runs on `master`) |
| DC `master` | `npx jest` (all roots) | 224 tests pass; 44 of them (`tests/intent`) are not reached by `npm run test:all` |
| DC trunk (before forward-port) | `npx tsc --noEmit` | 3 errors (`execution-planner.ts`, `feedback-engine.ts` ×2) — fixed upstream by `17e4010` |
| DC trunk (before forward-port) | `npx jest --runInBand` | 36 suites: 35 pass, 1 cannot run; 923 tests pass |
| DC trunk + forward-ports | `npx tsc --noEmit` | 0 errors |
| DC trunk + forward-ports | `npx jest --runInBand` | **39 suites: 38 pass, 1 cannot run (`e2e-video-motion`: `pngjs` imported but not declared); 940 tests pass; 256 s** |
| DC PR #3 head `baf555e` | `npm run test:all` vs `npx jest` | 192 tests vs 313 tests: CI's `test:all` skips `tests/aesthetic-integration` (77) and `tests/intent` (44) |
| skill `main` | `node tests/engines.test.js`; `scripts/validate.cjs --gate 1/2/3`; `npm run lint`; `npm run build` | 112/112; Gate 1–3 pass (100); `tsc --noEmit` ok; vite build ok |
| skill PR #3 head `1147eae` | `npm run lint`; `npm test`; `npm run test:runtime` | ok; 112; 74/74 (needs Node ≥ 22.6, package says `>=18`) |

## Findings that drive the closure

1. **No integration on the default branches.** DC README: `Cross-repo integration NOT_INTEGRATED`; governance `rollbackGrammar` is a placeholder; 0 tags, 0 releases in both repos.
2. **Integration work exists only on unmerged lines**, and as three parallel designs: the trunk (A-track), the PR #3 pair, and `heartmirror-phase-ab`. The PR #3 pair keeps two hand-written implementations of "Contract A" "in lock-step" plus a Markdown twin of the schema; the sheet has no version field; the IR has no field for a skill version (`provenance`, `sourceRef`, `meta` are closed objects).
3. **The skill's binding pin is an orphan**: `cross-repo-binding.json` pins `18642a8` (`feature/chinese-aesthetic-scene-contract`, an ancestor of the trunk, unreachable from `master`); no file, script or CI job reads it.
4. **The two core lines inside the trunk are not connected**: `PipelineRunner` (G1 → patches → G3 → `RuntimeExecutionPlan`) and the evidence-driven aesthetic line (graph → period grammar → intent → `AestheticExecutionPlan` → `AestheticRuntimePlan` → `SceneCompilationIR` → scene pack → runtime) share only `RawDesignIR`; no test chains them.
5. **Aesthetic knowledge is duplicated and contradictory** (see `RULE-LEDGER.md`, 1,228 threshold-shaped sites scanned, 244 in the compiler to migrate) — and the negative-space numbers are values of *different metrics* (`ADR-0001-negative-space.md`).
6. **Environment**: `package-lock.json` pins 340 `resolved` URLs to `registry.npmmirror.com` (egress-denied here); the WebGL probes hard-code `/usr/local/bin/chromium` (the repo's own probe reports BLOCKED_ENV; with the path fixed it passes under Xvfb + SwiftShader).
7. **A-track keeps its own TypeScript error whitelist** (`docs/BASELINE-TS-ERROR-LEDGER.md`, gate "exactly 3 diagnostics"): once the three errors are fixed the whitelist gate must be retired, not left asserting a stale count.

## Corrections to the earlier audit

- `18642a8` *does* exist on the remote (tip of `feature/chinese-aesthetic-scene-contract`); the local clone only held the default branch. It is reachable from the trunk, not from `master`.
- The "42-rule" grammar pack and anti-cliché gate belong to the PR #3 line; the trunk's `config/grammar-rules.json` has 9 rules.
