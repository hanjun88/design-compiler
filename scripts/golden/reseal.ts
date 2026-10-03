/**
 * golden:reseal — re-seal the golden render manifest by EXECUTING the six matrix cells through the
 * real chain (skill sheet -> grammar pack -> Core pipeline -> software renderer) against the skill
 * checkout at SKILL_DIR. The manifest is never edited by hand: every number comes from this run,
 * together with the constraints hash of the skill decisions that produced it.
 *
 *   npm run golden:reseal            (writes tests/golden-case-matrix/golden-render-manifest.json)
 *   npm run golden:reseal -- --check (exit 1 when the committed manifest differs from a fresh run)
 *
 * Review the diff: a changed hash is an aesthetic consequence of a skill change (or a compiler
 * change) and needs a human decision, which is why the matrix test fails as STALE until it is run.
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { emitAll } from "../../tests/support/skill-env";

const dir = mkdtempSync(join(tmpdir(), "acs-reseal-"));
emitAll(dir);
process.env.ACS_SHEET_DIR = dir;

// Loaded after ACS_SHEET_DIR is set: the evidence library reads the packs lazily.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const evidence = require("../../tests/golden-case-matrix/lib/golden-render-evidence") as typeof import("../../tests/golden-case-matrix/lib/golden-render-evidence");

const MANIFEST = resolve(__dirname, "../../tests/golden-case-matrix/golden-render-manifest.json");
const fresh = evidence.generateGoldenRenderManifest();

if (process.argv.includes("--check")) {
  const committed = JSON.parse(readFileSync(MANIFEST, "utf8"));
  // the informational skill commit may differ between a CI checkout and the sealing run
  const strip = (m: typeof fresh) => JSON.stringify({ ...m, skill_binding: Object.fromEntries(Object.entries(m.skill_binding).map(([k, v]) => [k, { ...v, skill_commit: "-" }])) });
  const same = strip(committed) === strip(fresh);
  console.log(same ? "golden manifest is current" : "golden manifest is STALE: run npm run golden:reseal and review the diff");
  process.exit(same ? 0 : 1);
}
evidence.writeGoldenRenderManifest(fresh, MANIFEST);
console.log(`re-sealed ${MANIFEST}`);
for (const [id, c] of Object.entries(fresh.cells)) console.log(`  ${id} ${c.renderHash}`);
