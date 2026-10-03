/* eslint-disable */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source:        contracts/provenance-ledger/provenance-ledger.schema.json
 * contract_hash: 67c07aba2fda9a59ffd6a1024101c39f32c801b268c2558e25374bd726664aa4
 * Regenerate:    node scripts/contract/lock-contract.mjs --write
 * Drift is a CI failure (node scripts/contract/lock-contract.mjs --check).
 */

/**
 * Transported next to a compilation result: links every Core-IR patch and every skill decision the compiler read to source_ref -> rule_id -> decision_id -> provenance sources, and to the hash chain of the compilation. Hash-sealed.
 */
export type ProvenanceLedger = {
  ledger_version: "1.0.0";
  source_ref: {
    repository: string;
    commit: string;
    skill_version: string;
    schema_version: string;
    contract_hash: string;
    registry_hash: string;
    ledger_hash: string;
    sheet_hash: string;
    constraints_hash: string;
    sheet_rule_id: string;
    sheet_decision_id: string;
  };
  chain: {
    inputHash: string;
    rawIRHash: string;
    validatedIRHash: string;
    executionPlanHash: string;
  };
  patches: {
    index: number;
    op: string;
    path: string;
    rule_id: string;
    decision_id: string;
    sources: {
      source_id: string;
      kind: string;
      ref: string;
    }[];
  }[];
  decisions_used: {
    kind: string;
    subject: string;
    key?: string;
    rule_id: string;
    decision_id: string;
  }[];
  /**
   * sha256 of the RFC 8785 canonical ledger with ledger_hash removed.
   */
  ledger_hash: string;
};
