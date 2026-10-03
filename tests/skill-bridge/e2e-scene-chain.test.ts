/**
 * Real cross-repo chain, aesthetic half (unmocked):
 *   skill sheet -> Core pipeline (RFC 6902 patches) -> ValidatedDesignIR -> reference render
 *   -> physical evidence -> graph -> anti-pattern gate -> period grammar -> AestheticExecutionPlan
 *   -> AestheticRuntimePlan -> SceneCompilationIR (4-A contract, provenance chain)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { compileWithSheet, runSceneChain } from "../../skill-bridge";
import type { CangjieRawDesignIR } from "../../compiler-intent/types";
import type { HostCapabilities } from "../../compiler-core/capability-negotiator";
import { GOLDEN_CONTEXTS, loadSheetJson, strictBinding } from "../support/skill-packs";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const HOST: HostCapabilities = { webgl2: true, floatTextures: true, highPrecisionFragment: true, anisotropyExtension: true, maxFragmentUniformVectors: 1024 };
const AT = "2026-09-16T00:00:00Z";

function chain(cell: keyof typeof GOLDEN_CONTEXTS) {
  const ctx = GOLDEN_CONTEXTS[cell];
  const core = compileWithSheet({
    sheet: loadSheetJson(ctx),
    brief: read(`tests/golden-case-matrix/fixtures/matrix-ir-templates/${cell}.json`) as CangjieRawDesignIR,
    validation: { allowDirty: !strictBinding() },
    g1Policy: read("config/g1-policy.json"),
    tierConfig: read("config/tier-mapping.json"),
    hostCapabilities: HOST,
    testCaseId: `E2E-${cell}`,
    capturedAt: AT,
  });
  if (core.pipeline?.status !== "SUCCESS") throw new Error(`core pipeline did not succeed for ${cell}`);
  return { core, scene: runSceneChain({ core: core.pipeline, pack: core.pack, sceneId: "unused", compiledAt: AT }) };
}

describe("sheet -> ... -> SceneCompilationIR (real, unmocked)", () => {
  for (const cell of ["MC-S01", "MC-T01"] as const) {
    it(`${cell}: every stage produces its artefact and the scene IR satisfies the 4-A contract`, () => {
      const { core, scene } = chain(cell);
      expect(scene.evidence.pixel.negativeSpaceRatio).toBeDefined();
      expect(scene.graph.topologyAudit.status).toBe("PASS");
      expect(scene.plan.period).toBe(core.pack.period);
      expect(scene.runtimePlan.sourcePlanDigest).toBe(scene.plan.planDigest);
      expect(scene.sceneIR.sourceProvenance.validatedDesignIRHash).toBe(core.pipeline!.status === "SUCCESS" ? core.pipeline!.hashChain.validatedIRHash : "");
      if (!scene.sceneIRValidation.valid) console.log(JSON.stringify(scene.sceneIRValidation.violations, null, 1));
      expect(scene.sceneIRValidation.violations).toEqual([]);
      expect(scene.sceneIRValidation.valid).toBe(true);
      console.log(cell, "blocks:", (scene.sceneIR.capabilityBlocks ?? []).map((b) => `${b.code}:${b.affectedParameter}`).join(","), "ops applied:", scene.plan.stats.appliedOperations);
    });
  }
});
