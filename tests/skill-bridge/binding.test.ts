/**
 * Version binding between design-compiler and chinese-aesthetic-skill, exercised against the REAL pin
 * (contracts/binding/binding.json) and the REAL skill generator.
 *
 * The pin is only worth something if (1) the pinned commit really reproduces it, (2) every consumer of a sheet
 * enforces it and fails closed on any deviation, and (3) the file has consumers at all. This suite proves each.
 * `npm run binding:verify` (scripts/binding/verify-binding.ts) additionally proves that the CHECKOUT CI uses is the
 * pinned commit; this suite proves the pin itself, whatever state the developer's checkout is in.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import semver from "semver";
import type { HostCapabilities } from "../../compiler-core/capability-negotiator";
import type { CangjieRawDesignIR } from "../../compiler-intent/types";
import type { AestheticConstraintSheet } from "../../contracts/aesthetic-constraint-sheet/aesthetic-constraint-sheet.types";
import { GrammarGovernor, type GuardedCompileInput } from "../../governance";
import {
  CONTRACT_LOCK,
  DEFAULT_BINDING_PATH,
  SheetRejectedError,
  collectSheetIssues,
  compileWithSheet,
  loadBinding,
  parseBinding,
  type SkillBinding,
} from "../../skill-bridge";
import { GOLDEN_CONTEXTS, contextKey } from "../support/skill-packs";
import { skillDir } from "../support/skill-env";
import { mutate } from "./helpers/sheet-tools";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (p: string) => JSON.parse(readFileSync(path.join(ROOT, p), "utf8"));
const HOST: HostCapabilities = { webgl2: true, floatTextures: true, highPrecisionFragment: true, anisotropyExtension: true, maxFragmentUniformVectors: 1024 };
const SKILL = skillDir();
const binding: SkillBinding = loadBinding();
const KEY = contextKey(GOLDEN_CONTEXTS["MC-T01"]);

const git = (...args: string[]) => execFileSync("git", ["-C", SKILL, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** Every valid context's sheet, emitted by the skill generator from EXACTLY the pinned commit (git archive, no working tree). */
let pinnedSheets: AestheticConstraintSheet[] = [];
let scratch = "";

beforeAll(() => {
  scratch = mkdtempSync(path.join(tmpdir(), "pinned-skill-"));
  const tree = path.join(scratch, "tree");
  execFileSync("mkdir", ["-p", tree]);
  const tar = execFileSync("git", ["-C", SKILL, "archive", "--format=tar", binding.source.commit], { maxBuffer: 1 << 29 });
  execFileSync("tar", ["-x", "-C", tree], { input: tar });
  const out = path.join(scratch, "sheets");
  execFileSync("node", [path.join(tree, "scripts", "emit-sheet.mjs"), "--all", "--out-dir", out], {
    env: { ...process.env, SKILL_COMMIT: binding.source.commit },
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 1 << 28,
  });
  pinnedSheets = readdirSync(out).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(readFileSync(path.join(out, f), "utf8")));
}, 180_000);

afterAll(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
});

const pinnedSheet = (): AestheticConstraintSheet => {
  const s = pinnedSheets.find((x) => contextKey({ period: x.design_context.period, material: x.design_context.material, lighting: x.design_context.lighting, scene_type: x.design_context.scene_type }) === KEY);
  if (!s) throw new Error(`the pinned commit emits no sheet for ${KEY}`);
  return s;
};

