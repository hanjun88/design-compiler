/**
 * The requirement manifests (skill-bridge/requirements/*) are the compiler's declared interface to a sheet. The real
 * chain is run for every golden context and every decision it actually READS is compared with that interface:
 * a policy key, singleton decision or grammar rule read at runtime but not declared would let a sheet pass validation
 * and then fail (or, worse, be satisfied by a default) in the middle of a compilation.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { compileWithSheet, runSceneChain, REQUIRED_DECISIONS, type DecisionRequirement, type DecisionUse } from "../../skill-bridge";
import type { CangjieRawDesignIR } from "../../compiler-intent/types";
import type { HostCapabilities } from "../../compiler-core/capability-negotiator";
import { GOLDEN_CONTEXTS, loadSheetJson, strictBinding } from "../support/skill-packs";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const HOST: HostCapabilities = { webgl2: true, floatTextures: true, highPrecisionFragment: true, anisotropyExtension: true, maxFragmentUniformVectors: 1024 };
const AT = "2026-09-16T00:00:00Z";

const declaredKeys = (r: DecisionRequirement): string[] => [r.params, r.flags, r.enums, r.vectors, r.lists].flatMap((list) => list ?? []);

/** `KIND|subject|key` tokens of everything the manifests declare (policies at key level, singletons without subject). */
function declaredTokens(): Set<string> {
  const out = new Set<string>();
  for (const r of REQUIRED_DECISIONS) {
    if (r.kind === "OPERATION_POLICY" || r.kind === "ANTI_PATTERN_THRESHOLD" || r.kind === "EVALUATION_ASSERTION") for (const k of declaredKeys(r)) out.add(`${r.kind}|${r.subject}|${k}`);
    else out.add(`${r.kind}|${r.subject ?? ""}`);
  }
  return out;
}

const tokenOf = (u: DecisionUse): string | null => {
  if (u.kind === "OPERATION_POLICY" || u.kind === "ANTI_PATTERN_THRESHOLD" || u.kind === "EVALUATION_ASSERTION") return u.key ? `${u.kind}|${u.subject}|${u.key}` : null;
  if (u.kind === "PRIORITY_ORDER" || u.kind === "SCORING_WEIGHTS") return `${u.kind}|`;
  return null; // PARAMETER_BAND (optional period bands are read when present) and GRAMMAR_RULE (the sheet's own rule list) are not key-level interface
};

function usageOf(cell: keyof typeof GOLDEN_CONTEXTS): readonly DecisionUse[] {
  const ctx = GOLDEN_CONTEXTS[cell];
  const core = compileWithSheet({
    sheet: loadSheetJson(ctx),
    brief: read(`tests/golden-case-matrix/fixtures/matrix-ir-templates/${cell}.json`) as CangjieRawDesignIR,
    validation: { allowDirty: !strictBinding() },
    g1Policy: read("config/g1-policy.json"),
    tierConfig: read("config/tier-mapping.json"),
    hostCapabilities: HOST,
    testCaseId: `COVERAGE-${cell}`,
    capturedAt: AT,
  });
  if (core.pipeline?.status !== "SUCCESS") throw new Error(`core pipeline did not succeed for ${cell}`);
  runSceneChain({ core: core.pipeline, pack: core.pack, sceneId: "coverage", compiledAt: AT });
  return core.pack.usage();
}

describe("the manifests declare every decision the real chain reads", () => {
  const declared = declaredTokens();

  it.each(Object.keys(GOLDEN_CONTEXTS))("%s: no policy key, singleton decision or grammar rule is read without being declared", (cell) => {
    const uses = usageOf(cell as keyof typeof GOLDEN_CONTEXTS);
    expect(uses.length).toBeGreaterThan(0);
    const undeclared = [...new Set(uses.map(tokenOf).filter((t): t is string => t !== null && !declared.has(t)))];
    expect(undeclared).toEqual([]);
  });

  it("the chain reads decisions of every kind the manifests declare (the manifest is not decorative)", () => {
    const readKinds = new Set(Object.keys(GOLDEN_CONTEXTS).flatMap((c) => usageOf(c as keyof typeof GOLDEN_CONTEXTS).map((u) => u.kind)));
    const declaredKinds = new Set(REQUIRED_DECISIONS.map((r) => r.kind));
    for (const k of declaredKinds) if (k !== "PARAMETER_BAND") expect(readKinds).toContain(k);
  });
});
