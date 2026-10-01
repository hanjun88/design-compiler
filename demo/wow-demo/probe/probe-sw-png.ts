import { AestheticPipelineRunner } from "/home/user/Doubao/chats/38444189331382018/dc-audit/aesthetic-integration/aesthetic-pipeline-runner";
import type { AestheticConstraintSheet } from "/home/user/Doubao/chats/38444189331382018/dc-audit/aesthetic-integration/aesthetic-sheet-adapter";
import { tangEcommerceScenario } from "/home/user/Doubao/chats/38444189331382018/dc-audit/demo/e2e-aesthetic/src/scenarios/tang-ecommerce";
import { SoftwareRenderer } from "/home/user/Doubao/chats/38444189331382018/dc-audit/render-engine/software-renderer";
import * as fs from "fs";

const runner = new AestheticPipelineRunner();
const sheet = tangEcommerceScenario.sheet as unknown as AestheticConstraintSheet;
const result = runner.execute(sheet, { webgl2: true, floatTextures: true, highPrecisionFragment: true, anisotropyExtension: true }, { capturedAt: "2026-09-27T00:00:00.000Z", testCaseId: "tang-ecommerce" });
const sr = new SoftwareRenderer(960, 540);
const r = sr.render(result.pipeline.validatedIR as any, result.pipeline.executionPlan);
const { encodePNG } = require("/home/user/Doubao/chats/38444228562036226/wow-demo/lib/png-encode.js");
const png = encodePNG(r.width, r.height, Buffer.from(r.pixelBuffer));
fs.writeFileSync("/home/user/Doubao/chats/38444228562036226/wow-demo/probe/sw-frame.png", png);
console.log("WROTE", png.length, r.renderHash);
