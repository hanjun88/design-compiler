#!/usr/bin/env node
/**
 * lint-docs.mjs — living documentation may not state numbers the machine owns.
 *
 *   1. Test counts and "all green" claims appear only inside the generated evidence block of README.md
 *      (<!-- evidence:begin --> ... <!-- evidence:end -->, written by scripts/evidence/readme-status.mjs).
 *   2. Chinese-aesthetic thresholds are owned by the skill's rule registry (rules/); documents of this
 *      repository refer to a rule_id instead of restating a magnitude. A document that restates a ratio next to
 *      aesthetic vocabulary (negative space, 留白, saturation, ...) is a second, unverifiable copy of a rule.
 *
 * Scope: documents that describe the repository as it is now. Dated records (docs/closure, docs/audit,
 * docs/PHASE*, step6-a, reports, ADRs) are history and are not linted.
 *
 *   node scripts/lint-docs.mjs [--json]
 */
import { fileURLToPath } from "node:url";
import { dirname as pathDirname } from "node:path";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const HERE = pathDirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const LIVING = [
  "README.md",
  "contracts/README.md",
  "chinese-aesthetic/README.md",
  "chinese-aesthetic/docs",
  "governance",
  "skill-bridge",
  "skills/grammars",
];
const SKIP_DIR = new Set(["node_modules", ".git", "dist", ".claude", ".cursor", ".trellis"]);

function* walk(p) {
  const abs = join(ROOT, p);
  if (!existsSync(abs)) return;
  const st = statSync(abs);
  if (st.isFile()) { if (abs.endsWith(".md")) yield abs; return; }
  for (const e of readdirSync(abs)) {
    if (SKIP_DIR.has(e)) continue;
    yield* walk(join(p, e));
  }
}

const COUNT_CLAIMS = [
  /\b\d+\s*(?:\/\s*\d+\s*)?(?:tests?|specs?|test cases)\b/i,
  /\d+\s*(?:项|个)\s*(?:契约|单元|集成|端到端)?\s*(?:测试|用例)/,
  /\b\d+\s*\/\s*\d+\s*(?:passed|green|通过|全绿|PASS)\b/i,
  /全绿|all green|all tests pass/i,
  /\b\d+\s+passed\b/i,
];
const AESTHETIC_WORDS = /(negative[- ]space|void[- ]ratio|留白|虚实|计白当黑|saturation|饱和度|roughness|粗糙度|symmetry|对称|horizon|视平线|contrast ratio|accent|点缀)/i;
const RATIO = /(?<![\w.])(?:0?\.\d{2,}|\d{1,3}\s?%)(?![\w.])/;
const ALLOW = /<!--\s*docs-ok\b/;

export function lintDocs() {
  const problems = [];
  for (const p of LIVING) {
    for (const file of walk(p)) {
      const rel = relative(ROOT, file).split("\\").join("/");
      let inEvidence = false;
      let inFence = false;
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        if (line.includes("<!-- evidence:begin -->")) inEvidence = true;
        if (line.trimStart().startsWith("```")) inFence = !inFence;
        const at = `${rel}:${i + 1}`;
        if (!inEvidence && !ALLOW.test(line)) {
          for (const re of COUNT_CLAIMS) if (re.test(line)) { problems.push(`${at}: hand-written test count / green claim: ${line.trim().slice(0, 100)}`); break; }
          if (!inFence && AESTHETIC_WORDS.test(line) && RATIO.test(line)) problems.push(`${at}: restates an aesthetic magnitude (owned by the skill registry; cite a rule_id instead): ${line.trim().slice(0, 100)}`);
        }
        if (line.includes("<!-- evidence:end -->")) inEvidence = false;
      });
    }
  }
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const problems = lintDocs();
  if (process.argv.includes("--json")) console.log(JSON.stringify({ status: problems.length ? "FAIL" : "PASS", problems }, null, 2));
  else {
    for (const p of problems) console.error(`  - ${p}`);
    console.log(`docs lint: ${problems.length ? "FAIL" : "PASS"} (${problems.length} problem${problems.length === 1 ? "" : "s"})`);
  }
  process.exit(problems.length ? 1 : 0);
}
