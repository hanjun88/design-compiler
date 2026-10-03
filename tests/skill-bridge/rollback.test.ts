/**
 * Grammar rollback and rejection, against REAL components:
 *   generations are sheets emitted by the chinese-aesthetic-skill generator (tests/setup/global-setup.js);
 *   a generation that must misbehave is the same real sheet with ONE defect added and every hash resealed,
 *   so the defect under test is the only thing wrong with it. Compilation runs through the production
 *   chain (G1 -> sheet grammar patches -> G3); nothing is mocked.
 *
 * Covers: failed patch rollback, incompatible schema rollback, capability downgrade rollback,
 * invalid aesthetic decision rejection, version mismatch rejection, explicit rollbackGrammar().
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { CompilerError, CompilerErrorCode } from "../../compiler-core/error-codes";
import type { HostCapabilities } from "../../compiler-core/capability-negotiator";
import type { CangjieRawDesignIR } from "../../compiler-intent/types";
import type { AestheticConstraintSheet, ConstraintOfKind } from "../../contracts/aesthetic-constraint-sheet/aesthetic-constraint-sheet.types";
import {
  GrammarGovernor,
  NoActiveGrammarError,
  createCompileCanary,
  type GuardedCompileInput,
} from "../../governance";
import { CONTRACT_LOCK, SUPPORTED_CAPABILITIES, compileWithSheet } from "../../skill-bridge";
import { GOLDEN_CONTEXTS, contextKey, loadSheetJson, strictBinding } from "../support/skill-packs";
import { bindingFor, mutate } from "./helpers/sheet-tools";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const HOST: HostCapabilities = { webgl2: true, floatTextures: true, highPrecisionFragment: true, anisotropyExtension: true, maxFragmentUniformVectors: 1024 };
const CAPTURED_AT = "2026-09-16T00:00:00Z";

const CTX = GOLDEN_CONTEXTS["MC-T01"];
const KEY = contextKey(CTX);
const brief = (cell: string): CangjieRawDesignIR => read(`tests/golden-case-matrix/fixtures/matrix-ir-templates/${cell}.json`);

const compileInput = (b: CangjieRawDesignIR = brief("MC-T01")): GuardedCompileInput => ({
  brief: b,
  g1Policy: read("config/g1-policy.json"),
  tierConfig: read("config/tier-mapping.json"),
  hostCapabilities: HOST,
  testCaseId: "GOVERNOR-ROLLBACK",
  capturedAt: CAPTURED_AT,
});

const canary = () =>
  createCompileCanary({
    briefFor: (c) => (c.period === CTX.period ? brief("MC-T01") : undefined),
    g1Policy: read("config/g1-policy.json"),
    tierConfig: read("config/tier-mapping.json"),
    hostCapabilities: HOST,
    testCaseId: "GOVERNOR-CANARY",
    capturedAt: CAPTURED_AT,
  });

const governor = (withCanary = false) =>
  new GrammarGovernor({ validation: { allowDirty: !strictBinding() }, ...(withCanary ? { canary: canary() } : {}) });

const real = (): AestheticConstraintSheet => loadSheetJson(CTX);

/** A later generation of the real sheet: another skill version/commit, optionally one extra edit. */
function generation(base: AestheticConstraintSheet, version: string, commit: string, edit?: (s: AestheticConstraintSheet) => void): AestheticConstraintSheet {
  return mutate(base, (s) => {
    s.skill_version = version;
    s.source_ref.commit = commit;
    edit?.(s);
  });
}
const COMMIT_2 = "2".repeat(40);
const COMMIT_3 = "3".repeat(40);

/** The first rule of the sheet that fires on the golden brief, with the path it patches. */
function firstTriggered(sheet: AestheticConstraintSheet): { ruleId: string; path: string } {
  const out = compileWithSheet({ sheet, validation: { allowDirty: true }, ...compileInput() });
  if (out.pipeline?.status !== "SUCCESS") throw new Error("baseline compilation of the real sheet must succeed");
  const p = out.pipeline.validatedIR.patches[0];
  if (!p) throw new Error("the golden brief must trigger at least one rule of the real sheet");
  return { ruleId: p.audit.ruleId, path: p.path };
}

