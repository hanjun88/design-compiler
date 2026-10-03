# Deprecated ledger

Nothing below is deleted from a remote. The closure only (a) leaves these branches untouched, (b) marks the pull requests as superseded with a comment and closes them so they cannot be merged into a default branch and re-introduce a parallel contract, adapter or rule set. Closing a pull request is reversible; branches stay on the remote for the owner to retire.

Sources of truth: `BRANCH-LEDGER.json` (generated from git) and `CONTRACT-LEDGER.json` (RETIRED entries).

## Pull requests

| repo | PR | head → base | state at baseline | closure action | why |
|---|---|---|---|---|---|
| design-compiler | #1 | `chore/automation-review` → `master` | open | superseded, close | pre-closure CI/environment scaffolding |
| design-compiler | #2 | `chore/drive-sync-20260918` → `master` | open | **leave open** | docs-only Drive sync, unrelated to the closure |
| design-compiler | #3 | `feat/aesthetic-integration` → `master` | open, mergeable | superseded, close | independent re-implementation of Contract A, 41-rule aesthetic grammar pack in the compiler, G2.5 anti-cliché gate: parallel SSOT / contract / adapter |
| design-compiler | #4 | `ci/add-code-review` → `master` | open | superseded, close | CI for the pre-closure layout (npmmirror lockfile, no intent/aesthetic/parity coverage) |
| chinese-aesthetic-skill | #1 | `chore/automation-review` → `main` | open | superseded, close | pre-closure environment scaffolding |
| chinese-aesthetic-skill | #2 | `chore/drive-sync-20260918` → `main` | open | **leave open** | docs-only Drive sync |
| chinese-aesthetic-skill | #3 | `feat/frontend-playbook-v2` → `main` | open | superseded, close | execution layer (plan→DOM, Figma/Three.js/React mappers), frontend implementation layer, react moved into `dependencies`, second copy of Contract A |
| chinese-aesthetic-skill | #4 | `ci/add-code-review` → `main` | closed (unmerged; content already on main) | none | historical |

## Branches (kept on the remote)

| repo | branch | disposition |
|---|---|---|
| design-compiler | `feat/aesthetic-integration` | DEPRECATED_PARALLEL |
| design-compiler | `feat/heartmirror-phase-ab-task2` | DEPRECATED_PARALLEL |
| design-compiler | `feature/chinese-aesthetic-{foundation,design-ops,execution-plan,scene-contract,golden-pack,disk-emitter,runtime-ingestion}` and `feature/step8-contract-provenance-hardening` | CONTAINED_IN_TRUNK (zero unapplied commits) |
| design-compiler | `feature/chinese-aesthetic-scene-pack`, `feature/phase-4d1-safe-replacement-manifest-trust`, `feature/phase-4d2-hardening` | SUPERSEDED_BY_TRUNK (reviewed: trunk holds the later implementations) |
| design-compiler | `feature/chinese-aesthetic-render-pipeline` | TRUNK_SOURCE (untouched; superseded as the active line by `claude/great-franklin-1b8wp2`) |
| chinese-aesthetic-skill | `feat/frontend-playbook-v2`, `feat/heartmirror-phase-ab-task2` | DEPRECATED_PARALLEL |
| chinese-aesthetic-skill | `ci/add-code-review`, `feature/add-code-review-workflow` | CONTAINED_IN_DEFAULT |

## Artefacts retired by the closure

See `CONTRACT-LEDGER.json` entries with status `RETIRED` (twin Markdown schema, handwritten type mirrors, three adapters, second scene schema, orphan binding file, descriptive api block). Branch-only artefacts are never merged; artefacts that exist on a default branch are deleted by a dedicated, reviewable commit (phase 8).
