/**
 * tests/aesthetic-integration/rimlight-ssot.test.ts
 *
 * 0b-1 end-to-end SSOT closure for rim light:
 *
 *   real CAS-style sheet
 *     → sheetToCangjieIR()        (/lighting/rimLight/* verbatim params)
 *     → normalizeIntent()         (coreIR.lighting.rimLight{} assembled)
 *     → AestheticPipelineRunner.execute()
 *     → 3 lights: KeyLight / AmbientLight / RimLight
 *
 * and the runtime RimLight's azimuth/elevation/color/intensity must be
 * BYTE-FOR-BYTE equal to sheet.lighting.rimLight (no derivation, no rounding).
 *
 * Downstream (compiler-core) is frozen and already implements the SSOT pass-through
 * in buildLightingBindings; these tests close the DC-side adapter/normalizer gap.
 */

import { AestheticPipelineRunner } from "../../aesthetic-integration/aesthetic-pipeline-runner";
import {
  sheetToCangjieIR,
  type AestheticConstraintSheet,
} from "../../aesthetic-integration/aesthetic-sheet-adapter";
import { normalizeIntent } from "../../compiler-intent/intent-normalizer";
import type { HostCapabilities } from "../../compiler-core/capability-negotiator";

// ── Fixtures ───────────────────────────────────────────────────────────────

const DETERMINISTIC_CAPTURED_AT = "2026-09-27T00:00:00.000Z";

/**
 * Tang-ecommerce sheet mirrored from demo/e2e-aesthetic/src/scenarios/tang-ecommerce.ts
 * (real Chinese-aesthetic scenario structure: cinnabar palette, strict axis, leaked/dusk
 * lighting). We extend it with the 0b-1 optional SSOT rimLight{} descriptor.
 */
