import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { CONTRACT_LOCK, SHEET_SCHEMA, verifiedContractHash } from "../../skill-bridge/contract";
import { canonicalSha256 } from "../../skill-bridge/hash";

const ROOT = resolve(__dirname, "..", "..");
const CONTRACT_DIR = join(ROOT, "contracts", "aesthetic-constraint-sheet");
const TOOL = join(ROOT, "scripts", "contract", "lock-contract.mjs");

function runCheck(dir?: string, extra: string[] = []) {
  return spawnSync("node", [TOOL, "--check", ...(dir ? ["--contract", "aesthetic-constraint-sheet"] : []), ...extra], { cwd: ROOT, encoding: "utf8", env: { ...process.env, ...(dir ? { CONTRACT_DIR_OVERRIDE: dir, CONTRACT_NAME: "aesthetic-constraint-sheet" } : {}) } });
}

function tamperedCopy(mutate: (dir: string) => void): string {
  const dir = mkdtempSync(join(tmpdir(), "acs-contract-"));
  cpSync(CONTRACT_DIR, dir, { recursive: true });
  mutate(dir);
  return dir;
}

describe("AestheticConstraintSheet contract lock", () => {
  it("compiles under strict Ajv 2020 (closed vocabulary, discriminated constraints)", () => {
    const ajv = new Ajv2020({ strict: true, allErrors: true, discriminator: true });
    expect(() => ajv.compile(SHEET_SCHEMA as object)).not.toThrow();
  });

  it("lock hash equals the RFC 8785 sha256 of the schema on disk", () => {
    expect(canonicalSha256(SHEET_SCHEMA)).toBe(CONTRACT_LOCK.contract_hash);
    expect(verifiedContractHash()).toBe(CONTRACT_LOCK.contract_hash);
  });

  it("the committed schema, generated types and lock agree (CI gate)", () => {
    const r = runCheck();
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`PASS contract aesthetic-constraint-sheet ${CONTRACT_LOCK.schema_version}`);
    expect(r.stdout).toContain("PASS contract binding");
    expect(r.stdout).toContain("PASS contract provenance-ledger");
  });

  it("fails when the schema is edited without relocking", () => {
    const dir = tamperedCopy((d) => {
      const p = join(d, "aesthetic-constraint-sheet.schema.json");
      const s = JSON.parse(readFileSync(p, "utf8"));
      s.properties.extra_field = { type: "string" };
      writeFileSync(p, JSON.stringify(s, null, 2) + "\n");
    });
    const r = runCheck(dir);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/contract_hash/);
    expect(r.stderr).toMatch(/drifted/);
  });

  it("fails when the generated types are edited by hand", () => {
    const dir = tamperedCopy((d) => {
      const p = join(d, "aesthetic-constraint-sheet.types.ts");
      writeFileSync(p, readFileSync(p, "utf8").replace("export type Semver = string;", "export type Semver = number;"));
    });
    const r = runCheck(dir);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/drifted/);
  });

  it("fails when the lock is edited by hand", () => {
    const dir = tamperedCopy((d) => {
      const p = join(d, "contract.lock.json");
      const l = JSON.parse(readFileSync(p, "utf8"));
      l.contract_hash = "0".repeat(64);
      writeFileSync(p, JSON.stringify(l, null, 2) + "\n");
    });
    const r = runCheck(dir);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/lock\.contract_hash/);
  });

  it("a changed contract without a version bump is refused against the base (compareWithBase)", () => {
    const script = `
      import { compareWithBase } from ${JSON.stringify(join(ROOT, "scripts/contract/lock-contract.mjs"))};
      const base = { schema_version: "1.0.0", contract_hash: "a".repeat(64) };
      const out = {
        unchanged: compareWithBase(base, { ...base }).ok,
        changedNoBump: compareWithBase(base, { schema_version: "1.0.0", contract_hash: "b".repeat(64) }).ok,
        changedBump: compareWithBase(base, { schema_version: "1.1.0", contract_hash: "b".repeat(64) }).ok,
        firstIntroduction: compareWithBase(null, base).ok,
      };
      console.log(JSON.stringify(out));`;
    const r = spawnSync("node", ["--input-type=module", "-e", script], { encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ unchanged: true, changedNoBump: false, changedBump: true, firstIntroduction: true });
  });
});