describe("the pin", () => {
  it("is schema-valid, fail-closed by policy, and pins THIS compiler's contract identity", () => {
    expect(() => parseBinding(JSON.parse(readFileSync(DEFAULT_BINDING_PATH, "utf8")))).not.toThrow();
    expect(binding.policy.fail_closed).toBe(true);
    expect(binding.policy.allow_dirty_source).toBe(false);
    expect(binding.contract).toEqual({ name: "AestheticConstraintSheet", schema_version: CONTRACT_LOCK.schema_version, contract_hash: CONTRACT_LOCK.contract_hash });
  });

  it("names a commit of the skill repository that exists, whose version is inside the bound range and whose own contract pin is this contract", () => {
    expect(git("cat-file", "-t", binding.source.commit)).toBe("commit");
    const pkg = JSON.parse(git("show", `${binding.source.commit}:package.json`));
    expect(pkg.repository.url).toContain(binding.source.repository);
    expect(semver.satisfies(pkg.version, binding.skill.compatible_range)).toBe(true);
    expect(pkg.version).toBe(binding.skill.version);
    const pin = JSON.parse(git("show", `${binding.source.commit}:contract/dc-contract.pin.json`));
    expect({ schema_version: pin.schema_version, contract_hash: pin.contract_hash }).toEqual({ schema_version: binding.contract.schema_version, contract_hash: binding.contract.contract_hash });
  });

  it("is reproduced by the pinned commit: one registry hash, one ledger hash, every context's sheet passes with the binding enforced", () => {
    expect(pinnedSheets.length).toBeGreaterThan(100);
    expect(new Set(pinnedSheets.map((s) => s.source_ref.registry_hash))).toEqual(new Set([binding.registry.hash]));
    expect(new Set(pinnedSheets.map((s) => s.provenance.ledger_hash))).toEqual(new Set([binding.provenance.ledger_hash]));
    expect(new Set(pinnedSheets.map((s) => s.source_ref.commit))).toEqual(new Set([binding.source.commit]));
    const rejected = pinnedSheets.map((s) => ({ id: s.decision_id, issues: collectSheetIssues(s, { binding }) })).filter((r) => r.issues.length > 0);
    expect(rejected.slice(0, 3)).toEqual([]);
  });
});

describe("the pin is enforced and fails closed on every dimension", () => {
  const cases: Array<[string, (s: AestheticConstraintSheet) => void, string]> = [
    ["another source commit", (s) => { s.source_ref.commit = "9".repeat(40); }, "SHEET_SOURCE_MISMATCH"],
    ["another source repository", (s) => { s.source_ref.repository = "someone-else/chinese-aesthetic-skill"; }, "SHEET_SOURCE_MISMATCH"],
    ["a skill version outside the bound range", (s) => { s.skill_version = "9.0.0"; }, "SHEET_SKILL_VERSION_STALE"],
    ["another registry hash", (s) => { s.source_ref.registry_hash = "1".repeat(64); }, "SHEET_SOURCE_MISMATCH"],
    ["another provenance ledger", (s) => { s.provenance.ledger_hash = "2".repeat(64); }, "SHEET_PROVENANCE_LEDGER_MISMATCH"],
    ["another contract hash", (s) => { s.contract_hash = "3".repeat(64); }, "SHEET_CONTRACT_HASH_MISMATCH"],
    ["a dirty skill worktree", (s) => { s.source_ref.dirty = true; }, "SHEET_SOURCE_DIRTY"],
  ];

  it("control: the unmodified pinned sheet passes", () => {
    expect(collectSheetIssues(pinnedSheet(), { binding })).toEqual([]);
  });

  it.each(cases)("%s is rejected", (_name, edit, code) => {
    const issues = collectSheetIssues(mutate(pinnedSheet(), edit), { binding });
    expect(issues.map((i) => i.code)).toContain(code);
  });

  it("a binding that pins another contract refuses every sheet (BINDING_SOURCE_MISMATCH)", () => {
    const other: SkillBinding = { ...binding, contract: { ...binding.contract, contract_hash: "4".repeat(64) } };
    expect(collectSheetIssues(pinnedSheet(), { binding: other }).map((i) => i.code)).toContain("BINDING_SOURCE_MISMATCH");
  });

  describe("a malformed binding document is refused (BINDING_INVALID)", () => {
    const base = (): Record<string, unknown> => JSON.parse(JSON.stringify(binding));
    const broken: Array<[string, (b: Record<string, unknown>) => void]> = [
      ["a missing section", (b) => { delete b.registry; }],
      ["a short commit", (b) => { (b.source as Record<string, unknown>).commit = "abc123"; }],
      ["an uppercase hash", (b) => { (b.registry as Record<string, unknown>).hash = String((b.registry as Record<string, unknown>).hash).toUpperCase(); }],
      ["fail_closed switched off", (b) => { (b.policy as Record<string, unknown>).fail_closed = false; }],
      ["an unknown property", (b) => { b.note = "just a note"; }],
      ["a confidence fuse above 1", (b) => { (b.policy as Record<string, unknown>).confidence_fuse = 1.5; }],
    ];
    it.each(broken)("%s", (_name, edit) => {
      const doc = base();
      edit(doc);
      try {
        parseBinding(doc);
        throw new Error("expected the binding to be refused");
      } catch (e) {
        expect(e).toBeInstanceOf(SheetRejectedError);
        expect((e as SheetRejectedError).codes).toEqual(["BINDING_INVALID"]);
      }
    });
  });
});