function makeTangSheetWithRim(
  rim: AestheticConstraintSheet["lighting"]["rimLight"],
): AestheticConstraintSheet {
  return {
    sheetId: "probe-0b1-tang-rim",
    designBrief: "唐代美学电商首页，华丽丰满色彩，对称布局",
    mood: "tang-tang",
    attributionStatement:
      "Tang court: lacquered cinnabar, matte gilt ornament, symmetric frame, full composition.",
    structuralDimensions: [
      { id: "spatial-order", weight: "primary" },
      { id: "color", weight: "primary" },
    ],
    colorSystem: {
      palette: [
        { role: "dominant", name: "朱砂 Cinnabar", hex: "#8E2F22", areaPct: 0.55, usage: "hero background" },
        { role: "secondary", name: "絹白 Silk-Cream", hex: "#F0E2C0", areaPct: 0.3, usage: "text" },
        { role: "accent", name: "鎏金 Gilt", hex: "#C9A24B", areaPct: 0.1, usage: "border / price" },
        { role: "shadow", name: "墨褐 Ink-Brown", hex: "#331610", areaPct: 0.05, usage: "deep tone" },
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
    // primarySource=leaked ⇒ derived rimLightPresent=true (key azimuth=45°, so the
    // *derived* fallback rim would be azimuth=225°, elevation=0.25, color=accent,
    // intensity=0.6). Our SSOT rim values below deliberately differ on every axis
    // so any derivation would be caught by the verbatim assertions.
    lighting: {
      primarySource: "leaked",
      timeSetting: "dusk",
      lightDarkRatio: "4:6",
      rimLight: rim,
    },
    motion: {
      prototypes: ["lantern", "chariot"],
      durationMs: [600, 2400],
      entryMode: "unfold",
      hardFail: ["bounce", "particle"],
    },
    antiCliche: {
      scanned: true,
      hardFailHits: [],
      forbidden: ["guochao-sticker", "purple-gradient", "glassmorphism", "emoji-icon"],
    },
    violations: [],
    score: 85,
  };
}

/** A complete SSOT rim descriptor, deliberately NOT matching the derived fallback. */
const SSOT_RIM = {
  azimuth: 240, // derived fallback would be (45+180)%360 = 225
  elevation: 38, // derived fallback would be 0.25
  color: "#7fb0d8", // derived fallback would be accent #C9A24B
  intensity: 1.25, // derived fallback would be 0.6
};

function fullCaps(): HostCapabilities {
  return { webgl2: true, floatTextures: true, highPrecisionFragment: true, anisotropyExtension: true };
}

// ============================================================================
// (a) Adapter mapping: sheet.lighting.rimLight → /lighting/rimLight/* params
// ============================================================================
describe("0b-1 adapter: sheet.lighting.rimLight → Cangjie /lighting/rimLight/*", () => {
  test("emits 4 verbatim rimLight params when the sheet carries a SSOT rimLight{}", () => {
    const sheet = makeTangSheetWithRim(SSOT_RIM);
    const { cangjieIR } = sheetToCangjieIR(sheet, { capturedAt: DETERMINISTIC_CAPTURED_AT });

    const byPath = new Map(cangjieIR.parameters.map((p) => [p.path, p]));

    // The 4 SSOT params exist, values passed through verbatim (no rounding).
    expect(byPath.get("/lighting/rimLight/azimuth")?.value).toBe(SSOT_RIM.azimuth);
    expect(byPath.get("/lighting/rimLight/elevation")?.value).toBe(SSOT_RIM.elevation);
    expect(byPath.get("/lighting/rimLight/color")?.value).toBe(SSOT_RIM.color);
    expect(byPath.get("/lighting/rimLight/intensity")?.value).toBe(SSOT_RIM.intensity);

    // Units mirror the physical meaning (degrees / hex / scalar).
    expect(byPath.get("/lighting/rimLight/azimuth")?.unit).toBe("degrees");
    expect(byPath.get("/lighting/rimLight/elevation")?.unit).toBe("degrees");
    expect(byPath.get("/lighting/rimLight/color")?.unit).toBe("hex");
    expect(byPath.get("/lighting/rimLight/intensity")?.unit).toBe("scalar");

    // The derived rimLightPresent boolean is still emitted (leaked ≠ skylight).
    expect(byPath.get("/lighting/rimLightPresent")?.value).toBe(true);
  });

  test("emits NO rimLight* params (keeps 24) when the sheet has no rimLight", () => {
    const sheet = makeTangSheetWithRim(undefined);
    const { cangjieIR } = sheetToCangjieIR(sheet, { capturedAt: DETERMINISTIC_CAPTURED_AT });

    // No /lighting/rimLight/* params at all → derived fallback path unchanged.
    const rimParams = cangjieIR.parameters.filter((p) => p.path.startsWith("/lighting/rimLight/"));
    expect(rimParams).toEqual([]);

    // rimLightPresent still derived (leaked → true) and total count stays at the
    // Contract-A baseline of 24 (5 color + 4 composition + 7 lighting + 4 materials + 4 camera).
    expect(cangjieIR.parameters.length).toBe(24);
  });
});

// ============================================================================
// (c) Normalizer assembly: /lighting/rimLight/* → coreIR.lighting.rimLight{}
// ============================================================================
describe("0b-1 normalizer: /lighting/rimLight/* → coreIR.lighting.rimLight{}", () => {
  test("assembles rimLight{} carrying four RawParameters from the four new pointers", () => {
    const sheet = makeTangSheetWithRim(SSOT_RIM);
    const { cangjieIR } = sheetToCangjieIR(sheet, { capturedAt: DETERMINISTIC_CAPTURED_AT });

    const norm = normalizeIntent(cangjieIR, { capturedAt: DETERMINISTIC_CAPTURED_AT });
    expect(norm.status).toBe("PASS");

    const lighting = norm.coreIR.lighting as unknown as {
      rimLight?: {
        azimuth: { value: number };
        elevation: { value: number };
        color: { value: string };
        intensity: { value: number };
      };
    };

    // The optional container materializes ONLY because the adapter emitted rim params.
    expect(lighting.rimLight).toBeDefined();
    expect(lighting.rimLight?.azimuth.value).toBe(SSOT_RIM.azimuth);
    expect(lighting.rimLight?.elevation.value).toBe(SSOT_RIM.elevation);
    expect(lighting.rimLight?.color.value).toBe(SSOT_RIM.color);
    expect(lighting.rimLight?.intensity.value).toBe(SSOT_RIM.intensity);
  });

  test("leaves lighting.rimLight ABSENT (no container) when no rimLight params are emitted", () => {
    const sheet = makeTangSheetWithRim(undefined);
    const { cangjieIR } = sheetToCangjieIR(sheet, { capturedAt: DETERMINISTIC_CAPTURED_AT });

    const norm = normalizeIntent(cangjieIR, { capturedAt: DETERMINISTIC_CAPTURED_AT });
    const lighting = norm.coreIR.lighting as unknown as Record<string, unknown>;
    // No spurious empty container → downstream buildLightingBindings falls back to
    // the derived rim (rimLightPresent) instead of reading placeholder rim values.
    expect(lighting.rimLight).toBeUndefined();
  });
});

// ============================================================================
// (d) Full-chain probe: real sheet → execute() → 3 lights, rim verbatim
// ============================================================================
describe("0b-1 e2e probe: real sheet → AestheticPipelineRunner.execute() → 3 lights", () => {
  const runner = new AestheticPipelineRunner();

  test("execute emits exactly KeyLight/AmbientLight/RimLight with rim == sheet (byte-for-byte)", () => {
    const sheet = makeTangSheetWithRim(SSOT_RIM);
    const result = runner.execute(sheet, fullCaps(), {
      capturedAt: DETERMINISTIC_CAPTURED_AT,
      testCaseId: "PROBE-0b1-SSOT-RIM",
    });

    expect(result.pipeline.status).toBe("SUCCESS");
    if (result.pipeline.status !== "SUCCESS") {
      throw new Error(`pipeline not SUCCESS: ${JSON.stringify(result.pipeline)}`);
    }

    const lights = result.pipeline.executionPlan.runtimePlan.sceneBindings.lights;
    expect(lights.map((l) => l.type)).toEqual(["KeyLight", "AmbientLight", "RimLight"]);

    const rim = lights.find((l) => l.type === "RimLight")!;
    // Byte-for-byte equality against sheet.lighting.rimLight — no derivation.
    expect(rim.parameters.azimuth).toBe(SSOT_RIM.azimuth);
    expect(rim.parameters.elevation).toBe(SSOT_RIM.elevation);
    expect(rim.parameters.color).toBe(SSOT_RIM.color);
    expect(rim.parameters.intensity).toBe(SSOT_RIM.intensity);

    // Guard: prove the SSOT values are NOT the derived fallback (which would be
    // azimuth=225, elevation=0.25, color=accent #C9A24B, intensity=0.6).
    expect(rim.parameters.azimuth).not.toBe((45 + 180) % 360);
    expect(rim.parameters.color).not.toBe("#C9A24B");
    expect(rim.parameters.intensity).not.toBe(0.6);
  });

  test("no SSOT sheet → derived fallback rim still projects (regression guard)", () => {
    const sheet = makeTangSheetWithRim(undefined);
    const result = runner.execute(sheet, fullCaps(), {
      capturedAt: DETERMINISTIC_CAPTURED_AT,
      testCaseId: "PROBE-0b1-FALLBACK",
    });
    expect(result.pipeline.status).toBe("SUCCESS");
    if (result.pipeline.status !== "SUCCESS") return;

    const lights = result.pipeline.executionPlan.runtimePlan.sceneBindings.lights;
    // leaked ⇒ rimLightPresent=true ⇒ derived RimLight still appears (3 lights),
    // but its values come from the derived fallback, not a phantom SSOT descriptor.
    expect(lights.map((l) => l.type)).toEqual(["KeyLight", "AmbientLight", "RimLight"]);
    const rim = lights.find((l) => l.type === "RimLight")!;
    expect(rim.parameters.azimuth).toBe((45 + 180) % 360); // derived mirror
    expect(rim.parameters.color).toBe("#C9A24B"); // derived accent
    expect(rim.parameters.intensity).toBe(0.6); // derived constant
  });
});
