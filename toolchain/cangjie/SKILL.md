---
name: cangjie-meta-gate
description: Cangjie Meta Data Gate — admission control for estimated parameters (source grounding, confidence, calibration). Rule authoring is not done here: aesthetic rules live in the chinese-aesthetic-skill registry.
version: 0.2.0
---

# Cangjie Meta Data Gate

`meta-gate/index.ts` checks that estimated parameters carry what a production decision needs before they are admitted:

1. **Source grounding** — a literature / specification / sample-set source, not a bare string.
2. **Confidence rating** — the parameter's confidence reaches the configured threshold.
3. **Calibration proof** — `expert-calibrated` or `dataset-empirical-priors`; anything uncalibrated is `EXPERIMENTAL` and only passes as an explicit warning.

An empty parameter set is `BLOCKED`, never a vacuous pass.

## Boundary

- Aesthetic rules, thresholds, their provenance and confidence are authored in the `chinese-aesthetic-skill` rule registry
  (`rules/`) and reach this repository only as an `AestheticConstraintSheet` (`contracts/`), validated by
  `skill-bridge/sheet-validator.ts`. This directory holds no rule pack, no ontology and no corpus: the earlier
  five-file artifact templates (`ontology / heuristics / assertions / evaluation-matrix / grammar-rules`) were empty
  placeholders for a second, parallel rule container and have been removed.
- The gate is a mechanism over parameters it is handed; it defines no aesthetic value.
