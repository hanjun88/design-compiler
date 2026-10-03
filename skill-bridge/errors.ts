/**
 * Rejection vocabulary of the skill → compiler bridge.
 *
 * Every way a sheet can be refused has a stable code. The bridge fails closed: a sheet that
 * raises any issue never reaches the compiler, there is no "best effort" mode.
 */

export type SheetRejectionCode =
  | "SHEET_SCHEMA_INVALID"
  | "SHEET_CONTRACT_HASH_MISMATCH"
  | "SHEET_SCHEMA_VERSION_INCOMPATIBLE"
  | "SHEET_SKILL_VERSION_STALE"
  | "SHEET_SOURCE_MISMATCH"
  | "SHEET_SOURCE_DIRTY"
  | "SHEET_PROVENANCE_LEDGER_MISMATCH"
  | "SHEET_PROVENANCE_HASH_MISMATCH"
  | "SHEET_PROVENANCE_MISSING"
  | "SHEET_CAPABILITY_UNSUPPORTED"
  | "SHEET_CONFIDENCE_BELOW_FUSE"
  | "SHEET_CONFIDENCE_INCONSISTENT"
  | "SHEET_DUPLICATE_DECISION"
  | "SHEET_CONTEXT_MISMATCH"
  | "SHEET_ROLE_MISSING"
  | "SHEET_DECISION_INVALID"
  | "SHEET_RULE_CONFLICT"
  | "SHEET_PATCH_PATH_INVALID"
  | "SHEET_REQUIRED_DECISION_MISSING"
  | "BINDING_INVALID"
  | "BINDING_SOURCE_MISMATCH";

export interface SheetIssue {
  code: SheetRejectionCode;
  message: string;
  /** decision_id of the offending constraint, when the issue is local to one. */
  decision_id?: string;
  /** JSON-pointer-ish location inside the sheet. */
  path?: string;
}

export class SheetRejectedError extends Error {
  public readonly issues: readonly SheetIssue[];
  public readonly codes: readonly SheetRejectionCode[];

  constructor(issues: readonly SheetIssue[]) {
    const head = issues.slice(0, 5).map((i) => `[${i.code}] ${i.message}`).join("; ");
    super(`AestheticConstraintSheet rejected (${issues.length} issue${issues.length === 1 ? "" : "s"}): ${head}`);
    this.name = "SheetRejectedError";
    this.issues = issues;
    this.codes = [...new Set(issues.map((i) => i.code))];
  }
}
