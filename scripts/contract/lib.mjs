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
export const LOCK_FILE = "contract.lock.json";

/**
 * Every machine contract owned by this repository. One schema per contract; the TypeScript types
 * are generated from it and guarded by the lock (version + hash + types hash).
 * CONTRACT_DIR_OVERRIDE (+ --contract) lets the test-suite point the tooling at a tampered copy of
 * one contract; never set it in CI.
 */
export const CONTRACTS = [
  { name: "aesthetic-constraint-sheet", schemaFile: "aesthetic-constraint-sheet.schema.json", typesFile: "aesthetic-constraint-sheet.types.ts", title: "AestheticConstraintSheet", extras: "sheet" },
  { name: "binding", schemaFile: "binding.schema.json", typesFile: "binding.types.ts", title: "SkillBinding" },
  { name: "provenance-ledger", schemaFile: "provenance-ledger.schema.json", typesFile: "provenance-ledger.types.ts", title: "ProvenanceLedger" },
].map((c) => ({ ...c, dir: join(REPO_ROOT, "contracts", c.name) }));

export function contractDir(c) {
  return process.env.CONTRACT_DIR_OVERRIDE && c.name === (process.env.CONTRACT_NAME ?? "aesthetic-constraint-sheet") ? process.env.CONTRACT_DIR_OVERRIDE : c.dir;
}

export const sha256Hex = (data) => createHash("sha256").update(data).digest("hex");
export const canonicalHash = (value) => sha256Hex(canonicalize(value));

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Contract version is carried by the schema `$id` suffix: urn:...:<contract>:<semver>. */
export function schemaVersionOf(schema) {
  const m = /:(\d+\.\d+\.\d+)$/.exec(schema.$id ?? "");
  if (!m) throw new Error(`schema $id does not end with a semver: ${schema.$id}`);
  return m[1];
}
