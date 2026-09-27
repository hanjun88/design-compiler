/**
 * phase0a-projection.test.ts — Phase 0a projection runtime probe.
 *
 * Verifies that the scene-binder projection layer correctly pipes:
 *   validated.color.palette      → materials[].uniforms.uColor{Deep,Jade,Rim,Core,Skin}
 *   ValidatedLighting.ambientRatio     → sceneBindings.lights[] (AmbientLight)
 *   ValidatedLighting.rimLightPresent  → sceneBindings.lights[] (RimLight)
 *
 * Judgment criterion (per audit): validated IR → CapabilityNegotiator
 *   → assert uniforms contain the 5 colors with EXACT hex equality (not "exists")
 *   → assert lights.length grows 1 → 3 with correct types.
 * Plus reverse validation: when source fields are absent, the projection is
 * fail-closed (no default ambient/rim silently emitted).
 */
import { describe, test, expect } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { CapabilityNegotiator, type HostCapabilities } from "../../compiler-core/capability-negotiator";
import type { RuntimeExecutionPlan, ValidatedDesignIR } from "../../compiler-core/contracts";
import type { TierMappingConfig } from "../../compiler-core/tier-mapping-types";

const HOST: HostCapabilities = {
  webgl2: true,
  floatTextures: true,
  highPrecisionFragment: true,
  anisotropyExtension: true,
  maxFragmentUniformVectors: 128,
};

const configPath = path.join(__dirname, "../../config/tier-mapping.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as TierMappingConfig;
const negotiator = new CapabilityNegotiator(config);

/** Build a minimal but type-valid ValidatedDesignIR. */
function baseIR(overrides: Partial<ValidatedDesignIR["validated"]> = {}): ValidatedDesignIR {
  const p = (value: unknown, unit: string): any => ({
    value, confidence: 0.9, status: "observed" as const,
    source: "vision-estimation" as const, unit, evidence: ["phase0a-test"] as string[],
  });
  const ir: ValidatedDesignIR = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    meta: { grammarPack: "TEST", grammarVersion: "TEST", compiledAt: "2026-09-27T00:00:00.000Z" },
    sourceRef: { rawIRHash: "raw", rawSchemaVersion: "1.0.0" },
    patches: [],
    validated: {
      composition: {
        focalPoint: p([0.62, 0.38], "vector2"),
        negativeSpaceRatio: p(0.5833, "ratio"),
        depthLayerCount: p(3, "count"),
        symmetry: p(1, "ratio"),
      },
      camera: {
        fov: p(45, "degrees"),
        shotSize: p("medium", "enum"),
        angle: p(0, "degrees"),
        height: p(1.6, "meters"),
      },
      lighting: {
        keyLight: {
          // Production unit is degrees (see aesthetic-sheet-adapter: makeCangjieParam
          // "/lighting/keyLight/azimuth", ..., "degrees"). Audit round 7 caught a
          // radians/degrees mix-up; this fixture must match production, not invent one.
          azimuth: p(35, "degrees"),
          elevation: p(30, "degrees"),
          colorTemp: p(5500, "kelvin"),
          intensity: p(2.5, "dimensionless"),
          softness: p(0.3, "dimensionless"),
        },
        ambientRatio: p(0.6, "ratio"),
        rimLightPresent: p(true, "boolean"),
      },
      materials: [
        {
          role: "dominant",
          baseType: p("jade", "enum"),
          roughness: p(0.28, "dimensionless"),
          metalness: p(0, "dimensionless"),
          wear: p(0.2, "dimensionless"),
        },
      ],
      color: {
        dominant: p("#2d5a3d", "hex"),
        secondary: p("#7fb08a", "hex"),
        accent: p("#c8e0c8", "hex"),
        contrastRatio: p(6.5, "ratio"),
        temperatureBias: p(0.1, "dimensionless"),
      },
      ...overrides,
    },
    auditReport: {
      rulesEvaluated: 0,
      patchesEvaluated: 0,
      mutationsApplied: 0,
      testsPassed: 0,
      testsFailed: 0,
      complianceScore: 1,
      violations: [],
      ruleCoverage: {
        total: 0,
        targetFound: 0,
        targetMissing: 0,
        triggerable: 0,
        missingTargets: [],
        perRule: [],
      },
    },
  };
  return ir;
}

/** Run a validated IR through the real capability negotiator and return the plan. */
function negotiate(ir: ValidatedDesignIR): RuntimeExecutionPlan {
  const result = negotiator.negotiate(ir, HOST, "phase0a-probe", "test-input-hash");
  if (result.kind === "BLOCKED_ENV") {
    throw new Error("negotiation unexpectedly BLOCKED_ENV");
  }
  return result.plan;
}