/**
 * The real sheet with one rule patching its target twice with `remove`: every field is valid (each pointer is a
 * Core IR parameter), but the second remove finds nothing to remove, so applying the patches fails.
 */
function failingPatchGeneration(base: AestheticConstraintSheet, version: string, commit: string): AestheticConstraintSheet {
  const t = firstTriggered(base);
  return generation(base, version, commit, (s) => {
    const rule = s.constraints.find((c) => c.kind === "GRAMMAR_RULE" && c.rule_id === t.ruleId) as ConstraintOfKind<"GRAMMAR_RULE">;
    rule.payload.patches = [
      { op: "remove", path: t.path },
      { op: "remove", path: t.path },
    ];
  });
}

function bump(version: string): string {
  const [maj, min, pat] = version.split(".").map(Number);
  return `${maj}.${min}.${pat + 1}`;
}

describe("GrammarGovernor — activation and history", () => {
  it("activates a real sheet after a canary compile through the production chain", () => {
    const g = governor(true);
    const sheet = real();
    const r = g.submit(sheet);
    expect(r.status).toBe("ACTIVATED");
    if (r.status !== "ACTIVATED") return;
    expect(r.generation.sequence).toBe(1);
    expect(r.generation.state).toBe("ACTIVE");
    expect(r.generation.identity).toMatchObject({ context: KEY, skill_version: sheet.skill_version, commit: sheet.source_ref.commit, contract_hash: CONTRACT_LOCK.contract_hash, sheet_hash: sheet.provenance.content_hash });
    // the canary evidence is the hash an independent compilation of the same sheet and brief produces
    const independent = compileWithSheet({ sheet, validation: { allowDirty: !strictBinding() }, ...compileInput() });
    if (independent.pipeline?.status !== "SUCCESS") throw new Error("independent compilation failed");
    expect(r.generation.canary?.validated_ir_hash).toBe(independent.pipeline.hashChain.validatedIRHash);
    expect(g.active(KEY)?.sequence).toBe(1);
  });

  it("an identical sheet is UNCHANGED; a newer skill version supersedes the active generation", () => {
    const g = governor(true);
    const v1 = real();
    g.submit(v1);
    const again = g.submit(v1);
    expect(again.status).toBe("UNCHANGED");
    expect(g.generations(KEY)).toHaveLength(1);

    const v2 = generation(v1, bump(v1.skill_version), COMMIT_2);
    const r = g.submit(v2);
    expect(r.status).toBe("ACTIVATED");
    if (r.status !== "ACTIVATED") return;
    expect(r.superseded?.sequence).toBe(1);
    expect(g.generations(KEY).map((x) => [x.sequence, x.state])).toEqual([[1, "SUPERSEDED"], [2, "ACTIVE"]]);
    expect(g.history({ context: KEY }).map((e) => e.type)).toEqual(["ACTIVATED", "UNCHANGED", "ACTIVATED"]);
  });

  it("the history is a logical clock: strictly increasing and identical across identical runs", () => {
    const run = () => {
      const g = governor(true);
      const v1 = real();
      g.submit(v1);
      g.submit(generation(v1, bump(v1.skill_version), COMMIT_2));
      g.rollbackGrammar(KEY, "previous", "operator rollback");
      return g.history();
    };
    const a = run();
    expect(a.map((e) => e.seq)).toEqual(a.map((_, i) => i + 1));
    expect(run()).toEqual(a);
  });
});

