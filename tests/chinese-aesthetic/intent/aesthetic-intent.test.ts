/**
 * Aesthetic Intent IR Tests — Phase 3 Step 3.2
 *
 * 验证：
 * - Builder 生成符合 schema 的扩展对象
 * - Schema 校验拒绝非法字段/枚举
 * - intentHash 确定性（相同输入 → 相同 hash）
 * - 扩展挂载不修改 ABI 1.0.0 核心字段
 * - additionalProperties: false 严格约束
 */

import type { RawDesignIR } from "../../../compiler-core/contracts";
import {
  AestheticIntentBuilder,
  validateAestheticIntent,
  attachAestheticIntent,
} from "../../../chinese-aesthetic/intent";
import type { AestheticPrinciple, IntentBuildContext } from "../../../chinese-aesthetic/intent";

function makeTestIR(): RawDesignIR {
  return {
    $schema: "test-schema",
    meta: { sourceType: "image", aspectRatio: "16:9", timestamp: "2026-09-16T00:00:00Z" },
    composition: {
      focalPoint: { value: [0.5, 0.5], unit: "vector2", confidence: 0.9, evidence: ["e"], source: "vision-estimation", status: "estimated" },
      negativeSpaceRatio: { value: 0.3, unit: "ratio", confidence: 0.9, evidence: ["e"], source: "vision-estimation", status: "estimated" },
      depthLayerCount: { value: 3, unit: "scalar", confidence: 0.9, evidence: ["e"], source: "vision-estimation", status: "estimated" },
      symmetry: { value: 0.7, unit: "ratio", confidence: 0.9, evidence: ["e"], source: "vision-estimation", status: "estimated" },
    },
    camera: {
      fov: { value: 50, unit: "degrees", confidence: 0.9, evidence: ["e"], source: "vision-estimation", status: "estimated" },
      shotSize: { value: "medium", unit: "scalar", confidence: 0.9, evidence: ["e"], source: "vision-estimation", status: "estimated" },
      angle: { value: 0, unit: "degrees", confidence: 0.9, evidence: ["e"], source: "vision-estimation", status: "estimated" },
      height: { value: 1.6, unit: "ratio", confidence: 0.9, evidence: ["e"], source: "vision-estimation", status: "estimated" },
    },
    lighting: {
      keyLight: {
        azimuth: { value: 45, unit: "degrees", confidence: 0.9, evidence: ["e"], source: "vision-estimation", status: "estimated" },
        elevation: { value: 30, unit: "degrees", confidence: 0.9, evidence: ["e"], source: "vision-estimation", status: "estimated" },
        colorTemp: { value: 5500, unit: "scalar", confidence: 0.9, evidence: ["e"], source: "vision-estimation", status: "estimated" },
        intensity: { value: 1.0, unit: "ratio", confidence: 0.9, evidence: ["e"], source: "vision-estimation", status: "estimated" },
        softness: { value: 0.5, unit: "ratio", confidence: 0.9, evidence: ["e"], source: "vision-estimation", status: "estimated" },
      },
      ambientRatio: { value: 0.3, unit: "ratio", confidence: 0.9, evidence: ["e"], source: "vision-estimation", status: "estimated" },
      rimLightPresent: { value: true, unit: "scalar", confidence: 0.9, evidence: ["e"], source: "vision-estimation", status: "estimated" },
    },
    materials: [
      { role: "dominant", baseType: { value: "WOOD::test", unit: "scalar", confidence: 0.9, evidence: ["e"], source: "vision-estimation", status: "estimated" }, roughness: { value: 0.5, unit: "ratio", confidence: 0.9, evidence: ["e"], source: "vision-estimation", status: "estimated" }, metalness: { value: 0.1, unit: "ratio", confidence: 0.9, evidence: ["e"], source: "vision-estimation", status: "estimated" }, wear: { value: 0.3, unit: "ratio", confidence: 0.9, evidence: ["e"], source: "vision-estimation", status: "estimated" } },
    ],
    color: {
      dominant: { value: "#8B7355", unit: "hex", confidence: 0.9, evidence: ["e"], source: "vision-estimation", status: "estimated" },
      secondary: { value: "#6B5344", unit: "hex", confidence: 0.9, evidence: ["e"], source: "vision-estimation", status: "estimated" },
      accent: { value: "#C4A35A", unit: "hex", confidence: 0.9, evidence: ["e"], source: "vision-estimation", status: "estimated" },
      contrastRatio: { value: 3.5, unit: "ratio", confidence: 0.9, evidence: ["e"], source: "vision-estimation", status: "estimated" },
      temperatureBias: { value: 0.1, unit: "ratio", confidence: 0.9, evidence: ["e"], source: "vision-estimation", status: "estimated" },
    },
    provenance: {
      extractorVersion: "test",
      inferenceExecutionMs: 100,
      rawIntegrityStatus: "READY",
      hashManifest: { algorithm: "SHA-256", canonicalization: "RFC8785" },
      inputHash: "test-input",
      rawIRHash: "test-ir",
    },
  };
}

function makeContext(overrides: Partial<IntentBuildContext> = {}): IntentBuildContext {
  return {
    period: "SONG",
    principles: ["VOID_SOLID_INTERPLAY", "LIGHT_TEMPORALITY"] as AestheticPrinciple[],
    evidenceHash: "sha256:evidence-abc",
    graphHash: "fnv1a:graph-def",
    gateReportRef: "fnv1a:gate-ghi",
    allAllowed: true,
    ...overrides,
  };
}

