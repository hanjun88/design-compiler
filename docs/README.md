# docs/

| path | what it is | authority |
|---|---|---|
| `closure/` | The closure ledgers (branches, contracts, rules, deprecated artefacts) and decision records. Generated parts say so in their header. | **Living.** Contracts: `CONTRACT-LEDGER.json`; rule dispositions: `RULE-LEDGER.*` (status derived from live lints); the skill's `docs/closure/THRESHOLD-CONFLICTS.*` is the checkable record of threshold conflicts. |
| `PHASE5-*.md`, `PLAN-02-ADDENDUM-01.md`, `REMEDIATION-*.md`, `audit/` | Dated forensic dossiers, plans and remediation notes of the earlier Phase 5 work. | **Historical.** They record what was decided and found at the time; they are not maintained and do not describe the current contracts. Where they differ from `contracts/`, `schemas/` or the code, the latter win. |

Everything that states what the compiler accepts lives in a machine-readable contract (`contracts/`, `schemas/`);
nothing under `docs/` is a second copy of one. Aesthetic knowledge is not documented here at all: it belongs to the
`chinese-aesthetic-skill` rule registry and reaches this repository only as an `AestheticConstraintSheet`.