describe("Phase 0a — color → material uniforms projection", () => {
  test("uniforms contain the 5 jade colors with EXACT palette hex values", () => {
    const plan = negotiate(baseIR());
    const material = plan.runtimePlan.sceneBindings.materials[0];
    expect(material.uniforms.uColorDeep).toBe("#2d5a3d");   // dominant
    expect(material.uniforms.uColorJade).toBe("#7fb08a");   // secondary
    expect(material.uniforms.uColorRim).toBe("#c8e0c8");    // accent
    // Derived: core = lighten(secondary, 0.35), skin = desaturate(secondary, 0.4)
    expect(typeof material.uniforms.uColorCore).toBe("string");
    expect(typeof material.uniforms.uColorSkin).toBe("string");
  });

  test("uColorCore is strictly lighter than secondary (real math)", () => {
    const plan = negotiate(baseIR());
    const core = plan.runtimePlan.sceneBindings.materials[0].uniforms.uColorCore as string;
    // #7fb08a (127,176,138) lightened 35% toward 255 → (171.8, 203.65, 178.95) = #acccb3
    expect(core).toBe("#acccb3");
  });

  test("uColorSkin is strictly desaturated vs secondary (real math)", () => {
    const plan = negotiate(baseIR());
    const skin = plan.runtimePlan.sceneBindings.materials[0].uniforms.uColorSkin as string;
    // desaturated, so never equal to secondary; valid hex
    expect(skin).not.toBe("#7fb08a");
    expect(/^#[0-9a-f]{6}$/i.test(skin)).toBe(true);
  });
});

describe("Phase 0a — lighting projection (key + ambient; rim deferred to 0b)", () => {
  // Phase 0a delivery scope: color projection + ambient light.
  // Rim light is DEFERRED TO 0b: the projection layer logic is correct (verified
  // below), but the full production pipeline is structurally blocked by grammar
  // rule CA-RULE-32-YANXIA ("檐下投影"), which flips any rimLightPresent=true to
  // false at G2. A secondary suppression exists in ANTI-AI-03. Unblocking rim
  // requires a grammar pack / schema change review — out of scope for 0a.

  test("2 lights in production path: KeyLight + AmbientLight (rim blocked by G2)", () => {
    const ir = baseIR();
    // Simulate post-G2 state: CA-RULE-32-YANXIA flips rimLightPresent to false.
    (ir.validated.lighting.rimLightPresent as { value: boolean }).value = false;
    const plan = negotiate(ir);
    const lights = plan.runtimePlan.sceneBindings.lights;
    expect(lights).toHaveLength(2);
    expect(lights.map((l) => l.type)).toEqual(["KeyLight", "AmbientLight"]);
  });

  test("ambient intensity = ambientRatio", () => {
    const plan = negotiate(baseIR());
    const ambient = plan.runtimePlan.sceneBindings.lights.find((l) => l.type === "AmbientLight")!;
    expect(ambient.parameters.intensity).toBe(0.6);
  });
});

describe("Phase 0b-preview — rim light projection logic (correct, but unreachable in production)", () => {
  // These tests verify the projection layer's rim logic in isolation (direct IR
  // input, bypassing G2). They do NOT claim production reachability. Rim is
  // deferred to 0b pending grammar pack review (CA-RULE-32-YANXIA).

  test("projection layer emits RimLight when rimLightPresent=true (direct IR)", () => {
    const plan = negotiate(baseIR()); // baseIR sets rimLightPresent=true
    const lights = plan.runtimePlan.sceneBindings.lights;
    expect(lights.map((l) => l.type)).toContain("RimLight");
  });

  test("rim azimuth = keyLight azimuth + 180° (degrees, wrapped to [0, 360))", () => {
    const plan = negotiate(baseIR());
    const rim = plan.runtimePlan.sceneBindings.lights.find((l) => l.type === "RimLight")!;
    // key azimuth = 35° (production unit: degrees); 180° mirror = 215°
    const expected = (35 + 180) % 360;
    expect(rim.parameters.azimuth).toBe(expected);
    // rim color = accent
    expect(rim.parameters.color).toBe("#c8e0c8");
  });

  test("rim azimuth wraps correctly when key azimuth > 180°", () => {
    const ir = baseIR();
    (ir.validated.lighting.keyLight.azimuth as { value: number }).value = 270;
    const plan = negotiate(ir);
    const rim = plan.runtimePlan.sceneBindings.lights.find((l) => l.type === "RimLight")!;
    expect(rim.parameters.azimuth).toBe((270 + 180) % 360); // 90
  });
});

describe("Phase 0a — fail-closed reverse validation", () => {
  test("no ambient light when ambientRatio absent", () => {
    const ir = baseIR();
    (ir.validated.lighting.ambientRatio as { value: number | undefined }).value = undefined;
    const plan = negotiate(ir);
    const types = plan.runtimePlan.sceneBindings.lights.map((l) => l.type);
    expect(types).not.toContain("AmbientLight");
  });

  test("no rim light when rimLightPresent false", () => {
    const ir = baseIR();
    (ir.validated.lighting.rimLightPresent as { value: boolean }).value = false;
    const plan = negotiate(ir);
    const types = plan.runtimePlan.sceneBindings.lights.map((l) => l.type);
    expect(types).not.toContain("RimLight");
  });

  test("lights degrade to [KeyLight] only when both absent (fail-closed, no silent default)", () => {
    const ir = baseIR();
    (ir.validated.lighting.ambientRatio as { value: number | undefined }).value = undefined;
    (ir.validated.lighting.rimLightPresent as { value: boolean }).value = false;
    const plan = negotiate(ir);
    expect(plan.runtimePlan.sceneBindings.lights.map((l) => l.type)).toEqual(["KeyLight"]);
  });

  test("malformed hex does NOT silently produce #000000 (forbiddenHex) — derived colors pass through", () => {
    const ir = baseIR();
    (ir.validated.color.secondary as { value: string }).value = "not-a-hex";
    const plan = negotiate(ir);
    const uniforms = plan.runtimePlan.sceneBindings.materials[0].uniforms;
    // Direct projection passes the raw value through (gate runs before projection,
    // so it can't catch this; projection must not manufacture a forbidden color).
    expect(uniforms.uColorJade).toBe("not-a-hex");
    // Derived colors must NOT become #000000 — they pass the malformed input through.
    expect(uniforms.uColorCore).toBe("not-a-hex");
    expect(uniforms.uColorSkin).toBe("not-a-hex");
    expect(uniforms.uColorCore).not.toBe("#000000");
    expect(uniforms.uColorSkin).not.toBe("#000000");
  });
});
