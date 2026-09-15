import * as fs from "fs";
import * as path from "path";
import Ajv2020 from "ajv/dist/2020";
import { PipelineRunner } from "../../compiler-core/pipeline-runner";
import { HashPolicy } from "../../compiler-core/hash-policy";
import { verifyEvaluationSemanticGate } from "../../compiler-core/semantic-gate";
import type { GrammarRulePack } from "../../compiler-core/patch-engine";
import type { HostCapabilities } from "../../compiler-core/capability-negotiator";
import type { ParameterUnit, RawDesignIR } from "../../compiler-core/contracts";
import type { TierMappingConfig } from "../../compiler-core/tier-mapping-types";

const config = JSON.parse(fs.readFileSync(path.join(__dirname, "../../config/tier-mapping.json"), "utf8")) as TierMappingConfig;
const policy = JSON.parse(fs.readFileSync(path.join(__dirname, "../../config/g1-policy.json"), "utf8"));
const grammar: GrammarRulePack = { packName: "test-grammar", version: "1.0.0", description: "Step 4 contract fixture", rules: [] };
const runner = new PipelineRunner({ g1Policy: policy, grammar, tierConfig: config });
const executionPlanSchema = JSON.parse(fs.readFileSync(path.join(__dirname, "../../schemas/execution-plan.schema.json"), "utf8"));
const validatePlan = new Ajv2020({ allErrors: true, strict: false }).compile(executionPlanSchema);

function makeParam<T>(value: T, unit: ParameterUnit = "normalized") {
  return { value, unit, confidence: 0.95, status: "observed" as const, evidence: ["pipeline-test"], source: "vision-estimation" as const };
}

function makeRawIR(focalConfidence = 0.95): RawDesignIR {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    meta: { sourceType: "image", aspectRatio: "16:9", timestamp: "2026-09-15T12:00:00Z" },
    composition: {
      focalPoint: { ...makeParam([0.5, 0.4], "vector2"), confidence: focalConfidence },
      negativeSpaceRatio: makeParam(0.45, "ratio"), depthLayerCount: makeParam(4, "scalar"), symmetry: makeParam(0.85),
    },
    camera: { fov: makeParam(35, "degrees"), shotSize: makeParam("long-shot", "scalar"), angle: makeParam(0, "degrees"), height: makeParam(1.6, "scalar") },
    lighting: {
      keyLight: { azimuth: makeParam(45, "degrees"), elevation: makeParam(30, "degrees"), colorTemp: makeParam(5500, "kelvin"), intensity: makeParam(1.2, "scalar"), softness: makeParam(0.75) },
      ambientRatio: makeParam(0.25, "ratio"), rimLightPresent: makeParam(true),
    },
    materials: [{ role: "dominant", baseType: makeParam("stone", "scalar"), roughness: makeParam(0.7), metalness: makeParam(0.1), wear: makeParam(0.4) }],
    color: { dominant: makeParam("#2b2b2b", "hex"), secondary: makeParam("#7c7c7c", "hex"), accent: makeParam("#d4af37", "hex"), contrastRatio: makeParam(4.5, "ratio"), temperatureBias: makeParam(0.1) },
    provenance: {
      extractorVersion: "1.0.0", inferenceExecutionMs: 120, rawIntegrityStatus: "READY",
      hashManifest: { algorithm: "SHA-256", canonicalization: "RFC8785" },
      inputHash: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      rawIRHash: "sha256:placeholder",
    },
  };
}

function caps(overrides: Partial<HostCapabilities> = {}): HostCapabilities {
  return { webgl2: true, floatTextures: true, highPrecisionFragment: true, anisotropyExtension: true, ...overrides };
}

