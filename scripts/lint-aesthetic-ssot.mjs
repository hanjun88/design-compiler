#!/usr/bin/env node
/**
 * lint-aesthetic-ssot.mjs — design-compiler must not define aesthetic numbers.
 *
 * Scope: every file the rule ledger (docs/closure/dispositions/rule-ledger.source.json) assigns to a
 * design-compiler entry (the compiler-side homes of aesthetic thresholds). Inside that scope every
 * threshold-shaped site found by scripts/closure/scan-aesthetic-constants.mjs must either be gone
 * (the number now comes from the skill through the DecisionPack) or carry an inline justification:
 *
 *     // ssot-ok(<CLASS>): <reason of at least 12 characters>
 *
 * on the same line or on the closest preceding non-blank line. <CLASS> names why the number is NOT an
 * aesthetic decision (measurement mechanism, physical safety, numeric guard, ...). Files that exist
 * only to hold migrated thresholds (config/grammar-rules.json) must not exist at all.
 *
 *   node scripts/lint-aesthetic-ssot.mjs [--root <repo>] [--json]
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scan } from "./closure/scan-aesthetic-constants.mjs";

export const CLASSES = new Set([
  "MEASUREMENT_MECHANISM", // how a quantity is measured (kernel sizes, luma cut-offs of an estimator)
  "PHYSICAL_SAFETY",       // bounds that keep arithmetic / geometry physically valid
  "FIDELITY_METRIC",       // fidelity / similarity metrics, not aesthetic judgement
  "CAPABILITY_TIER",       // host capability / degradation tiers
  "EVIDENCE_INTEGRITY",    // evidence completeness / trust requirements
  "SELECTION_MECHANISM",   // which candidate is selected, not what is aesthetic
  "NUMERIC_GUARD",         // epsilons, rounding, division guards
  "PROTOCOL",              // schema versions, array indices, loop bounds
]);
const MARK = /ssot-ok\((\w+)\):\s*(.{12,})/;

const here = dirname(fileURLToPath(import.meta.url));
const globToRe = (g) => new RegExp("^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*") + "$");

export function lint(root, source) {
  const entries = source.entries.filter((e) => e.repo === "design-compiler");
  const res = entries.flatMap((e) => e.files.map(globToRe));
  const sites = scan(root, "dc").filter((s) => !s.comment && res.some((r) => r.test(s.file)));
  const lines = new Map();
  const linesOf = (f) => lines.get(f) ?? (lines.set(f, readFileSync(join(root, f), "utf8").split("\n")), lines.get(f));

  const violations = [];
  let justified = 0;
  const byClass = {};
  for (const s of sites) {
    const L = linesOf(s.file);
    const candidates = [L[s.line - 1]];
    for (let i = s.line - 2; i >= 0; i--) { if (L[i].trim() !== "") { candidates.push(L[i]); break; } }
    const m = candidates.map((c) => MARK.exec(c)).find(Boolean);
    if (m && CLASSES.has(m[1])) { justified++; byClass[m[1]] = (byClass[m[1]] ?? 0) + 1; continue; }
    violations.push({ file: s.file, line: s.line, text: s.text, why: m ? `unknown ssot-ok class ${m[1]}` : "aesthetic-looking literal without a DecisionPack source or ssot-ok justification" });
  }
  // files that exist only to hold migrated aesthetic data
  for (const f of ["config/grammar-rules.json", "chinese-aesthetic/profiles/default.json"]) {
    if (existsSync(join(root, f))) violations.push({ file: f, line: 0, text: "", why: "migrated threshold file must be deleted (its numbers live in the skill registry)" });
  }
  return { scanned_sites: sites.length, justified, justified_by_class: byClass, violations };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = resolve(process.argv.includes("--root") ? process.argv[process.argv.indexOf("--root") + 1] : join(here, ".."));
  const source = JSON.parse(readFileSync(join(root, "docs/closure/dispositions/rule-ledger.source.json"), "utf8"));
  const r = lint(root, source);
  if (process.argv.includes("--json")) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`aesthetic SSOT lint: ${r.scanned_sites} sites in migrated scope, ${r.justified} justified ${JSON.stringify(r.justified_by_class)}, ${r.violations.length} violation(s)`);
    for (const v of r.violations.slice(0, 200)) console.log(`  ${v.file}:${v.line}  ${v.why}${v.text ? `\n      ${v.text}` : ""}`);
    if (r.violations.length > 200) console.log(`  ... ${r.violations.length - 200} more`);
  }
  process.exitCode = r.violations.length ? 1 : 0; // not process.exit(): piped stdout (--json) must flush
}
