import { AestheticPipelineRunner } from "/home/user/Doubao/chats/38444189331382018/dc-audit/aesthetic-integration/aesthetic-pipeline-runner";
import type { AestheticConstraintSheet } from "/home/user/Doubao/chats/38444189331382018/dc-audit/aesthetic-integration/aesthetic-sheet-adapter";
import { tangEcommerceScenario } from "/home/user/Doubao/chats/38444189331382018/dc-audit/demo/e2e-aesthetic/src/scenarios/tang-ecommerce";
import { SoftwareRenderer } from "/home/user/Doubao/chats/38444189331382018/dc-audit/render-engine/software-renderer";

const runner = new AestheticPipelineRunner();
const sheet = tangEcommerceScenario.sheet as unknown as AestheticConstraintSheet;
const result = runner.execute(sheet, { webgl2: true, floatTextures: true, highPrecisionFragment: true, anisotropyExtension: true }, { capturedAt: "2026-09-27T00:00:00.000Z", testCaseId: "tang-ecommerce" });
if (result.pipeline.status !== "SUCCESS") { console.log("HALT"); process.exit(1); }

const sr = new SoftwareRenderer(480, 270);
const r = sr.render(result.pipeline.validatedIR as any, result.pipeline.executionPlan);
let nz = 0; for (let i = 0; i < r.pixelBuffer.length; i += 4) if (r.pixelBuffer[i] + r.pixelBuffer[i+1] + r.pixelBuffer[i+2] > 12) nz++;
console.log("SW_RENDER", JSON.stringify({ w: r.width, h: r.height, bytes: r.pixelBuffer.length, renderHash: r.renderHash, nonZero: nz, ms: r.renderExecutionMs, passes: r.rendererInfo.pipeline }));
