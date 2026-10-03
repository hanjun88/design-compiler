/* eslint-disable */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source:        contracts/binding/binding.schema.json
 * contract_hash: 1759b2910e0d70e384ebf27dcaa32e6162ab5f6501d025af8775dac805cee865
 * Regenerate:    node scripts/contract/lock-contract.mjs --write
 * Drift is a CI failure (node scripts/contract/lock-contract.mjs --check).
 */

/**
 * Pins the chinese-aesthetic-skill build this design-compiler accepts. Read by the runtime sheet validator and by scripts/verify-binding.mjs; fails closed on any mismatch.
 */
export type SkillBinding = {
  binding_version: "1.0.0";
  contract: {
    name: "AestheticConstraintSheet";
    schema_version: string;
    contract_hash: string;
  };
  source: {
    repository: string;
    commit: string;
  };
  skill: {
    version: string;
    compatible_range: string;
  };
  registry: {
    path: string;
    hash: string;
  };
  provenance: {
    ledger_hash: string;
  };
  policy: {
    confidence_fuse: number;
    allow_dirty_source: boolean;
    fail_closed: true;
  };
};
