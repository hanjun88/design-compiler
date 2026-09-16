# GATE-A Independent Scoped TS Execution

## Goal

Create tsconfig.chinese-aesthetic.json for truly independent scoped typecheck, rewrite verify-baseline-ts.mjs to run GATE-A and GATE-B as separate tsc invocations with config existence check, exit code capture, and path normalization. Fixes CONDITIONAL BLOCKED from 2622490 audit.

## Background

2622490 established dual-gate TypeScript contract but GATE-A was implemented as full-repo tsc + startsWith filter, not independent scoped execution. Default tsconfig.json does not even include chinese-aesthetic/ in its include list.

## Requirements

1. `tsconfig.chinese-aesthetic.json` must exist and independently compile chinese-aesthetic/**/*.ts with strict + noImplicitAny
2. verify-baseline-ts.mjs must run GATE-A and GATE-B as **separate** tsc processes
3. Config file existence must be checked before execution
4. Diagnostic paths must be normalized to repo-relative (handle absolute paths, ./ prefix)
5. Each gate must record its own exit code

## Acceptance Criteria

- [ ] tsconfig.chinese-aesthetic.json exists, valid JSON, includes only chinese-aesthetic/**/*.ts
- [ ] `npx tsc --project tsconfig.chinese-aesthetic.json --noEmit` exits 0 with 0 errors
- [ ] GATE-A and GATE-B execute as independent tsc invocations
- [ ] Script fails fast if tsconfig.chinese-aesthetic.json is missing
- [ ] Diagnostic paths normalized to repo-relative
- [ ] Overall exit 0 only when both gates pass
- [ ] Protected directories (compiler-core/, evaluation/, schemas/) ZERO DIFF

## Non-Goals

- Do not fix the 3 baseline errors in compiler-core/evaluation (read-only protected)
- Do not modify default tsconfig.json include list
- Do not configure GitHub Actions (P2)

## Notes

- Keep prd.md focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add design.md for technical design and implement.md for execution planning before task.py start.
