/**
 * Adversarial matrix: hostile or broken sheets, built by corrupting a REAL skill sheet in exactly one way
 * (and resealing every hash, so the defect under test is the only thing wrong), pushed through the real
 * chain. Each case must be refused fail-closed: by the validator with a specific code, by the compile entry
 * before any pipeline stage ran, and by the governor without touching the active generation.
 *
 *   A01 conflicting aesthetic rules        A06 unsupported capability
 *   A02 missing provenance                 A07 extreme negative space
 *   A03 stale skill version                A08 anti-cliché conflict
 *   A04 contract hash mismatch             A09 missing material role
 *   A05 malicious / invalid patch path     A10 confidence fuse
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { HostCapabilities } from "../../compiler-core/capability-negotiator";
import type { CangjieRawDesignIR } from "../../compiler-intent/types";
import type { AestheticConstraint, AestheticConstraintSheet, ConstraintOfKind } from "../../contracts/aesthetic-constraint-sheet/aesthetic-constraint-sheet.types";
import { GrammarGovernor } from "../../governance";
import { SheetRejectedError, collectSheetIssues, compileWithSheet, type SheetRejectionCode, type ValidateOptions } from "../../skill-bridge";
import { GOLDEN_CONTEXTS, contextKey, loadSheetJson, strictBinding } from "../support/skill-packs";
import { bindingFor, mutate } from "./helpers/sheet-tools";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const HOST: HostCapabilities = { webgl2: true, floatTextures: true, highPrecisionFragment: true, anisotropyExtension: true, maxFragmentUniformVectors: 1024 };
const CTX = GOLDEN_CONTEXTS["MC-T01"];
const KEY = contextKey(CTX);
const brief = (): CangjieRawDesignIR => read("tests/golden-case-matrix/fixtures/matrix-ir-templates/MC-T01.json");
const real = (): AestheticConstraintSheet => loadSheetJson(CTX);
const policy: Pick<ValidateOptions, "allowDirty"> = { allowDirty: !strictBinding() };

const chain = (sheet: unknown, validation: ValidateOptions) =>
  compileWithSheet({
    sheet,
    brief: brief(),
    validation: { ...policy, ...validation },
    g1Policy: read("config/g1-policy.json"),
    tierConfig: read("config/tier-mapping.json"),
    hostCapabilities: HOST,
    testCaseId: "ADVERSARIAL",
    capturedAt: "2026-09-16T00:00:00Z",
  });

const band = (s: AestheticConstraintSheet, parameter: string, semantics: string): ConstraintOfKind<"PARAMETER_BAND"> =>
  s.constraints.find((c) => c.kind === "PARAMETER_BAND" && c.payload.parameter === parameter && c.payload.semantics === semantics) as ConstraintOfKind<"PARAMETER_BAND">;
const rule = (s: AestheticConstraintSheet, prefix: string): ConstraintOfKind<"GRAMMAR_RULE"> =>
  s.constraints.find((c) => c.kind === "GRAMMAR_RULE" && c.rule_id.startsWith(prefix)) as ConstraintOfKind<"GRAMMAR_RULE">;

let extra = 0;
/** A copy of an existing constraint under a new identity (so duplicate-id checks do not mask the defect under test). */
function clone<K extends AestheticConstraint>(c: K, tag: string): K {
  const copy = JSON.parse(JSON.stringify(c)) as K;
  extra += 1;
  copy.rule_id = `ADV-${tag}-${extra}`;
  copy.decision_id = `D:ADV-${tag}-${extra}:TANG`;
  return copy;
}

interface Adversary {
  id: string;
  title: string;
  sheet: () => unknown;
  validation?: () => ValidateOptions;
  codes: SheetRejectionCode[];
}

const NEGATIVE_SPACE = "scene.composition.negativeSpaceRatio";
const ROUGHNESS = "scene.materials.roughness";