describe("invalid aesthetic decision rejection", () => {
  const cases: Array<[string, (s: AestheticConstraintSheet) => void, string]> = [
    [
      "an inverted band",
      (s) => {
        const b = s.constraints.find((c) => c.kind === "PARAMETER_BAND") as ConstraintOfKind<"PARAMETER_BAND">;
        b.payload.min = 0.9;
        b.payload.max = 0.1;
        delete (b.payload as { target?: number }).target;
      },
      "SHEET_DECISION_INVALID",
    ],
    [
      "a repair that escapes the period band",
      (s) => {
        const rule = s.constraints.find((c) => c.kind === "GRAMMAR_RULE" && c.rule_id.startsWith("CA-RULE-01")) as ConstraintOfKind<"GRAMMAR_RULE">;
        rule.payload.mutation.value = 0.99;
      },
      "SHEET_RULE_CONFLICT",
    ],
    [
      "a decision whose provenance source names nothing",
      (s) => {
        s.constraints[0].provenance.sources[0].ref = "   ";
      },
      "SHEET_PROVENANCE_MISSING",
    ],
    [
      "scoring weights that do not sum to one",
      (s) => {
        const w = s.constraints.find((c) => c.kind === "SCORING_WEIGHTS") as ConstraintOfKind<"SCORING_WEIGHTS">;
        w.payload.weights.composition += 0.3;
      },
      "SHEET_DECISION_INVALID",
    ],
  ];

  it.each(cases)("%s is refused; the active generation and the history of generations are untouched", (_name, edit, code) => {
    const g = governor(true);
    g.submit(real());
    const before = JSON.stringify(g.generations(KEY));
    const bad = generation(real(), "9.9.9", COMMIT_2, edit);
    const r = g.submit(bad);
    expect(r.status).toBe("REJECTED");
    if (r.status !== "REJECTED") return;
    expect(r.codes).toContain(code);
    expect(r.active?.sequence).toBe(1);
    expect(JSON.stringify(g.generations(KEY))).toBe(before);
    expect(g.active(KEY)?.sequence).toBe(1);
    expect(g.history({ context: KEY }).at(-1)).toMatchObject({ type: "REJECTED" });
  });

  it("a sheet that is not a sheet at all is rejected without a lineage", () => {
    const g = governor();
    const r = g.submit({ hello: "world" });
    expect(r.status).toBe("REJECTED");
    expect(g.contexts()).toEqual([]);
  });

  it("a candidate whose canary compilation fails is refused before activation (the failing patch is caught)", () => {
    const g = governor(true);
    const v1 = real();
    g.submit(v1);
    const r = g.submit(failingPatchGeneration(v1, bump(v1.skill_version), COMMIT_2));
    expect(r.status).toBe("REJECTED");
    if (r.status !== "REJECTED") return;
    expect(r.codes).toEqual(["CANARY_FAILED"]);
    expect(r.issues[0].message).toContain("PATCH_PATH_NOT_FOUND");
    expect(g.generations(KEY)).toHaveLength(1);
    expect(g.active(KEY)?.sequence).toBe(1);
  });

  it("a context without a canary brief cannot be activated unverified", () => {
    const g = governor(true);
    const song = loadSheetJson(GOLDEN_CONTEXTS["MC-S01"]);
    const r = g.submit(song);
    expect(r.status).toBe("REJECTED");
    if (r.status !== "REJECTED") return;
    expect(r.codes).toEqual(["CANARY_FAILED"]);
    expect(r.issues[0].message).toMatch(/no canary brief/);
  });
});

describe("version mismatch rejection", () => {
  it("rejects a sheet whose skill commit, version, registry or contract differ from the binding", () => {
    const v1 = real();
    const binding = bindingFor(v1);
    const g = governor();
    expect(g.submit(v1, { binding }).status).toBe("ACTIVATED");

    const wrongCommit = generation(v1, v1.skill_version, COMMIT_2);
    const staleVersion = generation(v1, "0.0.1", v1.source_ref.commit);
    const wrongRegistry = mutate(v1, (s) => { s.source_ref.registry_hash = "f".repeat(64); });
    const wrongContract = mutate(v1, (s) => { s.contract_hash = "e".repeat(64); });
    const wrongLedger = mutate(v1, (s) => { s.provenance.ledger_hash = "d".repeat(64); });

    const expectations: Array<[AestheticConstraintSheet, string]> = [
      [wrongCommit, "SHEET_SOURCE_MISMATCH"],
      [staleVersion, "SHEET_SKILL_VERSION_STALE"],
      [wrongRegistry, "SHEET_SOURCE_MISMATCH"],
      [wrongContract, "SHEET_CONTRACT_HASH_MISMATCH"],
      [wrongLedger, "SHEET_PROVENANCE_LEDGER_MISMATCH"],
    ];
    for (const [sheet, code] of expectations) {
      const r = g.submit(sheet, { binding });
      expect(r.status).toBe("REJECTED");
      if (r.status === "REJECTED") expect(r.codes).toContain(code);
    }
    expect(g.generations(KEY)).toHaveLength(1);
    expect(g.active(KEY)?.sequence).toBe(1);
  });

  it("refuses to activate an older skill version over a newer one unless the downgrade is explicit", () => {
    const g = governor();
    const v1 = real();
    const v2 = generation(v1, bump(v1.skill_version), COMMIT_2);
    g.submit(v2);
    const r = g.submit(v1);
    expect(r.status).toBe("REJECTED");
    if (r.status === "REJECTED") expect(r.codes).toEqual(["GENERATION_STALE"]);
    expect(g.submit(v1, { allowDowngrade: true }).status).toBe("ACTIVATED");
  });
});

