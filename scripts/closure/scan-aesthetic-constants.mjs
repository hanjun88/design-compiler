#!/usr/bin/env node
/**
 * scan-aesthetic-constants.mjs — enumerate every site where an aesthetic numeric
 * constant (threshold, band, clamp, repair target) is defined in a repository.
 *
 * Purpose: raw material for docs/closure/RULE-LEDGER.json and the input of the
 * SSOT lint (scripts/closure/lint-aesthetic-ssot.mjs). It is deliberately
 * pattern-based (no AST): a site is *any* line that matches a threshold-shaped
 * pattern inside the configured aesthetic scopes. Sites that are not aesthetic
 * (math, rounding, physical safety) are classified in the ledger, not hidden here.
 *
 * Usage: node scripts/closure/scan-aesthetic-constants.mjs <repo-root> [--profile dc|skill] [--json]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const PROFILES = {
  dc: {
    include: [
      "chinese-aesthetic",
      "config",
      "compiler-core/scoring.ts",
      "evaluation",
      "compiler-intent/pointer-map.ts",
      "compiler-core/patch-engine.ts",
    ],
    exclude: [
      "chinese-aesthetic/scene-pack/fixtures",
      "chinese-aesthetic/diagnostic-assets",
      "chinese-aesthetic/docs",
    ],
    exts: new Set([".ts", ".json"]),
  },
  skill: {
    include: ["lib", "guidelines", "README.md", "SKILL.md", "skill.yaml", "modules", "playbooks"],
    exclude: ["modules/extracted"],
    exts: new Set([".js", ".json", ".md", ".yaml"]),
  },
};

// Threshold-shaped patterns. Each returns a "kind" used for grouping in the ledger.
const PATTERNS = [
  ["compare", /(?:<=|>=|===|!==|<|>)\s*-?\d+(?:\.\d+)?(?![\w.]*\()/],
  ["clamp", /clamp\([^)]*\d/],
  ["range-prop", /\b(?:min|max|floor|ceil|lower|upper|threshold|ratio|target|bias)\w*\s*[:=]\s*-?\d+(?:\.\d+)?/i],
  ["percent", /(?:≥|≤|>=|<=|<|>)\s*\d+(?:\.\d+)?\s*%/],
  ["json-number", /"[A-Za-z_][\w]*"\s*:\s*-?\d+\.\d+/],
  ["pair", /\[\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\]/],
];

function walk(root, rel, profile, out) {
  const abs = join(root, rel);
  let st;
  try { st = statSync(abs); } catch { return; }
  if (profile.exclude.some((e) => rel === e || rel.startsWith(e + "/"))) return;
  if (st.isDirectory()) {
    if (rel.endsWith("node_modules") || rel.endsWith(".git")) return;
    for (const name of readdirSync(abs).sort()) walk(root, join(rel, name), profile, out);
  } else if (profile.exts.has(extname(rel))) {
    out.push(rel);
  }
}

export function scan(root, profileName) {
  const profile = PROFILES[profileName];
  if (!profile) throw new Error(`unknown profile ${profileName}`);
  const files = [];
  for (const inc of profile.include) walk(root, inc, profile, files);
  const sites = [];
  for (const f of files) {
    const lines = readFileSync(join(root, f), "utf8").split("\n");
    lines.forEach((text, i) => {
      const trimmed = text.trim();
      const isComment = /^(\/\/|\*|\/\*|#|<!--)/.test(trimmed);
      for (const [kind, re] of PATTERNS) {
        if (re.test(text)) {
          sites.push({ file: f, line: i + 1, kind, comment: isComment, text: trimmed.slice(0, 200) });
          break;
        }
      }
    });
  }
  return sites;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.argv[2];
  const profileName = process.argv.includes("--profile") ? process.argv[process.argv.indexOf("--profile") + 1] : "dc";
  if (!root) { console.error("usage: scan-aesthetic-constants.mjs <repo-root> [--profile dc|skill] [--json]"); process.exit(2); }
  const sites = scan(root, profileName);
  if (process.argv.includes("--json")) {
    process.stdout.write(JSON.stringify({ profile: profileName, count: sites.length, sites }, null, 2) + "\n");
  } else {
    const byFile = new Map();
    for (const s of sites) byFile.set(s.file, (byFile.get(s.file) ?? 0) + 1);
    console.log(`profile=${profileName} sites=${sites.length} files=${byFile.size}`);
    for (const [f, n] of [...byFile].sort((a, b) => b[1] - a[1])) console.log(String(n).padStart(5), f);
  }
}
