/**
 * Shared helpers for the AestheticConstraintSheet contract tooling.
 *
 * contract_hash = sha256( RFC 8785 canonical form of the schema document ).
 * The same canonical form is used for every provenance hash in the pipeline.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import canonicalize from "canonicalize";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
/** CONTRACT_DIR_OVERRIDE lets the test-suite point the tooling at a tampered copy; never set it in CI. */
export const CONTRACT_DIR = process.env.CONTRACT_DIR_OVERRIDE ?? join(REPO_ROOT, "contracts", "aesthetic-constraint-sheet");
export const SCHEMA_FILE = "aesthetic-constraint-sheet.schema.json";
export const TYPES_FILE = "aesthetic-constraint-sheet.types.ts";
export const LOCK_FILE = "contract.lock.json";

export const sha256Hex = (data) => createHash("sha256").update(data).digest("hex");
export const canonicalHash = (value) => sha256Hex(canonicalize(value));

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Contract version is carried by the schema `$id` suffix: urn:...:aesthetic-constraint-sheet:<semver>. */
export function schemaVersionOf(schema) {
  const m = /:(\d+\.\d+\.\d+)$/.exec(schema.$id ?? "");
  if (!m) throw new Error(`schema $id does not end with a semver: ${schema.$id}`);
  return m[1];
}
