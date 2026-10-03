#!/usr/bin/env node
/**
 * collect.mjs — turns raw gate output into the evidence summary every status claim is derived from.
 *
 *   node scripts/evidence/collect.mjs [--dir evidence]
 *
 * Reads <dir>/jest-results.json (jest --json) and any of typescript.json / binding.json / contract.json /
 * ssot-lint.json / golden.txt / abi.txt that exist; writes <dir>/summary.json with
 *   - per-area test counts (suites / tests / passed / failed / skipped) derived from the jest result file paths,
 *   - the status of each gate in the vocabulary PASS | FAIL | BLOCKED_ENV | NOT_RUN (nothing self-reported),
 *   - the sha256 of every evidence file, so the summary can be recomputed and re-checked byte for byte.
 * Fails when a required area ran zero tests: a silently empty area is not a pass.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const dir = resolve(process.argv.includes("--dir") ? process.argv[process.argv.indexOf("--dir") + 1] : "evidence");
const ROOT = resolve(import.meta.dirname, "..", "..");

export const AREAS = [
  { id: "contract", label: "Core contract (ABI, hash flow, patch engine, pipeline)", test: (f) => f.startsWith("tests/contract/"), required: true },
  { id: "intent", label: "Intent normalisation", test: (f) => f.startsWith("tests/intent/"), required: true },
  { id: "aesthetic", label: "Aesthetic line (evidence, graph, operators, plan, adapter, scene pack, runtime)", test: (f) => f.startsWith("tests/chinese-aesthetic/"), required: true },
  { id: "golden", label: "Golden matrix (six cells executed through the real chain)", test: (f) => f.startsWith("tests/golden-case-matrix/"), required: true },
  { id: "cross-repo", label: "Skill → compiler chain, binding, rollback, adversarial", test: (f) => f.startsWith("tests/skill-bridge/"), required: true },
  { id: "render", label: "Render / video e2e", test: (f) => f === "tests/e2e-video-motion.test.ts" || f.startsWith("tests/golden/"), required: false },
];

const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const readJson = (name) => { const p = join(dir, name); return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null; };

export function summarize() {
  const jest = readJson("jest-results.json");
  const areas = Object.fromEntries(AREAS.map((a) => [a.id, { label: a.label, suites: 0, tests: 0, passed: 0, failed: 0, skipped: 0 }]));
  areas.other = { label: "Other suites", suites: 0, tests: 0, passed: 0, failed: 0, skipped: 0 };
  if (jest) {
    for (const suite of jest.testResults) {
      const rel = relative(ROOT, suite.name).split("\\").join("/");
      const area = AREAS.find((a) => a.test(rel))?.id ?? "other";
      const a = areas[area];
      a.suites++;
      for (const t of suite.assertionResults) {
        a.tests++;
        if (t.status === "passed") a.passed++;
        else if (t.status === "failed") a.failed++;
        else a.skipped++;
      }
      if (suite.assertionResults.length === 0 && suite.status === "failed") { a.failed++; a.tests++; }
    }
  }
  const total = Object.values(areas).reduce((s, a) => ({ suites: s.suites + a.suites, tests: s.tests + a.tests, passed: s.passed + a.passed, failed: s.failed + a.failed, skipped: s.skipped + a.skipped }), { suites: 0, tests: 0, passed: 0, failed: 0, skipped: 0 });

  const gate = (name, file, decide) => {
    const j = readJson(file);
    if (!j) return { gate: name, status: "NOT_RUN" };
    return { gate: name, status: decide(j) };
  };
  const gates = [
    { gate: "jest", status: !jest ? "NOT_RUN" : jest.success && total.failed === 0 ? "PASS" : "FAIL" },
    gate("typescript-zero-error", "typescript.json", (j) => (j.pass ? "PASS" : "FAIL")),
    gate("skill-binding", "binding.json", (j) => j.status),
    gate("contract-lock", "contract.json", (j) => j.status),
    gate("aesthetic-ssot-lint", "ssot-lint.json", (j) => (j.violations.length === 0 ? "PASS" : "FAIL")),
  ];
  const missing = AREAS.filter((a) => a.required && jest && areas[a.id].tests === 0).map((a) => a.id);
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f !== "summary.json").sort() : [];
  return {
    summary_version: "1.0.0",
    jest: jest ? { numTotalTests: jest.numTotalTests, numPassedTests: jest.numPassedTests, numFailedTests: jest.numFailedTests, numTotalTestSuites: jest.numTotalTestSuites } : null,
    areas,
    total,
    gates,
    empty_required_areas: missing,
    evidence_files: Object.fromEntries(files.map((f) => [f, sha(join(dir, f))])),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = summarize();
  writeFileSync(join(dir, "summary.json"), JSON.stringify(s, null, 2) + "\n");
  console.log(`evidence: ${s.total.tests} tests in ${s.total.suites} suites (${s.total.passed} passed, ${s.total.failed} failed, ${s.total.skipped} skipped)`);
  for (const [id, a] of Object.entries(s.areas)) if (a.tests) console.log(`  ${id.padEnd(10)} ${String(a.tests).padStart(5)} tests / ${a.suites} suites`);
  for (const g of s.gates) console.log(`  ${g.gate.padEnd(24)} ${g.status}`);
  if (s.empty_required_areas.length) { console.error(`required areas ran no tests: ${s.empty_required_areas.join(", ")}`); process.exit(1); }
  process.exit(s.total.failed > 0 || s.gates.some((g) => g.status === "FAIL") ? 1 : 0);
}
