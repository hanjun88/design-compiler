#!/usr/bin/env node
/**
 * lock-contract.mjs — governs the AestheticConstraintSheet contract.
 *
 *   --write                regenerate the types file and rewrite contract.lock.json
 *   --check                fail unless schema, generated types and lock agree
 *   --against <git-ref>    additionally fail when the contract hash changed relative to <git-ref>
 *                          without a schema_version bump (use in CI against the base branch)
 *   --json                 machine-readable result on stdout
 *
 * Exit code 0 only when the contract is internally consistent.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONTRACT_DIR, LOCK_FILE, REPO_ROOT, SCHEMA_FILE, TYPES_FILE, canonicalHash, readJson, schemaVersionOf, sha256Hex } from "./lib.mjs";
import { generateTypes } from "./generate-sheet-types.mjs";

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };

export function buildLock(schema, typesText) {
  return {
    contract: "AestheticConstraintSheet",
    schema_version: schemaVersionOf(schema),
    hash_algorithm: "sha256(rfc8785)",
    contract_hash: canonicalHash(schema),
    schema_path: SCHEMA_FILE,
    types_path: TYPES_FILE,
    types_hash: sha256Hex(typesText),
  };
}

/** Pure comparison used by --against and by the unit tests. */
export function compareWithBase(base, current) {
  if (!base) return { ok: true, note: "no base lock (first introduction of the contract)" };
  if (base.contract_hash === current.contract_hash) return { ok: true, note: "contract unchanged" };
  if (base.schema_version === current.schema_version) {
    return { ok: false, note: `contract_hash changed (${base.contract_hash.slice(0, 12)} -> ${current.contract_hash.slice(0, 12)}) but schema_version stayed ${current.schema_version}` };
  }
  return { ok: true, note: `contract changed with a version bump ${base.schema_version} -> ${current.schema_version}` };
}

function main() {
  const schemaPath = join(CONTRACT_DIR, SCHEMA_FILE);
  const typesPath = join(CONTRACT_DIR, TYPES_FILE);
  const lockPath = join(CONTRACT_DIR, LOCK_FILE);
  const schema = readJson(schemaPath);
  const typesText = generateTypes(schema);
  const lock = buildLock(schema, typesText);
  const problems = [];

  if (flag("write")) {
    writeFileSync(typesPath, typesText);
    writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");
    console.log(`wrote ${TYPES_FILE} and ${LOCK_FILE}: schema_version=${lock.schema_version} contract_hash=${lock.contract_hash}`);
    return 0;
  }

  if (!existsSync(lockPath)) problems.push(`${LOCK_FILE} is missing`);
  else {
    const onDisk = readJson(lockPath);
    for (const k of Object.keys(lock)) {
      if (onDisk[k] !== lock[k]) problems.push(`lock.${k}: on disk ${onDisk[k]} != recomputed ${lock[k]}`);
    }
  }
  if (!existsSync(typesPath)) problems.push(`${TYPES_FILE} is missing`);
  else if (readFileSync(typesPath, "utf8") !== typesText) problems.push(`${TYPES_FILE} has drifted from the schema (regenerate with --write)`);

  const against = opt("against");
  let baseNote = null;
  if (against) {
    let baseLock = null;
    try {
      baseLock = JSON.parse(execFileSync("git", ["-C", REPO_ROOT, "show", `${against}:contracts/aesthetic-constraint-sheet/${LOCK_FILE}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
    } catch { /* first introduction */ }
    const cmp = compareWithBase(baseLock, lock);
    baseNote = cmp.note;
    if (!cmp.ok) problems.push(cmp.note);
  }

  const result = { status: problems.length ? "FAIL" : "PASS", schema_version: lock.schema_version, contract_hash: lock.contract_hash, types_hash: lock.types_hash, base: baseNote, problems };
  if (flag("json")) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`${result.status} contract AestheticConstraintSheet ${lock.schema_version} hash ${lock.contract_hash}`);
    if (baseNote) console.log(`  base: ${baseNote}`);
    for (const p of problems) console.error(`  - ${p}`);
  }
  return problems.length ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
