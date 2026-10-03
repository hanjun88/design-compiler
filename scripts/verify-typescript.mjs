#!/usr/bin/env node
/**
 * verify-typescript.mjs — zero-error TypeScript gate (replaces the 3-error baseline whitelist).
 *
 * Runs every TypeScript project of the repository independently and requires exit 0 AND zero
 * parsed diagnostics from each. No whitelist: a new error anywhere fails the gate.
 *
 *   production   tsc -p tsconfig.json --noEmit              (compiler-core, compiler-intent, evaluation,
 *                                                            governance, render-engine, toolchain, skills,
 *                                                            chinese-aesthetic, index.ts, contracts)
 *   aesthetic    tsc -p tsconfig.chinese-aesthetic.json     (scoped gate kept for fast local runs)
 *   tests        tsc -p tsconfig.test.json --noEmit         (every tests/**\/*.ts file)
 *
 * Usage: node scripts/verify-typescript.mjs [--json]
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROJECTS = [
  { name: "production", args: ["-p", "tsconfig.json", "--noEmit"] },
  { name: "aesthetic", args: ["-p", "tsconfig.chinese-aesthetic.json", "--noEmit"] },
  { name: "tests", args: ["-p", "tsconfig.test.json", "--noEmit"] },
];
const DIAG = /^(.+?)\((\d+),(\d+)\): (error|warning) (TS\d+): (.*)$/;

const results = [];
for (const p of PROJECTS) {
  const r = spawnSync("npx", ["--no-install", "tsc", ...p.args, "--pretty", "false"], { cwd: ROOT, encoding: "utf8" });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const diagnostics = out.split("\n").map((l) => DIAG.exec(l)).filter(Boolean).map((m) => ({ file: m[1], line: +m[2], col: +m[3], code: m[5], message: m[6] }));
  const pass = r.status === 0 && diagnostics.length === 0;
  results.push({ project: p.name, command: `tsc ${p.args.join(" ")}`, exitCode: r.status, diagnostics: diagnostics.length, pass, detail: diagnostics.slice(0, 20) });
}
const ok = results.every((r) => r.pass);
if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ gate: "typescript-zero-error", pass: ok, results }, null, 2));
} else {
  for (const r of results) {
    console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.project.padEnd(11)} exit=${r.exitCode} diagnostics=${r.diagnostics}  (${r.command})`);
    for (const d of r.detail) console.log(`      ${d.file}(${d.line},${d.col}): ${d.code} ${d.message}`);
  }
  console.log(`\nTypeScript zero-error gate: ${ok ? "PASS" : "FAIL"}`);
}
process.exit(ok ? 0 : 1);
