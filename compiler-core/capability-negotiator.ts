import type {
  CapabilityNegotiationResult,
  ExecutionTier,
  FidelityEvaluationResult,
  RuntimeExecutionPlan,
  ValidatedDesignIR,
} from "./contracts";
import type { TierDefinition, TierMappingConfig } from "./tier-mapping-types";

export interface HostCapabilities {
  webgl2: boolean;
  floatTextures: boolean;
  highPrecisionFragment?: boolean;
  anisotropyExtension?: boolean;
  maxFragmentUniformVectors?: number;
  [key: string]: boolean | number | undefined;
}

function hasCapability(hostCaps: HostCapabilities, name: string): boolean {
  return hostCaps[name] === true;
}

function terminalEvaluation(
  validatedIR: ValidatedDesignIR,
  testCaseId: string,
  inputHash: string,
  diagnostics: string[],
): FidelityEvaluationResult {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    testCaseId,
    executedAt: validatedIR.meta.compiledAt,
    status: "BLOCKED_ENV",
    tierExecuted: "NONE",
    versions: {
      compiler: "1.0.0",
      distiller: "FROM_VALIDATED_IR",
      grammar: validatedIR.meta.grammarVersion || "NOT_RUN",
      adapter: "NOT_RUN",
      evaluator: "1.0.0",
    },
    diagnostics,
    provenance: {
      hashManifest: { algorithm: "SHA-256", canonicalization: "RFC8785" },
      hashChain: { inputHash },
      timing: { distillationExecutionMs: 0 },
    },
  };
}

function tier(config: TierMappingConfig, selected: ExecutionTier): TierDefinition {
  const definition = config.tiers[selected];
  if (!definition) throw new Error(`Missing tier definition: ${selected}`);
  return definition;
}

/**
 * Key light azimuth in degrees. The validated IR's keyLight.azimuth carries
 * unit:"degrees" (see aesthetic-sheet-adapter), so all arithmetic here is in
 * degrees. If absent/falsy, defaults to 0 so rim can still derive a mirror.
 */
function keyLightAzimuth(scene: { lighting: ValidatedDesignIR["validated"]["lighting"] }): number {
  return scene.lighting.keyLight.azimuth.value ?? 0;
}

/**
 * Build the lighting binding list from the validated scene graph.
 *
 * Phase 0a delivery: KeyLight (always) + AmbientLight (when ambientRatio present).
 * Rim light (0b-1): if a SSOT ValidatedLighting.rimLight{} is present, emit a
 * RimLight verbatim from its azimuth/elevation/color/intensity; otherwise, if
 * rimLightPresent=true, fall back to a derived rim (key light mirrored +180°,
 * low grazing elevation, accent color, 0.6 intensity). This keeps rim reachable
 * even when no SSOT descriptor is produced by the sheet/adapter yet.
 */
function buildLightingBindings(
  scene: { lighting: ValidatedDesignIR["validated"]["lighting"]; color: ValidatedDesignIR["validated"]["color"] },
  keyAzimuth: number,
): Array<{ type: string; parameters: Record<string, unknown> }> {
  const lights: Array<{ type: string; parameters: Record<string, unknown> }> = [
    {
      type: "KeyLight",
      parameters: {
        azimuth: scene.lighting.keyLight.azimuth.value,
        elevation: scene.lighting.keyLight.elevation.value,
        colorTemp: scene.lighting.keyLight.colorTemp.value,
        intensity: scene.lighting.keyLight.intensity.value,
        softness: scene.lighting.keyLight.softness.value,
      },
    },
  ];

  const ambientRatio = scene.lighting.ambientRatio?.value;
  if (ambientRatio !== undefined && ambientRatio !== null) {
    lights.push({
      type: "AmbientLight",
      parameters: {
        // ambientRatio is validated to be in (0, 1]; scale to a usable intensity.
        intensity: ambientRatio,
        color: "#ffffff",
      },
    });
  }

  const rimLight = scene.lighting.rimLight;
  if (rimLight?.azimuth?.value !== undefined) {
    // SSOT rimLight{} preferred (0b-1): values flow verbatim from the IR.
    lights.push({
      type: "RimLight",
      parameters: {
        azimuth: rimLight.azimuth.value,
        elevation: rimLight.elevation.value,
        color: rimLight.color.value,
        intensity: rimLight.intensity.value,
      },
    });
  } else if (scene.lighting.rimLightPresent?.value === true) {
    // Fallback: no SSOT rimLight{} — derive rim from key light (mirror +180°),
    // low grazing elevation, accent color, constant 0.6 intensity.
    const rimAzimuth = (keyAzimuth + 180) % 360;
    lights.push({
      type: "RimLight",
      parameters: {
        azimuth: rimAzimuth,
        elevation: 0.25, // low grazing angle, derived
        color: scene.color.accent.value,
        intensity: 0.6, // derived constant
      },
    });
  }

  return lights;
}

/**
 * Lighten a hex color toward white by the given amount (0..1). Used to derive
 * a "core" translucency glow color from the secondary (main material) color.
 * Fail-closed: if the source hex is malformed, pass it through unchanged rather
 * than silently emitting #000000 (which is on the G2.5 forbiddenHex list).
 */
function lightenHex(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb;
  const blend = (c: number) => Math.round(c + (255 - c) * amount);
  return rgbToHex(blend(r), blend(g), blend(b));
}

/**
 * Desaturate a hex color toward gray by the given amount (0..1). Used to derive
 * a patina / surface-tint ("skin") color from the secondary color.
 * Fail-closed: malformed source passes through unchanged (see lightenHex).
 */
