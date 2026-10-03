# contracts/

Machine contracts owned by this repository. Each directory holds exactly one source of truth;
nothing here is described a second time in Markdown.

| contract | source of truth | derived / guarded |
|---|---|---|
| `aesthetic-constraint-sheet/` | `aesthetic-constraint-sheet.schema.json` (JSON Schema 2020-12) | `*.types.ts` (generated), `contract.lock.json` (version + `contract_hash`) |
| `binding/` | `binding.schema.json` | `binding.json` — the pinned chinese-aesthetic-skill build |

## Changing a contract

1. Edit the schema; if the change is not purely editorial bump the version suffix of `$id`.
2. `node scripts/contract/lock-contract.mjs --write` regenerates the types and the lock.
3. `node scripts/contract/lock-contract.mjs --check --against origin/master` is the CI gate: it fails
   on schema/types/lock drift and on a changed `contract_hash` without a version bump.

The producer (chinese-aesthetic-skill) never copies the schema or the types; it pins the
`contract_hash` and its output is validated against this schema (`skill-bridge/sheet-validator.ts`).
