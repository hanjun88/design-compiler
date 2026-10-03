/**
 * Loader for the AestheticConstraintSheet contract owned by this repository.
 *
 * The schema file is the contract. contract.lock.json pins its hash; at first use the hash is
 * recomputed from the schema bytes on disk, so a schema edited without relocking (or a lock
 * edited by hand) makes every sheet fail closed instead of being validated against drifted rules.
 */
import schema from "../contracts/aesthetic-constraint-sheet/aesthetic-constraint-sheet.schema.json";
import lock from "../contracts/aesthetic-constraint-sheet/contract.lock.json";
import { canonicalSha256 } from "./hash";

export const SHEET_SCHEMA = schema;
export const CONTRACT_LOCK = lock as {
  contract: string;
  schema_version: string;
  hash_algorithm: string;
  contract_hash: string;
  schema_path: string;
  types_path: string;
  types_hash: string;
};

/**
 * Capabilities this compiler can honour. A sheet that requires anything outside this set is
 * rejected (capability negotiation happens before compilation, not during it).
 * The version suffix is the capability's own revision.
 */
export const SUPPORTED_CAPABILITIES: readonly string[] = Object.freeze([
  "cap.constraint.parameter-band@1",
  "cap.constraint.grammar-rule@1",
  "cap.constraint.operation-policy@1",
  "cap.constraint.anti-pattern-threshold@1",
  "cap.constraint.evaluation-assertion@1",
  "cap.constraint.priority-order@1",
  "cap.constraint.scoring-weights@1",
  "cap.hash.rfc8785-sha256@1",
  "cap.pointer.core-ir@1",
]);

export class ContractIntegrityError extends Error {
  constructor(message: string) {
    super(`AestheticConstraintSheet contract integrity: ${message}`);
    this.name = "ContractIntegrityError";
  }
}

let verified: string | null = null;

/** Recompute the schema hash and compare with the lock. Cached after the first success. */
export function verifiedContractHash(): string {
  if (verified) return verified;
  const computed = canonicalSha256(schema);
  if (computed !== CONTRACT_LOCK.contract_hash) {
    throw new ContractIntegrityError(`schema hash ${computed} does not match contract.lock.json ${CONTRACT_LOCK.contract_hash}`);
  }
  const idVersion = /:(\d+\.\d+\.\d+)$/.exec(schema.$id)?.[1];
  if (idVersion !== CONTRACT_LOCK.schema_version) {
    throw new ContractIntegrityError(`schema $id version ${idVersion} does not match lock schema_version ${CONTRACT_LOCK.schema_version}`);
  }
  verified = computed;
  return computed;
}