describe("Pipeline Runner — Step 4 contract", () => {
  test("TC-PR-01: full chain produces SUCCESS, four-hash chain, complete timing and schema-compatible plan", () => {
    const result = runner.execute(makeRawIR(), caps(), "TC-PR-01");
    expect(result.status).toBe("SUCCESS");
    if (result.status !== "SUCCESS") return;
    expect(result.hashChain.inputHash).toBe(result.rawIR.provenance.inputHash);
    expect(result.hashChain.rawIRHash).toBe(result.rawIR.provenance.rawIRHash);
    expect(result.hashChain.validatedIRHash).toBe(HashPolicy.computeHash(result.validatedIR));
    expect(result.hashChain.executionPlanHash).toBe(HashPolicy.computeHash(result.executionPlan));
    expect(result.validatedIR.sourceRef.rawIRHash).toBe(result.hashChain.rawIRHash);
    expect("provenance" in result.validatedIR).toBe(false);
    expect("provenance" in result.executionPlan).toBe(false);
    expect(result.timing.distillationExecutionMs).toBe(120);
    expect(Number.isInteger(result.timing.grammarExecutionMs)).toBe(true);
    expect(Number.isInteger(result.timing.adapterExecutionMs)).toBe(true);
    expect(validatePlan(result.executionPlan)).toBe(true);
  });

  test("TC-PR-02: G1 low-confidence required parameter halts before Patch Engine", () => {
    const result = runner.execute(makeRawIR(0.52), caps(), "TC-PR-02");
    expect(result).toMatchObject({ status: "TERMINAL_HALT", haltStage: "G1_DATA_GATE" });
    if (result.status !== "TERMINAL_HALT") return;
    expect(result.evaluation.status).toBe("BLOCKED_DATA");
    expect(result.evaluation.tierExecuted).toBe("NONE");
    expect(result.evaluation.metrics).toBeUndefined();
    expect(result.evaluation.gates).toBeUndefined();
  });

  test("TC-PR-03: missing required WebGL2 capability halts at G3", () => {
    const result = runner.execute(makeRawIR(), caps({ webgl2: false }), "TC-PR-03");
    expect(result.status).toBe("TERMINAL_HALT");
    if (result.status !== "TERMINAL_HALT") return;
    expect(result.haltStage).toBe("G3_CAPABILITY_NEGOTIATOR");
    expect(result.evaluation.status).toBe("BLOCKED_ENV");
    expect(result.evaluation.tierExecuted).toBe("NONE");
    expect(result.evaluation.metrics).toBeUndefined();
    expect(result.evaluation.gates).toBeUndefined();
    expect(result.evaluation.provenance.hashChain).toEqual({ inputHash: result.evaluation.provenance.hashChain.inputHash });
  });

  test("TC-PR-04: assembled hash chain is compatible with G2 semantic gate", () => {
    const result = runner.execute(makeRawIR(), caps(), "TC-PR-04");
    expect(result.status).toBe("SUCCESS");
    if (result.status !== "SUCCESS") return;
    const metric = { score: 1, threshold: 0.8, weight: 1, metricVersion: "1.0.0", evaluationMethod: "contract-mock" };
    const evaluation = {
      $schema: "https://json-schema.org/draft/2020-12/schema", testCaseId: "TC-PR-04", executedAt: "2026-09-15T12:00:00.000Z", status: "PASS", tierExecuted: "TIER_A",
      versions: { compiler: "1.0.0", distiller: "1.0.0", grammar: "1.0.0", adapter: "1.0.0", evaluator: "1.0.0" },
      metrics: { composition: metric, color: { composite: metric, palette: metric, dominantArea: metric, temperature: metric, contrast: metric }, depth: metric, material: metric, focalPointDisplacement: { ...metric, displacementDistance: 0 } },
      gates: { composition: { metricRef: "metrics.composition", passed: true }, color: { metricRef: "metrics.color.composite", passed: true }, depth: { metricRef: "metrics.depth", passed: true }, material: { metricRef: "metrics.material", passed: true }, focalDisplacement: { metricRef: "metrics.focalPointDisplacement", passed: true } },
      provenance: { hashManifest: { algorithm: "SHA-256", canonicalization: "RFC8785" }, hashChain: result.hashChain, timing: result.timing },
    };
    expect(evaluation.provenance.hashChain.validatedIRHash).toBe(HashPolicy.computeHash(result.validatedIR));
    expect(evaluation.provenance.hashChain.executionPlanHash).toBe(HashPolicy.computeHash(result.executionPlan));
    expect(() => verifyEvaluationSemanticGate(result.rawIR, result.validatedIR, evaluation)).not.toThrow();
  });
});