describe("failed patch rollback", () => {
  it("rolls the active generation back when its patches fail and the previous generation compiles the same input", () => {
    const g = governor(); // no canary: the defect surfaces only when a real brief is compiled
    const v1 = real();
    const v2 = failingPatchGeneration(v1, bump(v1.skill_version), COMMIT_2);
    g.submit(v1);
    expect(g.submit(v2).status).toBe("ACTIVATED");
    expect(g.active(KEY)?.sequence).toBe(2);

    const input = compileInput();
    const before = JSON.stringify(input.brief);
    const out = g.compile(KEY, input);

    // the previous generation answered
    expect(out.generation.sequence).toBe(1);
    expect(out.fallback?.failure.code).toBe(CompilerErrorCode.PATCH_PATH_NOT_FOUND);
    expect(out.fallback?.failed.sequence).toBe(2);
    expect(out.pipeline?.status).toBe("SUCCESS");
    const independent = compileWithSheet({ sheet: v1, validation: { allowDirty: !strictBinding() }, ...input });
    if (out.pipeline?.status !== "SUCCESS" || independent.pipeline?.status !== "SUCCESS") throw new Error("both compilations must succeed");
    expect(out.pipeline.hashChain.validatedIRHash).toBe(independent.pipeline.hashChain.validatedIRHash);
    // atomicity: the failed attempt left the input untouched
    expect(JSON.stringify(input.brief)).toBe(before);

    // governance state
    expect(g.active(KEY)?.sequence).toBe(1);
    const [first, second] = g.generations(KEY);
    expect([first.state, second.state]).toEqual(["ACTIVE", "ROLLED_BACK"]);
    expect(second.state_reason).toMatch(/PATCH_PATH_NOT_FOUND/);
    expect(g.history({ context: KEY }).map((e) => e.type)).toEqual(["ACTIVATED", "ACTIVATED", "ROLLED_BACK"]);

    // later compilations keep using the restored generation
    const next = g.compile(KEY, compileInput());
    expect(next.generation.sequence).toBe(1);
    expect(next.fallback).toBeUndefined();
  });

  it("quarantines the rolled-back generation: the same sheet cannot be activated again, a changed one can", () => {
    const g = governor();
    const v1 = real();
    const v2 = failingPatchGeneration(v1, bump(v1.skill_version), COMMIT_2);
    g.submit(v1);
    g.submit(v2);
    g.compile(KEY, compileInput());

    const again = g.submit(v2);
    expect(again.status).toBe("REJECTED");
    if (again.status === "REJECTED") expect(again.codes).toEqual(["GENERATION_QUARANTINED"]);

    const fixed = generation(v1, bump(bump(v1.skill_version)), COMMIT_3);
    expect(g.submit(fixed).status).toBe("ACTIVATED");
    expect(g.compile(KEY, compileInput()).generation.sequence).toBe(3);
  });

  it("does not blame the grammar for a failure the previous generation shares", () => {
    const g = governor();
    const v1 = failingPatchGeneration(real(), "1.0.1", COMMIT_2);
    const v2 = failingPatchGeneration(real(), "1.0.2", COMMIT_3);
    g.submit(v1);
    g.submit(v2);
    expect(() => g.compile(KEY, compileInput())).toThrow(CompilerError);
    expect(g.active(KEY)?.sequence).toBe(2);
    expect(g.generations(KEY).map((x) => x.state)).toEqual(["SUPERSEDED", "ACTIVE"]);
  });

  it("with no earlier generation to return to, the failure surfaces and nothing is rolled back", () => {
    const g = governor();
    g.submit(failingPatchGeneration(real(), "1.0.1", COMMIT_2));
    try {
      g.compile(KEY, compileInput());
      throw new Error("expected the compilation to fail");
    } catch (e) {
      expect(e).toBeInstanceOf(CompilerError);
      expect((e as CompilerError).code).toBe(CompilerErrorCode.PATCH_PATH_NOT_FOUND);
    }
    expect(g.active(KEY)?.sequence).toBe(1);
  });

  it("a halt that is not a patch failure (the host lacks WebGL2) never rolls anything back", () => {
    const g = governor();
    const v1 = real();
    g.submit(v1);
    g.submit(generation(v1, bump(v1.skill_version), COMMIT_2));
    const input = compileInput();
    const out = g.compile(KEY, { ...input, hostCapabilities: { ...HOST, webgl2: false, floatTextures: false } });
    expect(out.pipeline?.status).toBe("TERMINAL_HALT");
    expect(out.fallback).toBeUndefined();
    expect(g.active(KEY)?.sequence).toBe(2);
    expect(g.generations(KEY).map((x) => x.state)).toEqual(["SUPERSEDED", "ACTIVE"]);
  });

  it("compiling without an active generation fails closed", () => {
    const g = governor();
    expect(() => g.compile(KEY, compileInput())).toThrow(NoActiveGrammarError);
  });
});