describe("the pin has consumers", () => {
  const compileInput = (): GuardedCompileInput => ({
    brief: read("tests/golden-case-matrix/fixtures/matrix-ir-templates/MC-T01.json") as CangjieRawDesignIR,
    g1Policy: read("config/g1-policy.json"),
    tierConfig: read("config/tier-mapping.json"),
    hostCapabilities: HOST,
    testCaseId: "BINDING",
    capturedAt: "2026-09-16T00:00:00Z",
  });

  it("GrammarGovernor.pinned() reads binding.json: a sheet of the pinned build is admitted and compiles through the chain", () => {
    const g = GrammarGovernor.pinned();
    const r = g.submit(pinnedSheet());
    expect(r.status).toBe("ACTIVATED");
    const out = g.compile(KEY, compileInput());
    expect(out.pipeline?.status).toBe("SUCCESS");
    expect(out.generation.identity.commit).toBe(binding.source.commit);
  });

  it("GrammarGovernor.pinned() refuses every other build, including a sheet that is internally perfect", () => {
    const g = GrammarGovernor.pinned();
    const foreign = mutate(pinnedSheet(), (s) => { s.source_ref.commit = "8".repeat(40); });
    const r = g.submit(foreign);
    expect(r.status).toBe("REJECTED");
    if (r.status === "REJECTED") expect(r.codes).toContain("SHEET_SOURCE_MISMATCH");
    expect(g.contexts()).toEqual([]);
  });

  it("the pin file decides: the same sheet is admitted under the real pin and refused under a pin of another commit", () => {
    const other = path.join(scratch, "other-binding.json");
    writeFileSync(other, JSON.stringify({ ...binding, source: { ...binding.source, commit: "7".repeat(40) } }));
    expect(GrammarGovernor.pinned().submit(pinnedSheet()).status).toBe("ACTIVATED");
    const r = GrammarGovernor.pinned({ bindingPath: other }).submit(pinnedSheet());
    expect(r.status).toBe("REJECTED");
    if (r.status === "REJECTED") expect(r.codes).toContain("SHEET_SOURCE_MISMATCH");
  });

  it("an absent or unreadable binding file is not an unbound mode: it throws", () => {
    expect(() => GrammarGovernor.pinned({ bindingPath: path.join(scratch, "no-such-binding.json") })).toThrow();
    const garbage = path.join(scratch, "garbage.json");
    writeFileSync(garbage, "{ not json");
    expect(() => GrammarGovernor.pinned({ bindingPath: garbage })).toThrow();
  });

  it("compileWithSheet enforces the same pin when it is handed one", () => {
    const input = compileInput();
    const ok = compileWithSheet({ sheet: pinnedSheet(), validation: { binding }, ...input });
    expect(ok.pipeline?.status).toBe("SUCCESS");
    const foreign = mutate(pinnedSheet(), (s) => { s.skill_version = "9.9.9"; });
    expect(() => compileWithSheet({ sheet: foreign, validation: { binding }, ...input })).toThrow(SheetRejectedError);
  });

  it("binding.json is read by production code and by the CI gate, not an orphan file", () => {
    const consumers = ["governance/grammar-governor.ts", "scripts/binding/verify-binding.ts", "scripts/binding/pin-binding.ts"].filter((f) => /\bloadBinding\b|\bparseBinding\b/.test(readFileSync(path.join(ROOT, f), "utf8")));
    expect(consumers).toEqual(["governance/grammar-governor.ts", "scripts/binding/verify-binding.ts", "scripts/binding/pin-binding.ts"]);
    expect(existsSync(DEFAULT_BINDING_PATH)).toBe(true);
    expect(readFileSync(path.join(ROOT, "scripts/run-gates.mjs"), "utf8")).toContain("verify-binding.ts");
    expect(readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8")).toContain("SKILL_BINDING_STRICT");
  });
});
