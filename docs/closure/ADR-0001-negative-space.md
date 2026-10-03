# ADR-0001 — Canonical definition of negative space (留白 / void)

Status: **PROPOSED** (Phase 0 evidence). Flipped to ACCEPTED in the Phase 3 commit that creates the skill rule registry; the values below are then implemented and tested there.

## Problem

Fourteen different numbers describe "how much 留白 is right" across the two repositories. They were presented as one conflict (30 / 50 / 60 / 0.45 / 0.48 / 0.58 / >0.72 → 0.58). The evidence shows they are **not** values of one quantity.

## Evidence

### 1. The two repositories measure different quantities with the same name

| | chinese-aesthetic-skill | design-compiler |
|---|---|---|
| name | `voidRatio` (guideline: 留白面积比) | `negativeSpaceRatio` (`/composition/negativeSpaceRatio`) |
| definition | share of the frame that is designed void: sky / cloud / water / empty ground (guidelines/void-solid.md, measurement column) | share of pixels with **luma >= 180 and 3x3 local variance < 100** (`extraction/algorithms/negative-space.ts`) |
| consequence | counts textured void (cloud gradients, water ripples) and dark-tone void | counts only *bright, flat* pixels; cannot see dark-tone void; systematically under-estimates textured void |

DC's numbers (0.35 / 0.40 / 0.15–0.40 …) are therefore **lower-bound proxy** values, the skill's are **design-level** values. Comparing them as if they were the same metric is the root of the "conflict".

### 2. Within the skill, the 30 / 50 / 60 are three different things

| value | where | what it is | history |
|---|---|---|---|
| 30% | README rule table | the **v1 hard floor**, "留白≥30%，虚大于实" (self-contradictory: 虚大于实 means > 50%) | initial commit `775d8a2` (2026-09-15); **superseded** by `8f30a14` the same day |
| 60% | guidelines/void-solid.md, chineseness scoring (full marks) | **hard threshold for bright-tone cinematic empty shots / landscape** ("5位博主共识", 亮调可推到 60–70%); dark tone: dark solids 20–40% substitute for white void | `8f30a14` "重新蒸馏全部素材" |
| 50% | `lib/chineseness.js` structural-signal test, SKILL.md "虚实比 ≥ 0.5" | **structural-orientalism signal** worth +15 points — a scoring signal, not a compliance floor | `775d8a2`, kept; SKILL.md restated it on 2026-09-28 (`52fa0d7`) |
| 0.40 / 0.50 / 0.55 / 0.70 / 0.65 | `lib/spatial-engine.js` SCENE_PRESETS | **generation defaults per scene type** (palace / temple / residence / landscape / ACT0 gate) | `29097c9` |

### 3. DC's period bands and golden cells carry period-conditioned values

| period | DC band (`period-constraints.ts`) | golden cells (expert-judgment, matrix-v1.0.1) |
|---|---|---|
| TANG | [0.15, 0.40] | 0.15 (T01), 0.20 (T02), 0.28 (X01) |
| MING | [0.25, 0.50] | 0.32 (M01), 0.30 (X02) |
| SONG | [0.35, 0.65] | **0.68** (S01) — outside DC's own band |

`human-audit-ledger.ts` repeats the SONG band [0.35, 0.65] as an "ideal range" (a duplicate inside DC).

### 4. DC scatters further literals for the same concept

`operations/design-operations.ts`: clamps [0.05, 0.7] on negative space (two operators); `evaluator/machine-evaluator.ts`: `voidRatio < 0.7` required for "balance"; `anti-pattern/gates/dead-void.ts`: `voidRatio > 0.5` is only a *dead-void candidate* (needs zero texture/gradient/variation as well). On the parallel PR #3 line: repair targets 0.45 / 0.48 / 0.50 / 0.58 and `CA-RULE-13` (> 0.72 → 0.58).

### 5. Documented evidence for the upper end

`guidelines/void-solid.md` evidence section (lines 107–110): 宋画山水 sky/water 60–80 %, 徽派 white walls 70 %+, Lumax MJ 60 %+, 晓白ALEX dark-tone deep-black ground 60–80 % (dark solids standing in for white void); the same guideline names "大虚小实 7:3 (0.70)" as the best tier; `chineseness` rewards `voidRatio >= 0.70`; `spatial-engine` labels >= 0.70 "宋韵极简". DC's upper bounds 0.65 / 0.70 / 0.72 contradict all of this.

## Decision rules (no free choice of numbers)

1. **One metric, named in the contract.** The registry defines `void_ratio` (design-level area share) as the metric every aesthetic threshold is expressed in. `/composition/negativeSpaceRatio` in the IR means `void_ratio`. DC's pixel estimator is declared in the contract as an *estimator with bias = lower bound*; evidence-line values carry that tag and are never compared to design-level thresholds without it.
2. **Superseded values are removed, not reconciled.** README 30 % is deleted (superseded v1 floor). SKILL.md and README stop restating numbers; they render registry blocks.
3. **Three named semantics, three rule kinds**, each with its own `rule_id`: hard floor (P0, bright cinematic genre, 0.60), structural signal (scoring only, 0.50), period plausibility band (descriptive prior).
4. **Period bands = union of evidence-backed ranges**, never an average: the band for a period spans every documented value for that period (DC prior, skill scene presets that are explicitly period-tagged, golden cell, guideline evidence). The Song upper bound is raised to the documented evidence (0.80) because DC's 0.65 contradicts DC's own golden cell and the skill's presets.
5. **Repair targets are derived**: `target = max(authored_target, largest applicable hard floor)`, clamped into the intersection of all applicable bands. If the intersection is empty the registry is invalid and the build fails (no silent winner).
6. **Numeric caps without evidence are deleted**: `CA-RULE-13` (>0.72 → 0.58) has no skill source and contradicts the 7:3 best tier; the skill's own rule is "void must be functional" (gradient / reflection / flow), which the dead-void gate encodes. The numeric cap is dropped; evaluator and operator clamps take their upper bound from the period band.

## Consequences

- Every negative-space number in design-compiler disappears or becomes a sheet-derived runtime value traceable to `rule_id` / `decision_id`.
- A registry consistency test fails if any golden cell, scene preset or documented evidence value falls outside the band of its own period, or if any applicable bands are disjoint.
- ADR values are tested in the skill (`rules` tests) and in the compiler (`sheet` conformance + golden matrix).
