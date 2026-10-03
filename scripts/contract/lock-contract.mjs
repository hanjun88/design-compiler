#!/usr/bin/env node
/**
 * lock-contract.mjs — governs every machine contract of this repository (see CONTRACTS in lib.mjs).
 *
 *   --write                regenerate the types file(s) and rewrite contract.lock.json
 *   --check                fail unless schema, generated types and lock agree (default)
 *   --against <git-ref>    additionally fail when a contract_hash changed relative to <git-ref>
 *                          without a schema_version bump (use in CI against the base branch)
 *   --contract <name>      restrict to one contract
 *   --json                 machine-readable result on stdout
 *
 * Exit code 0 only when every contract is internally consistent.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONTRACTS, LOCK_FILE, REPO_ROOT, canonicalHash, contractDir, readJson, schemaVersionOf, sha256Hex } from "./lib.mjs";
import { generateTypes } from "./generate-types.mjs";

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };

export function buildLock(contract, schema, typesText) {
  return {
    contract: contract.title,
    schema_version: schemaVersionOf(schema),
    hash_algorithm: "sha256(rfc8785)",
    contract_hash: canonicalHash(schema),
    schema_path: contract.schemaFile,
    types_path: contract.typesFile,
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

function baseLockOf(contract, ref) {
  try {
    return JSON.parse(execFileSync("git", ["-C", REPO_ROOT, "show", `${ref}:contracts/${contract.name}/${LOCK_FILE}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } catch {
    return null; // first introduction
  }
}

function main() {
  const only = opt("contract");
  const against = opt("against");
  const results = [];
  let failed = false;

  for (const c of CONTRACTS.filter((x) => !only || x.name === only)) {
    const dir = contractDir(c);
    const schema = readJson(join(dir, c.schemaFile));
    const typesText = generateTypes(schema, c);
    const lock = buildLock(c, schema, typesText);
    const problems = [];

    if (flag("write")) {
      writeFileSync(join(dir, c.typesFile), typesText);
      writeFileSync(join(dir, LOCK_FILE), JSON.stringify(lock, null, 2) + "\n");
      console.log(`wrote ${c.typesFile} and ${LOCK_FILE} (${c.name}): schema_version=${lock.schema_version} contract_hash=${lock.contract_hash}`);
      continue;
    }

    const lockPath = join(dir, LOCK_FILE);
    if (!existsSync(lockPath)) problems.push(`${c.name}: ${LOCK_FILE} is missing`);
    else {
      const onDisk = readJson(lockPath);
      for (const k of Object.keys(lock)) if (onDisk[k] !== lock[k]) problems.push(`${c.name}: lock.${k}: on disk ${onDisk[k]} != recomputed ${lock[k]}`);
    }
    const typesPath = join(dir, c.typesFile);
    if (!existsSync(typesPath)) problems.push(`${c.name}: ${c.typesFile} is missing`);
    else if (readFileSync(typesPath, "utf8") !== typesText) problems.push(`${c.name}: ${c.typesFile} has drifted from the schema (regenerate with --write)`);

    let baseNote = null;
    if (against) {
      const cmp = compareWithBase(baseLockOf(c, against), lock);
      baseNote = cmp.note;
      if (!cmp.ok) problems.push(`${c.name}: ${cmp.note}`);
    }
    if (problems.length) failed = true;
    results.push({ contract: c.name, status: problems.length ? "FAIL" : "PASS", schema_version: lock.schema_version, contract_hash: lock.contract_hash, types_hash: lock.types_hash, base: baseNote, problems });
  }

  if (flag("write")) return 0;
  if (flag("json")) console.log(JSON.stringify({ status: failed ? "FAIL" : "PASS", contracts: results }, null, 2));
  else {
    for (const r of results) {
      console.log(`${r.status} contract ${r.contract} ${r.schema_version} hash ${r.contract_hash}`);
      if (r.base) console.log(`  base: ${r.base}`);
      for (const p of r.problems) console.error(`  - ${p}`);
    }
  }
  return failed ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
