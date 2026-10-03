#!/usr/bin/env node
/**
 * run-gates.mjs — runs every gate once, writes the raw outputs into ./evidence and the summary derived from
 * them. This is what CI runs and what a developer runs before refreshing the README status block.
 *
 *   node scripts/run-gates.mjs [--skill <dir>]      (SKILL_DIR is honoured)
 *
 * A gate that cannot run in this environment is recorded NOT_RUN / BLOCKED_ENV, never PASS.
 */
import { fileURLToPath } from "node:url";
import { dirname as pathDirname } from "node:path";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const HERE = pathDirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const OUT = join(ROOT, "evidence");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
let failed = false;

function step(name, cmd, args, { out, json = false, allowFail = false } = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", env: process.env, maxBuffer: 1 << 28 });
  const text = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (out) writeFileSync(join(OUT, out), json ? (r.stdout ?? "") : text);
  const ok = r.status === 0;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok && !allowFail) { failed = true; console.log(text.split("\n").slice(-25).join("\n")); }
  return ok;
}

step("typescript zero-error", "node", ["scripts/verify-typescript.mjs", "--json"], { out: "typescript.json", json: true });
step("build", "npx", ["tsc", "-p", "tsconfig.json"], { out: "build.txt" });
step("schema validation", "node", ["scripts/validate-schemas.mjs"], { out: "schemas.txt" });
step("contract lock", "node", ["scripts/contract/lock-contract.mjs", "--check", "--json"], { out: "contract.json", json: true });
step("aesthetic SSOT lint", "node", ["scripts/lint-aesthetic-ssot.mjs", "--json"], { out: "ssot-lint.json", json: true });
step("test coverage gate", "node", ["scripts/verify-test-coverage.mjs"], { out: "test-coverage.txt" });
step("skill binding", "npx", ["ts-node", "--project", "tsconfig.test.json", "scripts/binding/verify-binding.ts", "--json", ...process.argv.slice(2)], { out: "binding.json", json: true });
step("golden manifest current", "npx", ["ts-node", "--project", "tsconfig.test.json", "scripts/golden/reseal.ts", "--check"], { out: "golden.txt" });
step("ABI runner", "npx", ["ts-node", "--project", "tsconfig.test.json", "tests/runner.test.ts"], { out: "abi.txt" });
step("jest (all suites)", "npx", ["jest", "--json", `--outputFile=${join(OUT, "jest-results.json")}`], { out: "jest.txt", allowFail: true });
const summary = spawnSync("node", ["scripts/evidence/collect.mjs"], { cwd: ROOT, encoding: "utf8" });
process.stdout.write(summary.stdout);
process.stderr.write(summary.stderr);
process.exit(failed || summary.status !== 0 ? 1 : 0);
