/**
 * tests/probe-0b1-rimlight.ts
 *
 * Standalone 0b-1 SSOT rim-light end-to-end probe (NOT a jest *.test.ts suite —
 * run directly with ts-node):
 *
 *   npx ts-node --project tsconfig.test.json tests/probe-0b1-rimlight.ts
 *
 * It drives a real Chinese-aesthetic sheet (tang-ecommerce structure, extended
 * with lighting.rimLight{}) through AestheticPipelineRunner.execute() and prints
 * the resulting 3 lights + a byte-for-byte comparison of the runtime RimLight
 * against sheet.lighting.rimLight. Throws (non-zero exit) on any mismatch.
 */

import { AestheticPipelineRunner } from "../aesthetic-integration/aesthetic-pipeline-runner";
import type { AestheticConstraintSheet } from "../aesthetic-integration/aesthetic-sheet-adapter";
import type { HostCapabilities } from "../compiler-core/capability-negotiator";

const CAPTURED_AT = "2026-09-27T00:00:00.000Z";

const SSOT_RIM = {
  azimuth: 240,
  elevation: 38,
  color: "#7fb0d8",
  intensity: 1.25,
};

function makeTangSheetWithRim(
  rim: AestheticConstraintSheet["lighting"]["rimLight"],
): AestheticConstraintSheet {
  return {
    sheetId: "probe-0b1-tang-rim",
    designBrief: "唐代美学电商首页，华丽丰满色彩，对称布局",
    mood: "tang-tang",
    attributionStatement: "Tang court: lacquered cinnabar, matte gilt ornament.",
    structuralDimensions: [
      { id: "spatial-order", weight: "primary" },
      { id: "color", weight: "primary" },
    ],
    colorSystem: {
      palette: [
        { role: "dominant", name: "朱砂", hex: "#8E2F22", areaPct: 0.55, usage: "bg" },
        { role: "secondary", name: "絹白", hex: "#F0E2C0", areaPct: 0.3, usage: "text" },
        { role: "accent", name: "鎏金", hex: "#C9A24B", areaPct: 0.1, usage: "border" },
        { role: "shadow", name: "墨褐", hex: "#331610", areaPct: 0.05, usage: "deep" },
      ],
      saturationMax: 0.85,
      hardFailHex: ["#FF0000", "#FFD700", "#000000", "#00FFFF"],
    },
    proportion: {
      baseModulePx: 8,
      spacingScale: [1, 2, 3, 4, 6, 8, 12],
      voidSolidRatio: "4:6",
      focalPointsMax: 2,
    },
    spatial: { axis: "strict", bays: 3, hierarchyLevelsMin: 4 },
    composition: { negativeSpaceRatio: 0.4, symmetry: 1, focalPoint: [0.62, 0.38] },
    typography: { families: ["Songti SC", "Hei SC"] },
    lighting: {
      primarySource: "leaked",
      timeSetting: "dusk",
      lightDarkRatio: "4:6",
      rimLight: rim,
    },
    motion: {
      prototypes: ["lantern"],
      durationMs: [600, 2400],
      entryMode: "unfold",
      hardFail: ["bounce"],
    },
    antiCliche: { scanned: true, hardFailHits: [], forbidden: ["guochao-sticker"] },
    violations: [],
    score: 85,
  };
}

function main(): void {
  const runner = new AestheticPipelineRunner();
  const sheet = makeTangSheetWithRim(SSOT_RIM);
  const hostCaps: HostCapabilities = {
    webgl2: true,
    floatTextures: true,
    highPrecisionFragment: true,
    anisotropyExtension: true,
  };

  const result = runner.execute(sheet, hostCaps, {
    capturedAt: CAPTURED_AT,
    testCaseId: "PROBE-0b1-SSOT-RIM",
  });

  console.log("=== 0b-1 SSOT rim-light e2e probe ===");
  console.log(`pipeline.status      = ${result.pipeline.status}`);
  if (result.pipeline.status !== "SUCCESS") {
    console.error("FATAL: pipeline did not reach SUCCESS:", JSON.stringify(result.pipeline, null, 2));
    process.exit(1);
  }

  const lights = result.pipeline.executionPlan.runtimePlan.sceneBindings.lights;
  console.log(`light count          = ${lights.length}`);
  console.log(`light types          = [${lights.map((l) => l.type).join(", ")}]`);

  const rim = lights.find((l) => l.type === "RimLight");
  if (!rim) {
    console.error("FATAL: no RimLight in sceneBindings.lights");
    process.exit(1);
  }

  const checks: Array<{ field: string; sheetVal: unknown; runtimeVal: unknown }> = [
    { field: "azimuth", sheetVal: SSOT_RIM.azimuth, runtimeVal: rim.parameters.azimuth },
    { field: "elevation", sheetVal: SSOT_RIM.elevation, runtimeVal: rim.parameters.elevation },
    { field: "color", sheetVal: SSOT_RIM.color, runtimeVal: rim.parameters.color },
    { field: "intensity", sheetVal: SSOT_RIM.intensity, runtimeVal: rim.parameters.intensity },
  ];

  console.log("\n=== RimLight: runtime vs sheet.lighting.rimLight (byte-for-byte) ===");
  let allEqual = true;
  for (const c of checks) {
    const eq = c.sheetVal === c.runtimeVal;
    if (!eq) allEqual = false;
    console.log(
      `  ${c.field.padEnd(10)} sheet=${JSON.stringify(c.sheetVal)}  runtime=${JSON.stringify(c.runtimeVal)}  ${eq ? "EQUAL" : "MISMATCH"}`,
    );
  }

  // Also show the validated IR rimLight node for traceability.
  const validatedRim = (result.pipeline.validatedIR.validated.lighting as unknown as {
    rimLight?: Record<string, { value: unknown }>;
  }).rimLight;
  console.log("\nvalidated.lighting.rimLight present =", validatedRim !== undefined);
  console.log(
    "validated rimLight values           =",
    validatedRim
      ? `{ azimuth: ${validatedRim.azimuth?.value}, elevation: ${validatedRim.elevation?.value}, color: ${JSON.stringify(validatedRim.color?.value)}, intensity: ${validatedRim.intensity?.value} }`
      : "(absent)",
  );

  console.log(`\nVERDICT: ${allEqual ? "PASS — RimLight 4/4 fields byte-for-byte == sheet" : "FAIL — mismatch detected"}`);
  if (!allEqual) process.exit(1);
}

main();