const adversaries: Adversary[] = [
  {
    id: "A01",
    title: "conflicting aesthetic rules: a hard floor that excludes the whole period band",
    sheet: () =>
      mutate(real(), (s) => {
        const periodBand = band(s, NEGATIVE_SPACE, "PERIOD_BAND");
        const floor = clone(periodBand, "CONFLICT");
        floor.payload = { ...floor.payload, semantics: "HARD_FLOOR", min: 0.97, max: 1, target: undefined };
        delete floor.payload.target;
        s.constraints.push(floor);
      }),
    codes: ["SHEET_RULE_CONFLICT"],
  },
  {
    id: "A02",
    title: "missing provenance: a decision whose source names nothing",
    sheet: () => mutate(real(), (s) => { s.constraints[0].provenance.sources[0].ref = "   "; }),
    codes: ["SHEET_PROVENANCE_MISSING"],
  },
  {
    id: "A02b",
    title: "tampered provenance: a decision edited after it was sealed",
    sheet: () => mutate(real(), (s) => { band(s, NEGATIVE_SPACE, "PERIOD_BAND").payload.max = 0.99; }, { reseal: false }),
    codes: ["SHEET_PROVENANCE_HASH_MISMATCH"],
  },
  {
    id: "A03",
    title: "stale skill version: outside the version range the compiler is bound to",
    sheet: () => mutate(real(), (s) => { s.skill_version = "0.9.0"; }),
    validation: () => ({ binding: { ...bindingFor(real()), skill: { version: real().skill_version, compatible_range: `^${real().skill_version}` } } }),
    codes: ["SHEET_SKILL_VERSION_STALE"],
  },
  {
    id: "A04",
    title: "contract hash mismatch: the sheet was produced against another contract",
    sheet: () => mutate(real(), (s) => { s.contract_hash = "ab".repeat(32); }),
    codes: ["SHEET_CONTRACT_HASH_MISMATCH"],
  },
  {
    id: "A06",
    title: "unsupported capability: the sheet needs something this compiler does not provide",
    sheet: () => mutate(real(), (s) => { s.compatibility.requires_capabilities = [...s.compatibility.requires_capabilities, "cap.render.raytracing@1"].sort(); }),
    codes: ["SHEET_CAPABILITY_UNSUPPORTED"],
  },
  {
    id: "A07",
    title: "extreme negative space: a ratio band that leaves the physical domain",
    sheet: () => mutate(real(), (s) => { const b = band(s, NEGATIVE_SPACE, "PERIOD_BAND"); b.payload.min = 0.4; b.payload.max = 1.8; }),
    codes: ["SHEET_DECISION_INVALID"],
  },
  {
    id: "A07b",
    title: "extreme negative space: a repair that pushes the void ratio past the band",
    sheet: () => mutate(real(), (s) => { rule(s, "CA-RULE-01").payload.mutation.value = 0.995; }),
    codes: ["SHEET_RULE_CONFLICT"],
  },
  {
    id: "A08",
    title: "anti-cliché conflict: an anti-AI repair outside the period's material band",
    sheet: () =>
      mutate(real(), (s) => {
        const r = rule(s, "ANTI-AI-01");
        const target = r.payload.patches?.[0] ?? { op: "replace" as const, path: r.payload.target_path };
        r.payload.patches = [{ ...target, op: "replace", value: 0.99 }];
        r.payload.mutation.value = 0.99;
      }),
    codes: ["SHEET_RULE_CONFLICT"],
  },
  {
    id: "A08b",
    title: "anti-cliché conflict: one anti-pattern subject decided twice",
    sheet: () =>
      mutate(real(), (s) => {
        const policyDecision = s.constraints.find((c) => c.kind === "OPERATION_POLICY") as ConstraintOfKind<"OPERATION_POLICY">;
        s.constraints.push(clone(policyDecision, "ANTI-DUP"));
      }),
    codes: ["SHEET_DUPLICATE_DECISION"],
  },
  {
    id: "A09",
    title: "missing material role: nothing in the sheet decides materials",
    sheet: () => mutate(real(), (s) => { s.constraints = s.constraints.filter((c) => c.role !== "material"); }),
    codes: ["SHEET_ROLE_MISSING"],
  },
  {
    id: "A10",
    title: "confidence fuse: one decision below the trust floor",
    sheet: () => mutate(real(), (s) => { s.constraints[0].confidence = 0.2; }),
    codes: ["SHEET_CONFIDENCE_BELOW_FUSE"],
  },
  {
    id: "A10b",
    title: "confidence fuse: the sheet's aggregate confidence is not the minimum of its decisions",
    sheet: () => mutate(real(), (s) => { s.confidence = 0.99; }, { reseal: false }),
    codes: ["SHEET_CONFIDENCE_INCONSISTENT", "SHEET_PROVENANCE_HASH_MISMATCH"],
  },
];

