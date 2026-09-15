import Ajv2020 from "ajv/dist/2020";
import * as fs from "fs";
import * as path from "path";
import { CapabilityNegotiator, type HostCapabilities } from "../../compiler-core/capability-negotiator";
import type { RawDesignIR, ValidatedDesignIR, ParameterUnit } from "../../compiler-core/contracts";
import type { TierMappingConfig } from "../../compiler-core/tier-mapping-types";

const configPath = path.join(__dirname, "../../config/tier-mapping.json");
const executionPlanSchemaPath = path.join(__dirname, "../../schemas/execution-plan.schema.json");
const evaluationSchemaPath = path.join(__dirname, "../../schemas/evaluation-result.schema.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as TierMappingConfig;

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validatePlan = ajv.compile(JSON.parse(fs.readFileSync(executionPlanSchemaPath, "utf8")));
const validateEvaluation = ajv.compile(JSON.parse(fs.readFileSync(evaluationSchemaPath, "utf8")));

function makeParam<T>(value: T, unit: ParameterUnit = "normalized") {
  return {
    value,
    unit,
    confidence: 0.95,
    status: "observed" as const,
    evidence: ["g3-test"],
    source: "vision-estimation" as const,
  };
}

function makeRawIR(): RawDesignIR {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    meta: { sourceType: "image", aspectRatio: "16:9", timestamp: "2026-09-15T12:00:00Z" },
    composition: {
      focalPoint: makeParam([0.5, 0.4], "vector2"),
      negativeSpaceRatio: makeParam(0.45, "ratio"),
      depthLayerCount: makeParam(4, "scalar"),
      symmetry: makeParam(0.85),
    },
    camera: {
      fov: makeParam(35, "degrees"),
      shotSize: makeParam("long-shot", "scalar"),
      angle: makeParam(0, "degrees"),
      height: makeParam(1.6, "scalar"),
    },
    lighting: {
      keyLight: {
        azimuth: makeParam(45, "degrees"),
        elevation: makeParam(30, "degrees"),
        colorTemp: makeParam(5500, "kelvin"),
        intensity: makeParam(1.2, "scalar"),
        softness: makeParam(0.75),
      },
      ambientRatio: makeParam(0.25, "ratio"),
      rimLightPresent: makeParam(true),
    },
    materials: [
      {
        role: "dominant",
        baseType: makeParam("stone", "scalar"),
        roughness: makeParam(0.7),
        metalness: makeParam(0.1),
        wear: makeParam(0.4),
      },
    ],
    color: {
      dominant: makeParam("#2b2b2b", "hex"),
      secondary: makeParam("#7c7c7c", "hex"),
      accent: makeParam("#d4af37", "hex"),
      contrastRatio: makeParam(4.5, "ratio"),
      temperatureBias: makeParam(0.1),
    },
    provenance: {
      extractorVersion: "1.0.0",
      inferenceExecutionMs: 120,
      rawIntegrityStatus: "READY",
      hashManifest: { algorithm: "SHA-256", canonicalization: "RFC8785" },
      inputHash: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      rawIRHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
  };
}

function makeValidatedIR(): ValidatedDesignIR {
  const raw = makeRawIR();
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    meta: { grammarPack: "chinese-aesthetic", grammarVersion: "1.0.0", compiledAt: "2026-09-15T12:00:00.000Z" },
    sourceRef: { rawIRHash: raw.provenance.rawIRHash, rawSchemaVersion: "1.0.0" },
    patches: [],
    validated: structuredClone({
      composition: raw.composition,
      camera: raw.camera,
      lighting: raw.lighting,
      materials: raw.materials,
      color: raw.color,
    }) as unknown as ValidatedDesignIR["validated"],
    auditReport: {
      rulesEvaluated: 0,
      patchesEvaluated: 0,
      mutationsApplied: 0,
      testsPassed: 0,
      testsFailed: 0,
      complianceScore: 1,
      violations: [],
    },
  };
}

const inputHash = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function caps(overrides: Partial<HostCapabilities> = {}): HostCapabilities {
  return {
    webgl2: true,
    floatTextures: true,
    highPrecisionFragment: true,
    anisotropyExtension: true,
    ...overrides,
  };
}

