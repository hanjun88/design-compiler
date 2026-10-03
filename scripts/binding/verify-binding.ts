/**
 * verify-binding — CI gate. Fails closed unless a checkout of the pinned skill reproduces the pin:
 *
 *   - binding.json is schema-valid and pins THIS compiler's contract (version + hash);
 *   - the skill checkout is clean, at exactly binding.source.commit, version inside the bound range,
 *     and its own contract pin (contract/dc-contract.pin.json) names this compiler's contract hash;
 *   - the sheet of EVERY valid context, emitted by the skill's generator, passes the compiler's
 *     validator with the binding enforced (source repository / commit / registry hash / ledger hash /
 *     skill version / contract hash / schema version / capabilities / confidence fuse / provenance hashes).
 *
 *   npm run binding:verify [-- --skill <dir>] [--json]
 *   npm run binding:verify -- --no-pin       conformance only (used by the skill's CI): the skill checkout is NOT
 *                                            required to be the pinned commit; every emitted sheet must still pass
 *                                            the compiler's schema + semantic validation (dirty source allowed).
 * Exit 0 only when every check passes.
 */
import { existsSync } from "node:fs";
import semver from "semver";
import { BINDING_PATH, dcContract, emitAllSheets, inspectSkill, skillDir } from "./lib";
import { loadBinding } from "../../skill-bridge/binding";
import { collectSheetIssues, validateSheet, type ValidateOptions } from "../../skill-bridge/sheet-validator";
import { DecisionPack } from "../../skill-bridge/decision-pack";
import { REQUIRED_DECISIONS } from "../../skill-bridge/requirements";
import type { AestheticConstraintSheet } from "../../contracts/aesthetic-constraint-sheet/aesthetic-constraint-sheet.types";

/** The compiler can only run a sheet that carries every decision its stages read (the requirement manifests). */
function consumable(sheets: AestheticConstraintSheet[], opts: ValidateOptions): { failed: number; reasons: string[] } {
  const reasons = new Set<string>();
  let failed = 0;
  for (const sh of sheets) {
    try {
      DecisionPack.from(validateSheet(sh, opts), REQUIRED_DECISIONS);
    } catch (e) {
      failed++;
      reasons.add(`${sh.decision_id}: ${e instanceof Error ? e.message.slice(0, 220) : String(e)}`);
    }
  }
  return { failed, reasons: [...reasons].slice(0, 4) };
}

type Check = { name: string; status: "PASS" | "FAIL"; detail?: string };
const checks: Check[] = [];
const check = (name: string, ok: boolean, detail?: string) => checks.push({ name, status: ok ? "PASS" : "FAIL", ...(ok ? {} : { detail }) });
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };

function conformance(): number {
  const contract = dcContract();
  const dir = skillDir(arg("skill"));
  const s = inspectSkill(dir);
  check("skill's own contract pin names this compiler's contract", s.contractPin.contract_hash === contract.contract_hash && s.contractPin.schema_version === contract.schema_version, `skill pins ${s.contractPin.schema_version}/${s.contractPin.contract_hash.slice(0, 12)}, compiler is ${contract.schema_version}/${contract.contract_hash.slice(0, 12)}`);
  const sheets = emitAllSheets(dir);
  check(`the generator emits sheets (${sheets.length})`, sheets.length > 0, "no sheets emitted");
  let rejected = 0;
  const reasons = new Set<string>();
  for (const sh of sheets) {
    const issues = collectSheetIssues(sh, { allowDirty: true });
    if (issues.length) { rejected++; issues.slice(0, 2).forEach((i) => reasons.add(`${sh.decision_id}: [${i.code}] ${i.message}`)); }
  }
  check("every emitted sheet passes the compiler's schema + semantic validation", rejected === 0, `${rejected} sheet(s) rejected: ${[...reasons].slice(0, 4).join(" | ")}`);
  const c = consumable(sheets, { allowDirty: true });
  check("every emitted sheet carries every decision the compiler's stages read (requirement manifests)", c.failed === 0, `${c.failed} sheet(s) cannot be consumed: ${c.reasons.join(" | ")}`);
  return report(undefined, sheets.length);
}

function main(): number {
  if (process.argv.includes("--no-pin")) return conformance();
  check("binding.json exists", existsSync(BINDING_PATH), `${BINDING_PATH} is missing: run npm run binding:pin`);
  if (!existsSync(BINDING_PATH)) return report();
  const binding = loadBinding(BINDING_PATH); // throws BINDING_INVALID on schema violations
  check("binding.json matches binding.schema.json", true);

  const contract = dcContract();
  check("binding pins this compiler's contract", binding.contract.contract_hash === contract.contract_hash && binding.contract.schema_version === contract.schema_version, `binding ${binding.contract.schema_version}/${binding.contract.contract_hash.slice(0, 12)} vs compiler ${contract.schema_version}/${contract.contract_hash.slice(0, 12)}`);

  const dir = skillDir(arg("skill"));
  const s = inspectSkill(dir);
  check("skill checkout is clean", s.clean, "uncommitted changes in the skill checkout");
  check("skill repository matches", s.repository === binding.source.repository, `${s.repository} != ${binding.source.repository}`);
  check("skill HEAD is the pinned commit", s.commit === binding.source.commit, `${s.commit.slice(0, 12)} != pinned ${binding.source.commit.slice(0, 12)}`);
  check("skill version inside the bound range", semver.satisfies(s.version, binding.skill.compatible_range), `${s.version} not in ${binding.skill.compatible_range}`);
  check("skill's own contract pin names this compiler's contract", s.contractPin.contract_hash === contract.contract_hash && s.contractPin.schema_version === contract.schema_version, `skill pins ${s.contractPin.schema_version}/${s.contractPin.contract_hash.slice(0, 12)}`);

  const sheets = emitAllSheets(dir);
  check(`the generator emits sheets (${sheets.length})`, sheets.length > 0, "no sheets emitted");
  let rejected = 0;
  const reasons = new Set<string>();
  for (const sh of sheets) {
    const issues = collectSheetIssues(sh, { binding, allowDirty: false });
    if (issues.length) { rejected++; issues.slice(0, 2).forEach((i) => reasons.add(`${sh.decision_id}: [${i.code}] ${i.message}`)); }
  }
  check("every emitted sheet passes the validator with the binding enforced", rejected === 0, `${rejected} sheet(s) rejected: ${[...reasons].slice(0, 4).join(" | ")}`);
  const c = consumable(sheets, { binding, allowDirty: false });
  check("every emitted sheet carries every decision the compiler's stages read (requirement manifests)", c.failed === 0, `${c.failed} sheet(s) cannot be consumed: ${c.reasons.join(" | ")}`);
  return report(binding.source.commit, sheets.length);
}

function report(commit?: string, contexts?: number): number {
  const failed = checks.filter((c) => c.status === "FAIL");
  if (process.argv.includes("--json")) console.log(JSON.stringify({ gate: "skill-binding", status: failed.length ? "FAIL" : "PASS", pinned_commit: commit, contexts, checks }, null, 2));
  else {
    for (const c of checks) console.log(`${c.status}  ${c.name}${c.detail ? `  — ${c.detail}` : ""}`);
    console.log(`\nskill binding: ${failed.length ? "FAIL" : "PASS"}`);
  }
  return failed.length ? 1 : 0;
}

try { process.exit(main()); } catch (e) { check("binding verification ran", false, e instanceof Error ? e.message : String(e)); process.exit(report()); }