describe("incompatible schema rollback", () => {
  const COMPILER_NEWER = { schema_version: "1.2.0", contract_hash: CONTRACT_LOCK.contract_hash };
  const COMPILER_OLDER = { schema_version: CONTRACT_LOCK.schema_version, contract_hash: CONTRACT_LOCK.contract_hash };

  /** v2 needs a compiler contract of at least 1.2.0 (e.g. a constraint kind introduced by 1.2). */
  const needsNewerContract = (v1: AestheticConstraintSheet) =>
    generation(v1, bump(v1.skill_version), COMMIT_2, (s) => {
      s.compatibility.contract_range = ">=1.2.0 <2.0.0";
    });

  it("a generation that needs a newer contract than the compiler build now running is rolled back to the previous one", () => {
    const g = new GrammarGovernor({ validation: { allowDirty: !strictBinding() }, environment: { contract: COMPILER_NEWER } });
    const v1 = real();
    g.submit(v1);
    expect(g.submit(needsNewerContract(v1)).status).toBe("ACTIVATED");
    expect(g.active(KEY)?.sequence).toBe(2);

    const reports = g.applyEnvironment({ contract: COMPILER_OLDER });
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ context: KEY, action: "ROLLED_BACK", codes: ["SHEET_SCHEMA_VERSION_INCOMPATIBLE"] });
    expect(reports[0].rolledBackTo?.sequence).toBe(1);
    expect(g.active(KEY)?.sequence).toBe(1);
    expect(g.generations(KEY).map((x) => x.state)).toEqual(["ACTIVE", "ROLLED_BACK"]);

    // and the restored generation really compiles
    const out = g.compile(KEY, compileInput());
    expect(out.pipeline?.status).toBe("SUCCESS");
    expect(out.generation.sequence).toBe(1);
  });

  it("when no earlier generation is compatible the grammar is deactivated and compilation fails closed", () => {
    const g = new GrammarGovernor({ validation: { allowDirty: !strictBinding() }, environment: { contract: COMPILER_NEWER } });
    g.submit(needsNewerContract(real()));
    const reports = g.applyEnvironment({ contract: COMPILER_OLDER });
    expect(reports[0].action).toBe("DEACTIVATED");
    expect(g.active(KEY)).toBeUndefined();
    expect(() => g.compile(KEY, compileInput())).toThrow(NoActiveGrammarError);
    expect(g.history({ context: KEY }).at(-1)).toMatchObject({ type: "DEACTIVATED" });
  });

  it("a compiler contract with another hash invalidates every generation of the lineage", () => {
    const g = governor();
    const v1 = real();
    g.submit(v1);
    g.submit(generation(v1, bump(v1.skill_version), COMMIT_2));
    const reports = g.applyEnvironment({ contract: { schema_version: CONTRACT_LOCK.schema_version, contract_hash: "0".repeat(64) } });
    expect(reports[0].action).toBe("DEACTIVATED");
    expect(reports[0].codes).toContain("SHEET_CONTRACT_HASH_MISMATCH");
    expect(g.active(KEY)).toBeUndefined();
  });

  it("an unchanged environment keeps every generation", () => {
    const g = governor();
    g.submit(real());
    const reports = g.applyEnvironment({});
    expect(reports.map((r) => r.action)).toEqual(["KEPT"]);
    expect(g.active(KEY)?.sequence).toBe(1);
  });
});