describe("adversarial matrix — every hostile sheet is refused fail-closed", () => {
  it("the unmodified real sheet is the control: it compiles", () => {
    const out = chain(real(), {});
    expect(out.pipeline?.status).toBe("SUCCESS");
  });

  it.each(adversaries)("$id $title", (a) => {
    const sheet = a.sheet();
    const validation = a.validation?.() ?? {};

    // 1. the validator names the defect
    const issues = collectSheetIssues(sheet, { ...policy, ...validation });
    const codes = new Set(issues.map((i) => i.code));
    for (const c of a.codes) expect(codes).toContain(c);

    // 2. the compile entry refuses before any pipeline stage runs
    let thrown: unknown;
    let result: unknown;
    try {
      result = chain(sheet, validation);
    } catch (e) {
      thrown = e;
    }
    expect(result).toBeUndefined();
    expect(thrown).toBeInstanceOf(SheetRejectedError);
    for (const c of a.codes) expect((thrown as SheetRejectedError).codes).toContain(c);

    // 3. the governor refuses and the active generation is untouched
    const g = new GrammarGovernor({ validation: policy });
    expect(g.submit(real()).status).toBe("ACTIVATED");
    const before = JSON.stringify([g.generations(KEY), g.active(KEY)]);
    const r = g.submit(sheet, validation.binding ? { binding: validation.binding } : {});
    expect(r.status).toBe("REJECTED");
    if (r.status === "REJECTED") for (const c of a.codes) expect(r.codes).toContain(c);
    expect(JSON.stringify([g.generations(KEY), g.active(KEY)])).toBe(before);
  });
});

describe("A05 malicious or invalid patch paths", () => {
  const paths = [
    "/__proto__/polluted",
    "/constructor/prototype/polluted",
    "/composition/__proto__/polluted",
    "../../etc/passwd",
    "/composition/noSuchParameter/value",
    "/composition/negativeSpaceRatio/value/../../../camera",
    "",
    "composition/negativeSpaceRatio/value",
    "/composition/negativeSpaceRatio/~2",
  ];

  it.each(paths)("patch path %j is refused as SHEET_PATCH_PATH_INVALID (or the schema) and never applied", (p) => {
    const sheet = mutate(real(), (s) => {
      const r = rule(s, "CA-RULE-01");
      r.payload.patches = [{ op: "replace", path: p, value: 0.5 }];
    });
    const issues = collectSheetIssues(sheet, policy);
    const codes = issues.map((i) => i.code);
    expect(codes.some((c) => c === "SHEET_PATCH_PATH_INVALID" || c === "SHEET_SCHEMA_INVALID")).toBe(true);
    expect(() => chain(sheet, {})).toThrow(SheetRejectedError);
    // nothing leaked into the prototype chain
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, "polluted")).toBe(false);
  });

  it("a path in the patch list of an otherwise valid rule poisons the whole sheet, not just the rule", () => {
    const sheet = mutate(real(), (s) => {
      rule(s, "CA-RULE-02").payload.patches = [{ op: "replace", path: "/composition/negativeSpaceRatio/value", value: 0.4 }, { op: "replace", path: "/__proto__/x", value: 1 }];
    });
    const g = new GrammarGovernor({ validation: policy });
    const r = g.submit(sheet);
    expect(r.status).toBe("REJECTED");
    expect(g.contexts()).toEqual([]);
  });
});

describe("rejection is total", () => {
  it("a rejected sheet leaves no trace in the compiler's input and produces no output", () => {
    const b = brief();
    const before = JSON.stringify(b);
    const bad = mutate(real(), (s) => { s.contract_hash = "cd".repeat(32); });
    expect(() =>
      compileWithSheet({ sheet: bad, brief: b, validation: policy, g1Policy: read("config/g1-policy.json"), tierConfig: read("config/tier-mapping.json"), hostCapabilities: HOST, testCaseId: "ADVERSARIAL", capturedAt: "2026-09-16T00:00:00Z" }),
    ).toThrow(SheetRejectedError);
    expect(JSON.stringify(b)).toBe(before);
  });

  it("several defects at once report all of them", () => {
    const bad = mutate(real(), (s) => {
      s.contract_hash = "ef".repeat(32);
      s.constraints[0].confidence = 0.1;
      s.compatibility.requires_capabilities = [...s.compatibility.requires_capabilities, "cap.render.raytracing@1"].sort();
    });
    const codes = new Set(collectSheetIssues(bad, policy).map((i) => i.code));
    expect([...codes]).toEqual(expect.arrayContaining(["SHEET_CONTRACT_HASH_MISMATCH", "SHEET_CONFIDENCE_BELOW_FUSE", "SHEET_CAPABILITY_UNSUPPORTED"]));
  });
});
