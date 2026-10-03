/**
 * What the compiler needs from an AestheticConstraintSheet — an interface requirement, not
 * aesthetic data: it names decisions and keys, never values. DecisionPack.from() rejects a sheet
 * that lacks any of them before a compilation starts (fail closed).
 *
 * One file per compiler area; each file owns its list. A test asserts that every decision the
 * compiler actually reads at runtime is declared here, so the manifest cannot silently rot.
 */
import type { DecisionRequirement } from "../decision-pack";
import { PERIOD_BAND_REQUIREMENTS } from "./period-bands";
import { GOVERNANCE_REQUIREMENTS } from "./governance";
import { OPERATION_REQUIREMENTS } from "./operations";
import { PLAN_REQUIREMENTS } from "./plan";
import { ANTI_PATTERN_REQUIREMENTS } from "./anti-pattern";
import { EVALUATOR_REQUIREMENTS } from "./evaluator";
import { GRAMMAR_REQUIREMENTS } from "./grammar";

export const REQUIRED_DECISIONS: readonly DecisionRequirement[] = [
  ...PERIOD_BAND_REQUIREMENTS,
  ...GOVERNANCE_REQUIREMENTS,
  ...OPERATION_REQUIREMENTS,
  ...PLAN_REQUIREMENTS,
  ...ANTI_PATTERN_REQUIREMENTS,
  ...EVALUATOR_REQUIREMENTS,
  ...GRAMMAR_REQUIREMENTS,
];
