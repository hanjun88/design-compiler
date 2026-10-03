/**
 * pin-binding — (re)writes contracts/binding/binding.json from a CLEAN skill checkout.
 *
 *   npm run binding:pin [-- --skill <dir>] [--range "^1.0.0"] [--fuse 0.5]
 *
 * The pin records exactly what the skill's own generator reports for that checkout (commit, version,
 * registry hash, provenance-ledger digest, the contract hash it targets). verify-binding.ts then proves,
 * in CI, that a checkout of the pinned commit still produces sheets that match the pin.
 */
import { writeFileSync } from "node:fs";
import { BINDING_PATH, dcContract, emitAllSheets, inspectSkill, skillDir } from "./lib";
import { parseBinding, type SkillBinding } from "../../skill-bridge/binding";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };

const dir = skillDir(arg("skill"));
const s = inspectSkill(dir);
if (!s.clean) throw new Error(`refusing to pin a dirty skill checkout (${dir}): commit first, a pin must identify its content`);
const sheets = emitAllSheets(dir);
const hashes = (pick: (x: (typeof sheets)[number]) => string) => [...new Set(sheets.map(pick))];
const registry = hashes((x) => x.source_ref.registry_hash);
const ledger = hashes((x) => x.provenance.ledger_hash);
if (registry.length !== 1 || ledger.length !== 1) throw new Error("the skill emitted sheets with different registry / ledger hashes: nondeterministic generator");
const contract = dcContract();
const binding: SkillBinding = {
  binding_version: "1.0.0",
  contract: { name: "AestheticConstraintSheet", schema_version: contract.schema_version, contract_hash: contract.contract_hash },
  source: { repository: s.repository, commit: s.commit },
  skill: { version: s.version, compatible_range: arg("range") ?? `^${s.version}` },
  registry: { path: sheets[0].source_ref.registry_path, hash: registry[0] },
  provenance: { ledger_hash: ledger[0] },
  policy: { confidence_fuse: Number(arg("fuse") ?? 0.5), allow_dirty_source: false, fail_closed: true },
};
parseBinding(binding);
writeFileSync(BINDING_PATH, JSON.stringify(binding, null, 2) + "\n");
console.log(`pinned ${s.repository}@${s.commit.slice(0, 12)} skill ${s.version} registry ${registry[0].slice(0, 12)} ledger ${ledger[0].slice(0, 12)} (${sheets.length} contexts) -> ${BINDING_PATH}`);
