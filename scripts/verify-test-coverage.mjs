#!/usr/bin/env node
/**
 * verify-test-coverage.mjs — proves that no test file is silently left out of the run.
 *
 * The set of files jest will execute (`jest --listTests`) must equal the set of
 * `tests/**\/*.test.ts` files on disk, minus the ABI runner (executed by `npm run test:abi`
 * through ts-node because it is a console-driven gate script, not a jest suite).
 * Any file that exists but is not run, or is run but not on disk, fails the gate.
 *
 * Usage: node scripts/verify-test-coverage.mjs [--json]
 */
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ABI_RUNNER = "tests/runner.test.ts";

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const abs = path.join(dir, name);
    if (name === "node_modules") continue;
    if (statSync(abs).isDirectory()) walk(abs, out);
    else if (name.endsWith(".test.ts")) out.push(path.relative(ROOT, abs).split(path.sep).join("/"));
  }
  return out;
}

const onDisk = new Set(walk(path.join(ROOT, "tests")));
const r = spawnSync("npx", ["--no-install", "jest", "--listTests"], { cwd: ROOT, encoding: "utf8" });
if (r.status !== 0) { console.error(r.stderr); process.exit(2); }
const listed = new Set(r.stdout.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => path.relative(ROOT, l).split(path.sep).join("/")));

const expected = new Set([...onDisk].filter((f) => f !== ABI_RUNNER));
const notRun = [...expected].filter((f) => !listed.has(f));
const unexpected = [...listed].filter((f) => !onDisk.has(f));
const runnerIsOnDisk = onDisk.has(ABI_RUNNER);
const pass = notRun.length === 0 && unexpected.length === 0 && runnerIsOnDisk;

const report = { gate: "test-coverage", pass, testFilesOnDisk: onDisk.size, jestSuites: listed.size, abiRunner: ABI_RUNNER, notRun, unexpected };
if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`test files on disk: ${onDisk.size} · run by jest: ${listed.size} · ABI runner: ${runnerIsOnDisk ? ABI_RUNNER : "MISSING"}`);
  for (const f of notRun) console.log(`  NOT RUN: ${f}`);
  for (const f of unexpected) console.log(`  LISTED BUT NOT ON DISK: ${f}`);
  console.log(`test-coverage gate: ${pass ? "PASS" : "FAIL"}`);
}
process.exit(pass ? 0 : 1);
