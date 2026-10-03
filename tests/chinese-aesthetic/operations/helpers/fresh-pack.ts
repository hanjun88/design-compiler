/**
 * Packs of the tests' own, built from the REAL emitted sheet of a context, optionally with one
 * decision edited (the edit is resealed, so the edited sheet is still a valid sheet).
 * Used to prove that code reads its numbers from the pack: change the decision, the behaviour follows.
 */
import { DecisionPack, type DecisionRequirement } from "../../../../skill-bridge/decision-pack";
import { REQUIRED_DECISIONS } from "../../../../skill-bridge/requirements";
import { validateSheet } from "../../../../skill-bridge/sheet-validator";
import type { AestheticConstraintSheet } from "../../../../contracts/aesthetic-constraint-sheet/aesthetic-constraint-sheet.types";
import { loadSheetJson, strictBinding, type TestContext } from "../../../support/skill-packs";
import { mutate } from "../../../skill-bridge/helpers/sheet-tools";

/** A pack of its own (never the shared cached one, so its usage ledger starts empty). */
export function freshPack(
  ctx: TestContext,
  edit?: (sheet: AestheticConstraintSheet) => void,
  requirements: readonly DecisionRequirement[] = REQUIRED_DECISIONS,
): DecisionPack {
  const raw = loadSheetJson(ctx);
  return DecisionPack.from(validateSheet(edit ? mutate(raw, edit) : raw, { allowDirty: !strictBinding() }), requirements);
}

/** The OPERATION_POLICY constraint of one subject inside a (mutable copy of a) sheet. */
export function policyConstraint(sheet: AestheticConstraintSheet, subject: string) {
  const c = sheet.constraints.find((x) => x.kind === "OPERATION_POLICY" && x.payload.subject === subject);
  if (!c || c.kind !== "OPERATION_POLICY") throw new Error(`no OPERATION_POLICY ${subject}`);
  return c;
}
