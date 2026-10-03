#!/usr/bin/env node
/**
 * run-gates.mjs — runs every gate once, writes the raw outputs into ./gate-evidence and the summary derived from
 * them. This is what CI runs and what a developer runs before refreshing the README status block.
 *
 *   node scripts/run-gates.mjs [--skill <dir>]      (SKILL_DIR is honoured)
 *
 * A gate that cannot run in this environment is recorded NOT_RUN / BLOCKED_ENV, never PASS.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GATES, JEST_GATE } from "./evidence/gates.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "gate-evidence"); // not ./evidence: that directory holds tracked distillation data
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const extra = process.argv.slice(2);
const skillDir = resolve(extra.includes("--skill") ? extra[extra.indexOf("--skill") + 1] : process.env.SKILL_DIR || join(ROOT, "..", "chinese-aesthetic-skill"));
const results = [];
let failed = false;

function run(g, cmd, args, { allowFail = false } = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", env: { ...process.env, SKILL_DIR: skillDir }, maxBuffer: 1 << 28 });
  const text = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (g.out) writeFileSync(join(OUT, g.out), g.json ? (r.stdout ?? "") : text);
  const ok = r.status === 0;
  results.push({ id: g.id, gate: g.name, status: ok ? "PASS" : "FAIL", command: [cmd, ...args].join(" "), exit_code: r.status });
  console.log(`${ok ? "PASS" : "FAIL"}  ${g.name}`);
  if (!ok && !allowFail) { failed = true; console.log(text.split("\n").slice(-25).join("\n")); }
}

for (const g of GATES) {
  if (g.skill) run(g, "npm", ["test", "--prefix", skillDir]);
  else run(g, g.cmd, g.passArgs && extra.length ? [...g.args, ...extra] : g.args);
}
run({ ...JEST_GATE, out: "jest.txt" }, "npx", ["jest", "--json", `--outputFile=${join(OUT, "jest-results.json")}`], { allowFail: true });
writeFileSync(join(OUT, "gates.json"), JSON.stringify(results, null, 2) + "\n");

const summary = spawnSync("node", ["scripts/evidence/collect.mjs"], { cwd: ROOT, encoding: "utf8" });
process.stdout.write(summary.stdout);
process.stderr.write(summary.stderr);
process.exit(failed || summary.status !== 0 ? 1 : 0);
