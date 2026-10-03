#!/usr/bin/env node
/**
 * seal.mjs — the closure evidence record, and the check that anyone can recompute it.
 *
 *   node scripts/evidence/seal.mjs --write     after `node scripts/run-gates.mjs`: write docs/closure/CLOSURE-EVIDENCE.json
 *   node scripts/evidence/seal.mjs --verify    recompute every static hash from the files at HEAD and compare with the record;
 *                                              when ./gate-evidence/summary.json exists (a fresh gate run), also compare the
 *                                              gate statuses and per-area test counts
 *
 * The record holds only what a second person can recompute: sha256 of the contract schemas, the contract lock, the
 * binding, the golden manifest, the closure ledgers and the CI workflow; the skill build the binding pins; and the
 * gate statuses / per-area test counts of the run. It never holds timings, paths or its own commit (a file cannot name
 * the commit that contains it; the record names the pinned skill commit and is bound to the tree by these hashes).
 * `evidence_digest` is the sha256 of the canonical JSON of everything above it.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalHash } from "../contract/lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "docs", "closure", "CLOSURE-EVIDENCE.json");
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const listJson = (dir, suffix) => (existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir)).filter((f) => f.endsWith(suffix)).sort().map((f) => join(dir, f)) : []);

function staticFacts() {
  const files = [
    ...listJson("schemas", ".json"),
    "contracts/aesthetic-constraint-sheet/aesthetic-constraint-sheet.schema.json",
    "contracts/aesthetic-constraint-sheet/contract.lock.json",
    "contracts/binding/binding.schema.json",
    "contracts/binding/binding.json",
    "contracts/provenance-ledger/provenance-ledger.schema.json",
    "contracts/provenance-ledger/contract.lock.json",
    "tests/golden-case-matrix/golden-render-manifest.json",
    ...listJson("docs/closure", ".json").filter((f) => !f.endsWith("CLOSURE-EVIDENCE.json")),
    ".github/workflows/ci.yml",
    "package-lock.json",
  ];
  const lock = readJson(join(ROOT, "contracts/aesthetic-constraint-sheet/contract.lock.json"));
  const schema = readJson(join(ROOT, "contracts/aesthetic-constraint-sheet/aesthetic-constraint-sheet.schema.json"));
  const binding = readJson(join(ROOT, "contracts/binding/binding.json"));
  return {
    contract: { schema_version: lock.schema_version, contract_hash: lock.contract_hash, recomputed_from_schema: canonicalHash(schema) },
    pinned_skill: { repository: binding.source.repository, commit: binding.source.commit, version: binding.skill.version, registry_hash: binding.registry.hash, ledger_hash: binding.provenance.ledger_hash },
    file_sha256: Object.fromEntries(files.filter((f) => existsSync(join(ROOT, f))).map((f) => [f, sha(join(ROOT, f))])),
  };
}

function runFacts() {
  const p = join(ROOT, "gate-evidence", "summary.json");
  if (!existsSync(p)) return null;
  const s = readJson(p);
  return {
    gates: Object.fromEntries(s.gates.map((g) => [g.gate, g.status])),
    areas: Object.fromEntries(Object.entries(s.areas).filter(([, a]) => a.tests > 0).map(([id, a]) => [id, { suites: a.suites, tests: a.tests, passed: a.passed, failed: a.failed, skipped: a.skipped }])),
    total: s.total,
  };
}

const canonical = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
const digestOf = (record) => createHash("sha256").update(canonical(record)).digest("hex");

if (process.argv.includes("--write")) {
  const run = runFacts();
  if (!run) { console.error("gate-evidence/summary.json is missing: run node scripts/run-gates.mjs first"); process.exit(2); }
  const body = { evidence_version: "1.0.0", ...staticFacts(), run };
  writeFileSync(OUT, JSON.stringify({ ...body, evidence_digest: digestOf(body) }, null, 2) + "\n");
  console.log(`wrote ${relative(ROOT, OUT)} digest ${digestOf(body)}`);
} else {
  if (!existsSync(OUT)) { console.error(`${relative(ROOT, OUT)} does not exist`); process.exit(2); }
  const rec = readJson(OUT);
  const { evidence_digest, ...body } = rec;
  const problems = [];
  if (digestOf(body) !== evidence_digest) problems.push("evidence_digest does not match the record's own content");
  const now = staticFacts();
  if (rec.contract.contract_hash !== now.contract.recomputed_from_schema) problems.push(`contract_hash ${rec.contract.contract_hash} != canonical hash of the schema ${now.contract.recomputed_from_schema}`);
  for (const [f, h] of Object.entries(rec.file_sha256)) if (now.file_sha256[f] !== h) problems.push(`${f}: sha256 differs from the record`);
  for (const f of Object.keys(now.file_sha256)) if (!(f in rec.file_sha256)) problems.push(`${f}: not in the record`);
  if (canonical(now.pinned_skill) !== canonical(rec.pinned_skill)) problems.push("pinned skill differs from the record");
  const run = runFacts();
  let rerun = "NOT_RUN";
  if (run) {
    rerun = "COMPARED";
    if (canonical(run.gates) !== canonical(rec.run.gates)) problems.push(`gate statuses differ: record ${canonical(rec.run.gates)} vs run ${canonical(run.gates)}`);
    if (canonical(run.areas) !== canonical(rec.run.areas)) problems.push("per-area test counts differ from the record");
  }
  console.log(`closure evidence: ${Object.keys(rec.file_sha256).length} file hashes recomputed, gate/area re-run ${rerun}`);
  for (const p of problems) console.error(`  - ${p}`);
  console.log(problems.length ? "FAIL" : "PASS");
  process.exitCode = problems.length ? 1 : 0;
}
