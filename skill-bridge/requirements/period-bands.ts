import type { DecisionRequirement } from "../decision-pack";

/**
 * Period prior bands the plan compiler (chinese-aesthetic/compiler/period-constraints.ts,
 * plan-emitter.ts) needs from a sheet.
 *
 * A sheet only carries the PERIOD_BAND decisions of its own period, and the registry decides which
 * parameters each period constrains (a parameter without a band means "unconstrained in this
 * period"; the compiler treats it exactly that way). The manifest cannot express per-period
 * needs, so it names only the parameters that EVERY period constrains: the intersection of the
 * TANG / SONG / MING band sets. Every other period band is read when present and tolerated when
 * absent, and is never declared here.
 */
export const PERIOD_BAND_REQUIREMENTS: readonly DecisionRequirement[] = [
  { kind: "PARAMETER_BAND", subject: "scene.composition.negativeSpaceRatio" },
  { kind: "PARAMETER_BAND", subject: "scene.composition.axialSymmetry" },
  { kind: "PARAMETER_BAND", subject: "scene.material.roughness" },
];
