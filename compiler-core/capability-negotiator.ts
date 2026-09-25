import type {
  CapabilityNegotiationResult,
  ExecutionTier,
  FidelityEvaluationResult,
  RuntimeExecutionPlan,
  RenderTarget,
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

function isRenderTarget(value: unknown): value is RenderTarget {
  if (typeof value !== 'object' || value === null) return false;
  const target = value as Record<string, unknown>;
  return typeof target.width === 'number' && Number.isInteger(target.width) && target.width > 0 &&
    typeof target.height === 'number' && Number.isInteger(target.height) && target.height > 0 &&
    typeof target.pixelRatio === 'number' && Number.isFinite(target.pixelRatio) && target.pixelRatio >= 1;
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

function assemblePlan(
  validatedIR: ValidatedDesignIR,
  hostCaps: HostCapabilities,
  resolutionStatus: "ACCEPTED" | "DEGRADED",
  selectedTier: ExecutionTier,
  requiredCapabilities: string[],
  preferredCapabilities: string[],
  downgrades: Array<{ feature: string; reason: string; fallbackStrategy: string }>,
  config: TierMappingConfig,
  renderTarget: RenderTarget,
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
        lights: [
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
        ],
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
          },
        })),
      },
    },
    renderTarget: { ...renderTarget },
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
    renderTarget: RenderTarget,
  ): CapabilityNegotiationResult {
    if (!isRenderTarget(renderTarget)) {
      return {
        kind: 'BLOCKED_ENV',
        evaluation: terminalEvaluation(validatedIR, testCaseId, inputHash, [
          'G3 Capability Negotiator blocked the pipeline.',
          'A valid renderTarget with positive integer width/height and pixelRatio >= 1 is required.',
        ]),
      };
    }
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
        renderTarget,
      ),
    };
  }
}
