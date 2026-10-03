/**
 * Inputs for tests of the engine MECHANICS (patch ordering, scoring arithmetic, hash flow...).
 * They are arbitrary test data, not aesthetic claims: aesthetic decisions only ever reach the
 * compiler through a sheet from the skill (see tests/support/skill-packs.ts).
 */
import type { ComplianceScoringWeights } from "../../compiler-core/scoring";

export const MECHANICS_TEST_WEIGHTS: ComplianceScoringWeights = { composition: 0.25, lighting: 0.25, color: 0.25, materials: 0.25 };