describe("Capability Negotiator — G3 contract", () => {
  test("TC-CN-01: full capability -> ACCEPTED / TIER_A / WebGL2Renderer", () => {
    const result = new CapabilityNegotiator(config).negotiate(makeValidatedIR(), caps(), "TC-CN-01", inputHash);
    expect(result.kind).toBe("ACCEPTED");
    if (result.kind !== "ACCEPTED") return;
    expect(result.plan.negotiation.selectedTier).toBe("TIER_A");
    expect(result.plan.runtimePlan.pipeline.rendererType).toBe("WebGL2Renderer");
    expect(result.plan.negotiation.downgrades).toEqual([]);
    expect(validatePlan(result.plan)).toBe(true);
  });

  test("TC-CN-02: missing required webgl2 -> BLOCKED_ENV / NONE with terminal isolation", () => {
    const result = new CapabilityNegotiator(config).negotiate(
      makeValidatedIR(), caps({ webgl2: false }), "TC-CN-02", inputHash,
    );
    expect(result.kind).toBe("BLOCKED_ENV");
    if (result.kind !== "BLOCKED_ENV") return;
    const evaluation = result.evaluation;
    expect(evaluation.status).toBe("BLOCKED_ENV");
    expect(evaluation.tierExecuted).toBe("NONE");
    expect(evaluation.metrics).toBeUndefined();
    expect(evaluation.gates).toBeUndefined();
    expect(evaluation.provenance.hashChain).toEqual({ inputHash });
    expect(evaluation.provenance.timing.distillationExecutionMs).toBe(0);
    expect(validateEvaluation(evaluation)).toBe(true);
  });

  test("TC-CN-03: missing anisotropy -> DEGRADED / TIER_B / WebGL1Renderer", () => {
    const result = new CapabilityNegotiator(config).negotiate(
      makeValidatedIR(), caps({ anisotropyExtension: false }), "TC-CN-03", inputHash,
    );
    expect(result.kind).toBe("DEGRADED");
    if (result.kind !== "DEGRADED") return;
    expect(result.plan.negotiation.selectedTier).toBe("TIER_B");
    expect(result.plan.runtimePlan.pipeline.rendererType).toBe("WebGL1Renderer");
    expect(result.plan.runtimePlan.pipeline.toneMapping).toBe("ACESFilmicToneMapping");
    expect(result.plan.runtimePlan.pipeline.postprocessing).not.toContain("volumetric-fog");
    expect(result.plan.runtimePlan.sceneBindings.materials[0].shaderType).toBe("PhongBlinnPhongApproximation");
  });

  test("TC-CN-04: missing high precision fragment -> DEGRADED / TIER_C / CSS3D", () => {
    const result = new CapabilityNegotiator(config).negotiate(
      makeValidatedIR(), caps({ highPrecisionFragment: false }), "TC-CN-04", inputHash,
    );
    expect(result.kind).toBe("DEGRADED");
    if (result.kind !== "DEGRADED") return;
    expect(result.plan.negotiation.selectedTier).toBe("TIER_C");
    expect(result.plan.runtimePlan.pipeline.rendererType).toBe("CSS3D");
    expect(result.plan.runtimePlan.sceneBindings.materials[0].shaderType).toBe("FlatGradient");
    expect(validatePlan(result.plan)).toBe(true);
  });

  test("TC-CN-05: accepted/degraded plan is physically isomorphic to execution-plan schema and contains no hash/provenance", () => {
    const accepted = new CapabilityNegotiator(config).negotiate(makeValidatedIR(), caps(), "TC-CN-05-A", inputHash);
    const degraded = new CapabilityNegotiator(config).negotiate(
      makeValidatedIR(), caps({ anisotropyExtension: false }), "TC-CN-05-B", inputHash,
    );
    for (const result of [accepted, degraded]) {
      expect(result.kind === "ACCEPTED" || result.kind === "DEGRADED").toBe(true);
      if (result.kind === "ACCEPTED" || result.kind === "DEGRADED") {
        expect(validatePlan(result.plan)).toBe(true);
        expect("provenance" in result.plan).toBe(false);
        expect("executionPlanHash" in result.plan).toBe(false);
      }
    }
  });

  test("TC-CN-06: BLOCKED_ENV evaluation is physically isomorphic to terminal evaluation schema", () => {
    const result = new CapabilityNegotiator(config).negotiate(
      makeValidatedIR(), caps({ floatTextures: false }), "TC-CN-06", inputHash,
    );
    expect(result.kind).toBe("BLOCKED_ENV");
    if (result.kind !== "BLOCKED_ENV") return;
    expect(validateEvaluation(result.evaluation)).toBe(true);
    expect(result.evaluation.provenance.hashChain).toEqual({ inputHash });
    expect(Object.prototype.hasOwnProperty.call(result.evaluation, "metrics")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result.evaluation, "gates")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result.evaluation.provenance.hashChain, "renderHash")).toBe(false);
  });
});
