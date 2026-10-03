import type { DecisionRequirement } from "../decision-pack";

export const GOVERNANCE_REQUIREMENTS: readonly DecisionRequirement[] = [
  { kind: "PRIORITY_ORDER" },
  { kind: "SCORING_WEIGHTS" },
];