describe("capability downgrade rollback", () => {
  const EXTRA = "cap.constraint.anti-pattern-threshold@1";

  it("a generation that needs a capability the compiler no longer provides is rolled back", () => {
    expect(SUPPORTED_CAPABILITIES).toContain(EXTRA);
    const v1 = real();
    expect(v1.compatibility.requires_capabilities).not.toContain(EXTRA);
    const v2 = generation(v1, bump(v1.skill_version), COMMIT_2, (s) => {
      s.compatibility.requires_capabilities = [...s.compatibility.requires_capabilities, EXTRA].sort();
    });
    const g = governor();
    g.submit(v1);
    expect(g.submit(v2).status).toBe("ACTIVATED");

    const reports = g.applyEnvironment({ supportedCapabilities: SUPPORTED_CAPABILITIES.filter((c) => c !== EXTRA) });
    expect(reports[0]).toMatchObject({ action: "ROLLED_BACK", codes: ["SHEET_CAPABILITY_UNSUPPORTED"] });
    expect(g.active(KEY)?.sequence).toBe(1);
    expect(g.compile(KEY, compileInput()).pipeline?.status).toBe("SUCCESS");
  });

  it("withdrawing a capability every generation needs deactivates the lineage", () => {
    const g = governor();
    g.submit(real());
    const reports = g.applyEnvironment({ supportedCapabilities: SUPPORTED_CAPABILITIES.filter((c) => c !== "cap.constraint.grammar-rule@1") });
    expect(reports[0].action).toBe("DEACTIVATED");
    expect(() => g.compile(KEY, compileInput())).toThrow(NoActiveGrammarError);
  });

  it("restoring the capability does not resurrect a rolled-back generation", () => {
    const v1 = real();
    const v2 = generation(v1, bump(v1.skill_version), COMMIT_2, (s) => {
      s.compatibility.requires_capabilities = [...s.compatibility.requires_capabilities, EXTRA].sort();
    });
    const g = governor();
    g.submit(v1);
    g.submit(v2);
    g.applyEnvironment({ supportedCapabilities: SUPPORTED_CAPABILITIES.filter((c) => c !== EXTRA) });
    g.applyEnvironment({ supportedCapabilities: SUPPORTED_CAPABILITIES });
    expect(g.active(KEY)?.sequence).toBe(1);
    const r = g.submit(v2);
    expect(r.status).toBe("REJECTED");
    if (r.status === "REJECTED") expect(r.codes).toEqual(["GENERATION_QUARANTINED"]);
  });
});

