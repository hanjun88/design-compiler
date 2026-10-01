// Probe: run the REAL AestheticPipelineRunner on the tang-ecommerce sheet and
// dump the full executionPlan.sceneBindings (lights/materials/camera).
import { AestheticPipelineRunner } from "/home/user/Doubao/chats/38444189331382018/dc-audit/aesthetic-integration/aesthetic-pipeline-runner";
import type { AestheticConstraintSheet } from "/home/user/Doubao/chats/38444189331382018/dc-audit/aesthetic-integration/aesthetic-sheet-adapter";
import { tangEcommerceScenario } from "/home/user/Doubao/chats/38444189331382018/dc-audit/demo/e2e-aesthetic/src/scenarios/tang-ecommerce";

const runner = new AestheticPipelineRunner();
const sheet = tangEcommerceScenario.sheet as unknown as AestheticConstraintSheet;
const result = runner.execute(sheet, {
  webgl2: true, floatTextures: true, highPrecisionFragment: true, anisotropyExtension: true,
}, { capturedAt: "2026-09-27T00:00:00.000Z", testCaseId: "tang-ecommerce" });

console.log("STATUS", result.pipeline.status);
if (result.pipeline.status === "SUCCESS") {
  const plan = result.pipeline.executionPlan;
  console.log("SELECTED_TIER", plan.negotiation.selectedTier);
  console.log("RENDERER", JSON.stringify(plan.runtimePlan.pipeline, null, 2));
  console.log("CAMERA", JSON.stringify(plan.runtimePlan.sceneBindings.cameraRig, null, 2));
  console.log("LIGHTS", JSON.stringify(plan.runtimePlan.sceneBindings.lights, null, 2));
  console.log("MATERIALS", JSON.stringify(plan.runtimePlan.sceneBindings.materials, null, 2));
  console.log("HASH_CHAIN", JSON.stringify(result.pipeline.hashChain, null, 2));
} else {
  console.log("HALT", JSON.stringify((result.pipeline as any).evaluation?.diagnostics, null, 2));
}