function desaturateHex(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const blend = (c: number) => Math.round(c + (lum - c) * amount);
  return rgbToHex(blend(r), blend(g), blend(b));
}

/** Parse #RRGGBB (or #RGB) to [r,g,b]. Returns null for malformed input. */
function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function assemblePlan(
  validatedIR: ValidatedDesignIR,
  hostCaps: HostCapabilities,
  resolutionStatus: "ACCEPTED" | "DEGRADED",
  selectedTier: ExecutionTier,
  requiredCapabilities: string[],
  preferredCapabilities: string[],
  downgrades: Array<{ feature: string; reason: string; fallbackStrategy: string }>,
  config: TierMappingConfig,
): RuntimeExecutionPlan {
  const definition = tier(config, selectedTier);
  const scene = validatedIR.validated;

  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    negotiation: {
      resolutionStatus,
      selectedTier,
      requirements: {
        requiredCapabilities: [...requiredCapabilities],
        preferredCapabilities: [...preferredCapabilities],
      },
      capabilities: Object.fromEntries(
        Object.entries(hostCaps).filter(([, value]) => typeof value === "boolean" || typeof value === "number"),
      ) as Record<string, boolean | number>,
      downgrades,
      blockingFailures: [],
    },
    runtimePlan: {
      pipeline: {
        rendererType: definition.rendererType,
        toneMapping: definition.toneMapping,
        colorSpace: definition.colorSpace,
        postprocessing: [...definition.postprocessing],
      },
      sceneBindings: {
        cameraRig: {
          type: "PerspectiveCameraRig",
          params: {
            fov: scene.camera.fov.value,
            shotSize: scene.camera.shotSize.value,
            angle: scene.camera.angle.value,
            height: scene.camera.height.value,
          },
        },
        lights: buildLightingBindings(scene, keyLightAzimuth(scene)),
        materials: scene.materials.map((material, index) => ({
          bindingId: `${material.role}-${index}`,
          shaderType:
            selectedTier === "TIER_A"
              ? "PBR"
              : selectedTier === "TIER_B"
                ? "PhongBlinnPhongApproximation"
                : "FlatGradient",
          uniforms: {
            baseType: material.baseType.value,
            roughness: material.roughness.value,
            metalness: material.metalness.value,
            wear: material.wear.value,
            // Phase 0a (aesthetic-integration): project validated color into the
            // material's color uniforms. This is what procedural materials
            // (e.g. JadeMaterial) consume. Derived values:
            //   uColorDeep ← dominant  (deep body color)
            //   uColorJade ← secondary (main material color)
            //   uColorRim  ← accent    (edge transmission / rim color)
            //   uColorCore ← lighten(secondary, 0.35)  (inner translucency glow)
            //   uColorSkin ← desaturate(secondary, 0.4) (patina / surface tint)
            uColorDeep: scene.color.dominant.value,
            uColorJade: scene.color.secondary.value,
            uColorRim: scene.color.accent.value,
            uColorCore: lightenHex(scene.color.secondary.value, 0.35),
            uColorSkin: desaturateHex(scene.color.secondary.value, 0.4),
          },
        })),
      },
    },
    assetManifest: {
      shaders: selectedTier === "TIER_C" ? [] : [definition.rendererType],
      geometryBuffers: selectedTier === "TIER_C" ? [] : ["scene-geometry"],
      textures: ["scene-textures"],
    },
  };
}

export class CapabilityNegotiator {
  constructor(private readonly tierConfig: TierMappingConfig) {}

  public negotiate(
    validatedIR: ValidatedDesignIR,
    hostCaps: HostCapabilities,
    testCaseId: string,
    inputHash: string,
  ): CapabilityNegotiationResult {
    const requiredCapabilities = [...this.tierConfig.requiredCapabilities];
    const preferredCapabilities = [...this.tierConfig.preferredCapabilities];
    const missingRequired = requiredCapabilities.filter((name) => !hasCapability(hostCaps, name));

    if (missingRequired.length > 0) {
      return {
        kind: "BLOCKED_ENV",
        evaluation: terminalEvaluation(validatedIR, testCaseId, inputHash, [
          "G3 Capability Negotiator blocked the pipeline.",
          ...missingRequired.map((name) => `Required capability missing: ${name}`),
        ]),
      };
    }

    const missingPreferred = preferredCapabilities.filter((name) => !hasCapability(hostCaps, name));
    let selectedTier: ExecutionTier = "TIER_A";
    let resolutionStatus: "ACCEPTED" | "DEGRADED" = "ACCEPTED";
    const downgrades: Array<{ feature: string; reason: string; fallbackStrategy: string }> = [];

    if (missingPreferred.includes("highPrecisionFragment")) {
      selectedTier = "TIER_C";
      resolutionStatus = "DEGRADED";
      downgrades.push({
        feature: "highPrecisionFragment",
        reason: "Host lacks high precision fragment shader support.",
        fallbackStrategy: "CSS3D scene panels with flat-gradient material treatment.",
      });
    } else if (missingPreferred.includes("anisotropyExtension")) {
      selectedTier = "TIER_B";
      resolutionStatus = "DEGRADED";
      downgrades.push({
        feature: "anisotropyExtension",
        reason: "Host lacks anisotropic filtering extension.",
        fallbackStrategy: "WebGL1Renderer with Phong/Blinn-Phong approximation; volumetric fog removed.",
      });
    }

    return {
      kind: resolutionStatus,
      plan: assemblePlan(
        validatedIR,
        hostCaps,
        resolutionStatus,
        selectedTier,
        requiredCapabilities,
        preferredCapabilities,
        downgrades,
        this.tierConfig,
      ),
    };
  }
}