describe("rollbackGrammar (explicit)", () => {
  function twoGenerations() {
    const g = governor();
    const v1 = real();
    const v2 = generation(v1, bump(v1.skill_version), COMMIT_2);
    g.submit(v1);
    g.submit(v2);
    return { g, v1, v2 };
  }

  it("returns to the previous generation and records who, from what, to what and why", () => {
    const { g } = twoGenerations();
    const r = g.rollbackGrammar(KEY, "previous", "operator: skill 2 changed rendering");
    expect(r.success).toBe(true);
    expect(r.rolledBackFrom?.sequence).toBe(2);
    expect(r.rolledBackTo?.sequence).toBe(1);
    expect(r.reason).toBe("operator: skill 2 changed rendering");
    expect(g.active(KEY)?.sequence).toBe(1);
    expect(g.generations(KEY)[1]).toMatchObject({ state: "ROLLED_BACK", state_reason: "operator: skill 2 changed rendering" });
    expect(g.history({ context: KEY }).at(-1)).toMatchObject({ type: "ROLLED_BACK", from: 2, to: 1 });
  });

  it("can target a generation by sequence or by skill version", () => {
    const g = governor();
    const v1 = real();
    const v2 = generation(v1, bump(v1.skill_version), COMMIT_2);
    const v3 = generation(v1, bump(bump(v1.skill_version)), COMMIT_3);
    g.submit(v1);
    g.submit(v2);
    g.submit(v3);
    expect(g.rollbackGrammar(KEY, { sequence: 1 }, "back to the start").success).toBe(true);
    expect(g.active(KEY)?.sequence).toBe(1);
    // generation 2 is newer than the (restored) active generation: this is not a promotion path
    const forward = g.rollbackGrammar(KEY, { skill_version: v2.skill_version }, "forward?");
    expect(forward).toMatchObject({ success: false, refusal: "TARGET_NEWER_THAN_ACTIVE" });
  });

  it("refuses without changing anything: unknown context, nothing earlier, already active, quarantined, incompatible", () => {
    const { g, v1 } = twoGenerations();
    const snapshot = () => JSON.stringify([g.generations(KEY), g.history()]);
    const before = snapshot();

    expect(g.rollbackGrammar("NOPE.NOPE.NOPE.NOPE", "previous", "x").refusal).toBe("UNKNOWN_CONTEXT");
    expect(g.rollbackGrammar(KEY, { sequence: 99 }, "x").refusal).toBe("TARGET_NOT_FOUND");
    expect(g.rollbackGrammar(KEY, { sequence: 2 }, "x").refusal).toBe("TARGET_ALREADY_ACTIVE");
    expect(snapshot()).toBe(before);

    const solo = governor();
    solo.submit(v1);
    expect(solo.rollbackGrammar(KEY, "previous", "x").refusal).toBe("TARGET_NOT_FOUND");

    // quarantined: after rolling 2 -> 1, generation 2 may not be restored
    expect(g.rollbackGrammar(KEY, "previous", "first").success).toBe(true);
    expect(g.rollbackGrammar(KEY, { sequence: 2 }, "again").refusal).toBe("TARGET_QUARANTINED");
  });

  it("refuses a target that no longer passes verification under the current environment", () => {
    const g = new GrammarGovernor({ validation: { allowDirty: !strictBinding() } });
    const v1 = real();
    const v0 = mutate(v1, (s) => { s.compatibility.requires_capabilities = [...s.compatibility.requires_capabilities, "cap.constraint.anti-pattern-threshold@1"].sort(); });
    // generation 1 needs the extra capability, generation 2 (newer) does not
    const v2 = generation(v1, bump(v1.skill_version), COMMIT_2);
    g.submit(generation(v0, v1.skill_version, v1.source_ref.commit));
    g.submit(v2);
    g.applyEnvironment({ supportedCapabilities: SUPPORTED_CAPABILITIES.filter((c) => c !== "cap.constraint.anti-pattern-threshold@1") });
    const r = g.rollbackGrammar(KEY, "previous", "try");
    expect(r.success).toBe(false);
    expect(r.refusal).toBe("TARGET_INCOMPATIBLE");
    expect(r.issues?.map((i) => i.code)).toContain("SHEET_CAPABILITY_UNSUPPORTED");
    expect(g.active(KEY)?.sequence).toBe(2);
  });

  it("generations of different contexts are independent lineages", () => {
    const g = governor();
    const tang = real();
    const song = loadSheetJson(GOLDEN_CONTEXTS["MC-S01"]);
    g.submit(tang);
    g.submit(song);
    expect(g.contexts()).toHaveLength(2);
    g.submit(generation(tang, bump(tang.skill_version), COMMIT_2));
    expect(g.rollbackGrammar(KEY, "previous", "tang only").success).toBe(true);
    const songKey = contextKey(GOLDEN_CONTEXTS["MC-S01"]);
    expect(g.active(songKey)?.sequence).toBe(2);
    expect(g.generations(songKey)).toHaveLength(1);
  });
});
