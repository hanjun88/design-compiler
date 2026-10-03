import { NoDecisionPackError } from "./active-pack";
import { DecisionContextMismatchError, MissingDecisionError } from "./decision-pack";
import { SheetRejectedError } from "./errors";

/**
 * True for failures of the aesthetic decision supply (no sheet / wrong period / a decision the sheet
 * does not carry / a rejected sheet). Code that otherwise tolerates a failing step (a gate that turns
 * an exception into a FLAG, an operator dry-run that turns it into "not selected") must rethrow
 * these: a missing aesthetic decision may never degrade into an ordinary verdict.
 */
export function isDecisionFailure(e: unknown): boolean {
  return e instanceof NoDecisionPackError || e instanceof DecisionContextMismatchError || e instanceof MissingDecisionError || e instanceof SheetRejectedError;
}
