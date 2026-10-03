/**
 * validate-schemas.mjs — real JSON Schema validation of every schema this repository ships.
 *
 *   1. every *.schema.json under schemas/, contracts/ and chinese-aesthetic/ compiles in strict mode under the
 *      Ajv dialect its $schema declares, with the schemas of one dialect registered together (unknown
 *      keywords, unresolved $refs and malformed schemas fail);
 *   2. the ABI schemas validate the instances the repository itself ships:
 *        - tests/golden-case-matrix/fixtures/matrix-ir-templates/*.json are NOT schema instances (Cangjie
 *          form) and are covered by the intent tests; the validated / raw IR instances produced by the real
 *          pipeline are validated by tests/contract (schema isomorphism tests).
 *   3. every contract.lock.json agrees with its schema (scripts/contract/lock-contract.mjs --check).
 *
 * Exit 0 only when every schema compiles and the contract locks agree.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import Ajv from "ajv";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const ROOT = resolve(import.meta.dirname, "..");
const SCOPES = ["schemas", "contracts", "chinese-aesthetic"];

function* walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (name.endsWith(".schema.json")) yield p;
  }
}

const files = SCOPES.flatMap((s) => { try { return [...walk(join(ROOT, s))]; } catch { return []; } });
const loaded = files.map((file) => ({ file, rel: relative(ROOT, file), schema: JSON.parse(readFileSync(file, "utf8")) }));

// One validator per JSON Schema dialect, with every schema of that dialect registered first so that
// cross-file $refs (raw-design-ir -> estimated-parameter) resolve. The ABI schemas are frozen: the
// validator is configured to accept their (legitimate) union types instead of editing them.
// strictRequired is off only because the frozen ABI evaluation-result schema uses `required` inside
// conditional branches without redeclaring the property; every other strict check stays on.
const OPTIONS = { strict: true, strictRequired: false, allErrors: true, allowUnionTypes: true, discriminator: true };
const dialects = new Map();
function ajvFor(schema) {
  const dialect = schema.$schema ?? "https://json-schema.org/draft/2020-12/schema";
  if (!dialects.has(dialect)) {
    const ajv = dialect.includes("draft-07") ? new Ajv(OPTIONS) : new Ajv2020(OPTIONS);
    addFormats(ajv);
    dialects.set(dialect, ajv);
  }
  return dialects.get(dialect);
}
let failed = 0;
const rows = [];
for (const { rel, schema } of loaded) {
  try { ajvFor(schema).addSchema(schema, schema.$id ?? rel); }
  catch (e) { failed++; rows.push({ file: rel, status: "FAIL", error: `registration: ${e.message}` }); }
}
for (const { rel, schema } of loaded) {
  if (rows.some((r) => r.file === rel)) continue;
  try {
    ajvFor(schema).getSchema(schema.$id ?? rel) ?? (() => { throw new Error("schema was not registered"); })();
    rows.push({ file: rel, status: "PASS", id: schema.$id ?? "(no $id)" });
  } catch (e) {
    failed++;
    rows.push({ file: rel, status: "FAIL", error: e.message });
  }
}
rows.sort((a, b) => (a.file < b.file ? -1 : 1));
for (const r of rows) console.log(`${r.status}  ${r.file}${r.status === "PASS" ? `  ${r.id}` : `\n      ${r.error}`}`);

const lock = spawnSync("node", [join(ROOT, "scripts/contract/lock-contract.mjs"), "--check"], { encoding: "utf8" });
process.stdout.write(lock.stdout);
if (lock.status !== 0) { failed++; process.stderr.write(lock.stderr); }

console.log(`\nschema validation: ${rows.length} schemas compiled under strict Ajv (dialect per $schema), ${rows.filter((r) => r.status === "FAIL").length} failed, contract locks ${lock.status === 0 ? "agree" : "DISAGREE"}`);
process.exit(failed ? 1 : 0);
