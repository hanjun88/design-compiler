#!/usr/bin/env node
/**
 * rule-ledger.mjs — builds docs/closure/RULE-LEDGER.{json,md}.
 *
 * Every threshold-shaped site found by scan-aesthetic-constants.mjs in BOTH repositories
 * must be covered either by an out-of-scope file class (with a stated reason) or by a
 * ledger entry carrying one of the four dispositions. Anything uncovered fails the build:
 * "no unclassified aesthetic constant" is enforced, not asserted.
 *
 * Usage:
 *   node scripts/closure/rule-ledger.mjs --dc <path> --skill <path> --source <rule-ledger.source.json> \
 *        [--out <json>] [--md <md>]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";
import { scan } from "./scan-aesthetic-constants.mjs";
import { lint as ssotLint } from "../lint-aesthetic-ssot.mjs";

function arg(n, d) { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; }
const dc = arg("dc"), skill = arg("skill"), src = arg("source");
if (!dc || !skill || !src) { console.error("usage: rule-ledger.mjs --dc <p> --skill <p> --source <f> [--out f] [--md f]"); process.exit(2); }

const globToRe = (g) => new RegExp("^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*") + "$");
const source = JSON.parse(readFileSync(src, "utf8"));
const sha = (p) => { try { return execFileSync("git", ["-C", p, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { return null; } };

const repos = [
  { name: "design-compiler", path: dc, profile: "dc" },
  { name: "chinese-aesthetic-skill", path: skill, profile: "skill" },
];

const classRes = source.file_classes.map((c) => ({ ...c, re: globToRe(c.glob), exRes: (c.exceptions ?? []).map(globToRe) }));
const entryRes = source.entries.map((e) => ({ ...e, res: e.files.map(globToRe) }));

const result = { ledger_version: source.ledger_version, baseline: {}, summary: {}, classes: {}, entries: [], uncovered: [] };
const bucketSites = new Map(); // key -> sites
for (const repo of repos) {
  result.baseline[repo.name] = { path: repo.name, head: sha(repo.path) };
  const sites = scan(repo.path, repo.profile).filter((s) => !s.comment);
  for (const s of sites) {
    let key = null;
    const entry = entryRes.find((e) => e.repo === repo.name && e.res.some((r) => r.test(s.file)));
    if (entry) key = `entry:${entry.id}`;
    else {
      const cls = classRes.find((c) => c.repo === repo.name && c.re.test(s.file) && !c.exRes.some((r) => r.test(s.file)));
      if (cls) key = `class:${cls.class}`;
    }
    if (!key) { result.uncovered.push({ repo: repo.name, file: s.file, line: s.line, text: s.text }); continue; }
    if (!bucketSites.has(key)) bucketSites.set(key, []);
    bucketSites.get(key).push({ repo: repo.name, file: s.file, line: s.line, kind: s.kind });
  }
}
for (const [key, sites] of bucketSites) {
  if (key.startsWith("class:")) {
    const c = key.slice(6);
    result.classes[c] = { reason: source.out_of_scope_classes[c], sites: sites.length, files: [...new Set(sites.map((s) => s.file))].length };
  }
}
// Closure is DERIVED, never declared: compiler-side entries are closed when the SSOT lint finds no unjustified
// aesthetic literal in their files; skill-side entries when the engine-threshold lint (lib/) and the docs lint pass;
// every conflict an entry names must be a RESOLVED row of the skill's checkable conflict ledger.
const dcLint = ssotLint(dc, source);
const skillScript = (name, ...a) => {
  const f = join(skill, "scripts", name);
  if (!existsSync(f)) return null;
  const r = spawnSync("node", [f, ...a], { cwd: skill, encoding: "utf8" });
  try { return JSON.parse(r.stdout); } catch { return { ok: r.status === 0, problems: [(r.stderr || r.stdout || "").slice(0, 200)] }; }
};
const engineLint = skillScript("lint-engine-thresholds.mjs", "--json");
const docsLint = skillScript("lint-docs.mjs", "--json");
const conflicts = skillScript("lint-conflicts.mjs", "--json");
const conflictIds = existsSync(join(skill, "docs/closure/THRESHOLD-CONFLICTS.json")) ? new Set(JSON.parse(readFileSync(join(skill, "docs/closure/THRESHOLD-CONFLICTS.json"), "utf8")).entries.map((x) => x.id)) : new Set();
const conflictsOk = conflicts ? conflicts.ok === true : false;
const familyRules = (canonical) => {
  const tokens = [...new Set((canonical.match(/\b(?:CAS-[A-Z]{2,3}(?:-[A-Z0-9]+)*|CA-RULE|ANTI-AI)\b/g) ?? []))];
  const fams = [];
  let n = 0;
  for (const t of tokens) {
    const family = t.split("-").slice(0, t.startsWith("CA-RULE") || t.startsWith("ANTI-AI") ? 2 : 2).join("-");
    const p = join(skill, "rules", "families", `${family}.json`);
    if (!existsSync(p)) continue;
    const rules = JSON.parse(readFileSync(p, "utf8")).rules;
    if (t === family) { fams.push(family); n += rules.length; } else if (rules.some((r) => r.rule_id === t)) { fams.push(t); n += 1; }
  }
  return { families: fams, rules: n };
};
const violationsIn = (list, res) => list.filter((v) => res.some((r) => r.test(v.file))).length;

for (const e of source.entries) {
  const sites = bucketSites.get(`entry:${e.id}`) ?? [];
  const res = e.files.map(globToRe);
  let closure;
  if (e.repo === "design-compiler") {
    const unjustified = violationsIn(dcLint.violations, res);
    const reg = familyRules(e.canonical ?? "");
    closure = { unjustified_sites: unjustified, registry: reg, conflicts_resolved: (e.conflicts ?? []).every((id) => conflictIds.has(id)) && conflictsOk };
    closure.status = e.disposition === "DELETE_DUPLICATE" ? (unjustified === 0 ? "CLOSED" : "OPEN") : unjustified === 0 && reg.rules > 0 && closure.conflicts_resolved ? "CLOSED" : "OPEN";
  } else if (e.id === "RL-SK-ENGINES") {
    const unjustified = engineLint ? (engineLint.violations?.length ?? 1) : null;
    closure = { unjustified_sites: unjustified, conflicts_resolved: conflictsOk, status: unjustified === 0 && conflictsOk ? "CLOSED" : "OPEN" };
  } else {
    const problems = docsLint ? (docsLint.problems?.length ?? (docsLint.ok === false ? 1 : 0)) : null;
    closure = { docs_lint_problems: problems, conflicts_resolved: (e.conflicts ?? []).every((id) => conflictIds.has(id)) && conflictsOk, status: problems === 0 && (e.conflicts ?? []).every((id) => conflictIds.has(id)) && conflictsOk ? "CLOSED" : "OPEN" };
  }
  result.entries.push({
    id: e.id, repo: e.repo, disposition: e.disposition, concept: e.concept, canonical: e.canonical,
    conflicts: e.conflicts ?? [], runtime: e.runtime ?? null, docs: e.docs ?? null,
    files: e.files, sites: sites.length, status: closure.status, closure,
  });
}
const byDisp = {};
for (const e of result.entries) byDisp[e.disposition] = (byDisp[e.disposition] ?? 0) + e.sites;
result.summary = {
  total_sites: [...bucketSites.values()].reduce((a, b) => a + b.length, 0),
  uncovered_sites: result.uncovered.length,
  sites_by_disposition: byDisp,
  sites_out_of_scope: Object.fromEntries(Object.entries(result.classes).map(([k, v]) => [k, v.sites])),
};

const out = arg("out"), md = arg("md");
if (out) writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
if (md) {
  const L = [];
  L.push("# Rule ledger", "", "Generated by `scripts/closure/rule-ledger.mjs` from a live scan of both repositories; do not edit by hand.", "");
  L.push(`Generated at: design-compiler \`${(result.baseline["design-compiler"].head ?? "").slice(0, 10)}\` · chinese-aesthetic-skill \`${(result.baseline["chinese-aesthetic-skill"].head ?? "").slice(0, 10)}\``, "");
  L.push(`Sites scanned: **${result.summary.total_sites}** · uncovered: **${result.summary.uncovered_sites}**`, "");
  L.push("## Dispositions", "", ...Object.entries(source.dispositions).map(([k, v]) => `- **${k}** — ${v}`), "");
  const open = result.entries.filter((e) => e.status !== "CLOSED");
  L.push(`Entries: **${result.entries.length}** · closed: **${result.entries.length - open.length}** · open: **${open.length}**${open.length ? ` (${open.map((e) => e.id).join(", ")})` : ""}`, "");
  L.push("Closure is derived from the live lints (compiler-side: SSOT lint + registry coverage; skill-side: engine-threshold lint, docs lint) and from the threshold-conflict ledger (docs/closure/THRESHOLD-CONFLICTS.* in the skill); nothing here is declared by hand.", "");
  L.push("## Entries", "", "| id | repo | disposition | status | sites now | canonical home | conflicts (resolved in the skill's conflict ledger) |", "|---|---|---|---|---|---|---|");
  for (const e of result.entries) L.push(`| \`${e.id}\` | ${e.repo} | **${e.disposition}** | **${e.status}** | ${e.sites} (unjustified: ${e.closure.unjustified_sites ?? e.closure.docs_lint_problems ?? "n/a"}) | ${e.canonical} | ${e.conflicts.length ? e.conflicts.join(", ") : "—"} |`);
  L.push("", "## Out of scope (stays in design-compiler / not aesthetic)", "", "| class | sites | files | reason |", "|---|---|---|---|");
  for (const [k, v] of Object.entries(result.classes)) L.push(`| ${k} | ${v.sites} | ${v.files} | ${v.reason} |`);
  writeFileSync(md, L.join("\n") + "\n");
}
console.log(`sites=${result.summary.total_sites} uncovered=${result.summary.uncovered_sites} entries=${result.entries.length}`);
if (result.uncovered.length) {
  for (const u of result.uncovered.slice(0, 40)) console.error(`UNCOVERED ${u.repo}:${u.file}:${u.line}: ${u.text}`);
  process.exit(1);
}