describe("Aesthetic Intent Builder", () => {
  test("builds valid extension with all required fields", () => {
    const builder = new AestheticIntentBuilder(makeContext());
    const { intent, validation } = builder.buildAndValidate();
    expect(validation.valid).toBe(true);
    expect(intent.system).toBe("chinese-aesthetic@1.0.0");
    expect(intent.period).toBe("SONG");
    expect(intent.principles).toHaveLength(2);
    expect(intent.provenance.evidenceHash).toBe("sha256:evidence-abc");
    expect(intent.provenance.graphHash).toBe("fnv1a:graph-def");
    expect(intent.provenance.intentHash.length).toBeGreaterThan(0);
  });

  test("intentHash is deterministic for identical input", () => {
    const ctx = makeContext();
    const b1 = new AestheticIntentBuilder(ctx);
    const b2 = new AestheticIntentBuilder(ctx);
    expect(b1.build().provenance.intentHash).toBe(b2.build().provenance.intentHash);
  });

  test("intentHash changes when principles change", () => {
    const base = makeContext();
    const h1 = new AestheticIntentBuilder(base).build().provenance.intentHash;
    const h2 = new AestheticIntentBuilder({ ...base, principles: ["QI_YUN_CONTINUITY"] }).build().provenance.intentHash;
    expect(h1).not.toBe(h2);
  });

  test("addRelationship and addOperation accumulate", () => {
    const builder = new AestheticIntentBuilder(makeContext());
    builder.addRelationship({ relationType: "HOST_GUEST", sourceId: "n1", targetId: "n2", magnitude: 0.8 });
    builder.addOperation({ opId: "OP_TEST", parameters: { x: 1 }, rationale: "test", provenanceRef: "ref" });
    const intent = builder.build();
    expect(intent.activeRelationships).toHaveLength(1);
    expect(intent.appliedOperations).toHaveLength(1);
  });

  test("antiPatternConformance records gate report ref and allAllowed", () => {
    const intent = new AestheticIntentBuilder(makeContext({ allAllowed: false })).build();
    expect(intent.antiPatternConformance.allAllowed).toBe(false);
    expect(intent.antiPatternConformance.gateReportRef).toBe("fnv1a:gate-ghi");
  });
});

describe("Aesthetic Intent Schema Validation", () => {
  test("rejects invalid system const", () => {
    const intent = new AestheticIntentBuilder(makeContext()).build();
    (intent as unknown as Record<string, unknown>).system = "wrong-system";
    const result = validateAestheticIntent(intent);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("system"))).toBe(true);
  });

  test("rejects invalid period", () => {
    const intent = new AestheticIntentBuilder(makeContext()).build();
    (intent as unknown as Record<string, unknown>).period = "QING";
    const result = validateAestheticIntent(intent);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("period"))).toBe(true);
  });

  test("rejects invalid principle enum", () => {
    const intent = new AestheticIntentBuilder(makeContext()).build();
    (intent.principles as string[]).push("INVALID_PRINCIPLE");
    const result = validateAestheticIntent(intent);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Invalid principle"))).toBe(true);
  });

  test("rejects additional properties", () => {
    const intent = new AestheticIntentBuilder(makeContext()).build();
    (intent as unknown as Record<string, unknown>).chineseAestheticScore = 0.95;
    const result = validateAestheticIntent(intent);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Additional property"))).toBe(true);
  });

  test("rejects missing required field", () => {
    const intent = new AestheticIntentBuilder(makeContext()).build();
    delete (intent as unknown as Record<string, unknown>).provenance;
    const result = validateAestheticIntent(intent);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("provenance"))).toBe(true);
  });

  test("rejects non-object input", () => {
    expect(validateAestheticIntent(null).valid).toBe(false);
    expect(validateAestheticIntent("string").valid).toBe(false);
  });
});

describe("Aesthetic Intent IR Attachment", () => {
  test("attachAestheticIntent does not modify input IR", () => {
    const ir = makeTestIR();
    const irSnapshot = JSON.stringify(ir);
    const intent = new AestheticIntentBuilder(makeContext()).build();
    attachAestheticIntent(ir, intent);
    expect(JSON.stringify(ir)).toBe(irSnapshot);
  });

  test("attached IR preserves all ABI core fields", () => {
    const ir = makeTestIR();
    const intent = new AestheticIntentBuilder(makeContext()).build();
    const attached = attachAestheticIntent(ir, intent);
    expect(attached.composition).toEqual(ir.composition);
    expect(attached.camera).toEqual(ir.camera);
    expect(attached.lighting).toEqual(ir.lighting);
    expect(attached.materials).toEqual(ir.materials);
    expect(attached.color).toEqual(ir.color);
    expect(attached.provenance).toEqual(ir.provenance);
    expect(attached.aestheticIntent).toBeDefined();
    expect(attached.aestheticIntent.system).toBe("chinese-aesthetic@1.0.0");
  });

  test("aestheticIntent is extension namespace, not ABI core field", () => {
    const ir = makeTestIR();
    // RawDesignIR core does not include aestheticIntent
    expect("aestheticIntent" in ir).toBe(false);
    const intent = new AestheticIntentBuilder(makeContext()).build();
    const attached = attachAestheticIntent(ir, intent);
    expect("aestheticIntent" in attached).toBe(true);
  });
});
