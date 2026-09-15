import { DataGate, G1Policy } from "../../compiler-core/data-gate";
import { HashPolicy } from "../../compiler-core/hash-policy";
import type { RawDesignIR, RawEstimatedParameter } from "../../compiler-core/contracts";

const policy: G1Policy = {
  version: "1.0.0",
  confidenceFloor: 0.6,
  lowConfidenceAction: "UNKNOWN",
  requiredPaths: [
    "/composition/focalPoint",
    "/composition/negativeSpaceRatio",
    "/camera/fov",
    "/lighting/keyLight/azimuth",
    "/lighting/keyLight/elevation",
    "/color/dominant",
    "/materials/0/baseType",
  ],
};

function parameter<T>(value: T, confidence = 0.95): RawEstimatedParameter<T> {
  return {
    value,
    unit: "scalar",
    confidence,
    status: "observed",
    evidence: ["test-fixture"],
    source: "vision-estimation",
  };
}

function makeRawIR(overrides?: {
  focalPointConfidence?: number;
  wearConfidence?: number;
  emptyMaterials?: boolean;
}): RawDesignIR {
  const emptyMaterials = overrides?.emptyMaterials ?? false;
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    meta: {
      sourceType: "image",
      aspectRatio: "16:9",
      timestamp: "2026-09-15T12:00:00Z",
    },
    composition: {
      focalPoint: parameter<[number, number]>([0.5, 0.4], overrides?.focalPointConfidence ?? 0.95),
      negativeSpaceRatio: parameter(0.5),
      depthLayerCount: parameter(4),
      symmetry: parameter(0.2),
    },
    camera: {
      fov: parameter(45),
      shotSize: parameter("medium"),
      angle: parameter(0),
      height: parameter(1.6),
    },
    lighting: {
      keyLight: {
        azimuth: parameter(35),
        elevation: parameter(45),
        colorTemp: parameter(5200),
        intensity: parameter(0.8),
        softness: parameter(0.8),
      },
      ambientRatio: parameter(0.2),
      rimLightPresent: parameter(false),
    },
    materials: emptyMaterials
      ? []
      : [
          {
            role: "dominant",
            baseType: parameter("obsidian"),
            roughness: parameter(0.3),
            metalness: parameter(0.7),
            wear: parameter(0.25, overrides?.wearConfidence ?? 0.95),
          },
        ],
    color: {
      dominant: parameter("#1B365D"),
      secondary: parameter("#75628A"),
      accent: parameter("#B08D57"),
      contrastRatio: parameter(4.5),
      temperatureBias: parameter(-0.2),
    },
    provenance: {
      extractorVersion: "1.0.0",
      inferenceExecutionMs: 12,
      rawIntegrityStatus: "BLOCKED_DATA",
      hashManifest: { algorithm: "SHA-256", canonicalization: "RFC8785" },
      inputHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      rawIRHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    },
  };
}

describe("G1 Data Gate", () => {
  test("TC-G1-01 PASS: high-confidence input is admitted and rawIRHash is recomputed", () => {
    const input = makeRawIR();
    const original = structuredClone(input);
    const result = new DataGate(policy).execute(input);

    expect(result.kind).toBe("PASS");
    if (result.kind !== "PASS") return;
    expect(result.rawIR.provenance.rawIntegrityStatus).toBe("READY");
    expect(result.rawIR.provenance.rawIRHash).toBe(HashPolicy.computeRawIRHash(result.rawIR));
    expect(input).toEqual(original);
  });

  test("TC-G1-02 OPTIONAL_REWRITE: optional low-confidence wear becomes unknown/null without blocking", () => {
    const result = new DataGate(policy).execute(makeRawIR({ wearConfidence: 0.45 }));

    expect(result.kind).toBe("PASS");
    if (result.kind !== "PASS") return;
    expect(result.rawIR.materials[0].wear.confidence).toBe(0.45);
    expect(result.rawIR.materials[0].wear.status).toBe("unknown");
    expect(result.rawIR.materials[0].wear.value).toBeNull();
  });

  test("TC-G1-03 REQUIRED_UNKNOWN: low-confidence required focalPoint blocks after rewrite", () => {
    const result = new DataGate(policy).execute(makeRawIR({ focalPointConfidence: 0.52 }));

    expect(result.kind).toBe("BLOCKED_DATA");
    if (result.kind !== "BLOCKED_DATA") return;
    expect(result.evaluation.status).toBe("BLOCKED_DATA");
    expect(result.evaluation.tierExecuted).toBe("NONE");
    expect(result.evaluation.metrics).toBeUndefined();
    expect(result.evaluation.gates).toBeUndefined();
    expect(result.evaluation.provenance.hashChain.inputHash).toBe(
      "sha256:0000000000000000000000000000000000000000000000000000000000000000"
    );
    expect(result.evaluation.provenance.hashChain.rawIRHash).toBeUndefined();
  });

  test("TC-G1-04 REQUIRED_MISSING: empty materials blocks /materials/0/baseType", () => {
    const result = new DataGate(policy).execute(makeRawIR({ emptyMaterials: true }));

    expect(result.kind).toBe("BLOCKED_DATA");
    if (result.kind !== "BLOCKED_DATA") return;
    expect(result.evaluation.status).toBe("BLOCKED_DATA");
    expect(result.evaluation.tierExecuted).toBe("NONE");
    expect(result.evaluation.diagnostics?.some((d) => d.includes("/materials/0/baseType"))).toBe(true);
  });

  test("TC-G1-05 threshold boundary: confidence exactly 0.60 remains valid", () => {
    const result = new DataGate(policy).execute(makeRawIR({ focalPointConfidence: 0.6 }));
    expect(result.kind).toBe("PASS");
    if (result.kind !== "PASS") return;
    expect(result.rawIR.composition.focalPoint.status).toBe("observed");
    expect(result.rawIR.composition.focalPoint.value).toEqual([0.5, 0.4]);
  });

  test("TC-G1-06 no in-place mutation: rejected input remains unchanged", () => {
    const input = makeRawIR({ focalPointConfidence: 0.52, wearConfidence: 0.45 });
    const snapshot = structuredClone(input);
    new DataGate(policy).execute(input);
    expect(input).toEqual(snapshot);
  });
});
