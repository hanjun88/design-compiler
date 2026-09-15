/**
 * tests/intent/determinism.test.ts
 *
 * 1000× 恒等哈希测试。
 *
 * 验证 Intent Normalization Engine 的确定性纯函数特性：
 * 1. 相同输入 + 相同 options 产生完全相同的输出
 * 2. 1000 次调用的 inputHash 完全一致
 * 3. 1000 次调用的 coreIR 完全一致（JSON.stringify 比较）
 * 4. capturedAt 必须显式传入，禁止 new Date()
 * 5. 排除时间戳字段后的语义哈希恒等
 * 6. 非语义时间字段不影响哈希结果
 */

import { normalizeIntent, computeSemanticInputHash } from "../../compiler-intent/intent-normalizer";
import type { CangjieRawDesignIR, IntentNormalizerOptions } from "../../compiler-intent/types";

// ============================================================================
// 测试夹具：合法的 Cangjie IR
// ============================================================================

function buildValidCangjieIR(): CangjieRawDesignIR {
  return {
    irId: "ir-test-determinism-001",
    concept: {
      name: "虚实相生",
      ontologyPath: "/aesthetics/void-solid/dynamic-balance",
      definition: "虚与实相互依存、相互转化的辩证关系",
      sourceText: "山不在高，有仙则名；水不在深，有龙则灵",
    },
    intent: {
      statement: "保持连续负空间，压低高光过曝，出檐深远与采光平衡",
      heuristicIds: ["h-void-solid-01", "h-light-balance-02"],
      priority: "P0",
    },
    parameters: [
      {
        paramId: "negative-space-ratio",
        path: "/composition/negativeSpaceRatio",
        value: 0.45,
        unit: "ratio",
        confidence: 0.92,
        source: {
          type: "literature",
          ref: "画筌·虚实章",
          quote: "虚实相生，无画处皆成妙境",
          corpusId: "corp-huaquan",
        },
        calibration: {
          method: "expert-calibrated",
          status: "PRODUCTION",
          calibratedBy: "expert-01",
          variance: 0.02,
        },
        range: {
          preferred: [0.4, 0.6],
          warning: [0.3, 0.7],
          hard: [0.2, 0.8],
        },
        provenance: {
          ontologyNode: "虚实相生",
          heuristicId: "h-void-solid-01",
          chain: ["画筌", "虚实相生", "NegativeSpace", "0.45"],
        },
      },
      {
        paramId: "focal-point",
        path: "/composition/focalPoint",
        value: [0.35, 0.42],
        unit: "vector2",
        confidence: 0.88,
        source: {
          type: "master-cluster",
          ref: "song-dynasty-landscape-cluster",
          corpusId: "corp-song-cluster",
        },
        calibration: {
          method: "dataset-empirical-priors",
          status: "PRODUCTION",
          variance: 0.05,
        },
      },
      {
        paramId: "color-temp",
        path: "/lighting/keyLight/colorTemp",
        value: 5200,
        unit: "kelvin",
        confidence: 0.85,
        source: {
          type: "expert-judgment",
          ref: "cinematographer-01",
        },
        calibration: {
          method: "expert-calibrated",
          status: "PRODUCTION",
        },
      },
      {
        paramId: "dominant-color",
        path: "/color/dominant",
        value: "#2b2b2b",
        unit: "hex",
        confidence: 0.95,
        source: {
          type: "dataset-prior",
          ref: "song-dynasty-palette",
        },
        calibration: {
          method: "dataset-empirical-priors",
          status: "PRODUCTION",
        },
      },
      // 补充所有必选参数，确保 PASS 状态
      {
        paramId: "depth-layer-count",
        path: "/composition/depthLayerCount",
        value: 4,
        unit: "scalar",
        confidence: 0.86,
        source: { type: "dataset-prior", ref: "depth-seg-v2" },
        calibration: { method: "dataset-empirical-priors", status: "PRODUCTION" },
      },
      {
        paramId: "camera-fov",
        path: "/camera/fov",
        value: 35,
        unit: "degrees",
        confidence: 0.84,
        source: { type: "expert-judgment", ref: "perspective-vp" },
        calibration: { method: "expert-calibrated", status: "PRODUCTION" },
      },
      {
        paramId: "camera-shot-size",
        path: "/camera/shotSize",
        value: "long-shot",
        unit: "scalar",
        confidence: 0.90,
        source: { type: "expert-judgment", ref: "scale-ratio" },
        calibration: { method: "expert-calibrated", status: "PRODUCTION" },
      },
      {
        paramId: "light-azimuth",
        path: "/lighting/keyLight/azimuth",
        value: 45,
        unit: "degrees",
        confidence: 0.83,
        source: { type: "expert-judgment", ref: "shadow-cast" },
        calibration: { method: "expert-calibrated", status: "PRODUCTION" },
      },
      {
        paramId: "light-elevation",
        path: "/lighting/keyLight/elevation",
        value: 30,
        unit: "degrees",
        confidence: 0.82,
        source: { type: "expert-judgment", ref: "shadow-angle" },
        calibration: { method: "expert-calibrated", status: "PRODUCTION" },
      },
      {
        paramId: "light-intensity",
        path: "/lighting/keyLight/intensity",
        value: 1.2,
        unit: "scalar",
        confidence: 0.81,
        source: { type: "expert-judgment", ref: "luminance-hist" },
        calibration: { method: "expert-calibrated", status: "PRODUCTION" },
      },
      {
        paramId: "ambient-ratio",
        path: "/lighting/ambientRatio",
        value: 0.25,
        unit: "ratio",
        confidence: 0.80,
        source: { type: "expert-judgment", ref: "ambient-lum" },
        calibration: { method: "expert-calibrated", status: "PRODUCTION" },
      },
      {
        paramId: "mat-base-type",
        path: "/materials/0/baseType",
        value: "stone",
        unit: "scalar",
        confidence: 0.91,
        source: { type: "expert-judgment", ref: "texture-cls" },
        calibration: { method: "expert-calibrated", status: "PRODUCTION" },
      },
      {
        paramId: "mat-roughness",
        path: "/materials/0/roughness",
        value: 0.7,
        unit: "normalized",
        confidence: 0.87,
        source: { type: "expert-judgment", ref: "specular-spread" },
        calibration: { method: "expert-calibrated", status: "PRODUCTION" },
      },
      {
        paramId: "mat-metalness",
        path: "/materials/0/metalness",
        value: 0.1,
        unit: "normalized",
        confidence: 0.85,
        source: { type: "expert-judgment", ref: "reflectance-ratio" },
        calibration: { method: "expert-calibrated", status: "PRODUCTION" },
      },
      {
        paramId: "color-secondary",
        path: "/color/secondary",
        value: "#7c7c7c",
        unit: "hex",
        confidence: 0.92,
        source: { type: "dataset-prior", ref: "song-palette-sec" },
        calibration: { method: "dataset-empirical-priors", status: "PRODUCTION" },
      },
      {
        paramId: "color-contrast",
        path: "/color/contrastRatio",
        value: 4.5,
        unit: "ratio",
        confidence: 0.88,
        source: { type: "derived", ref: "wcag-formula" },
        calibration: { method: "expert-calibrated", status: "PRODUCTION" },
      },
    ],
    constraints: [
      {
        constraintId: "c-void-solid-ratio",
        type: "proportion",
        targetPath: "/composition/negativeSpaceRatio",
        condition: { min: 0.4, max: 0.6 },
      },
    ],
    provenance: {
      corpusSources: [
        {
          corpusId: "corp-huaquan",
          title: "画筌",
          type: "book",
          author: "笪重光",
          year: 1689,
          extractionMethod: "adler-close-reading",
        },
      ],
      distillationMethod: "cangjie RIA-TV++ 九阶段流水线",
      verification: {
        v1_sourceAdequacy: true,
        v2_executability: true,
        v3_taskGain: true,
        verifiedBy: "cangjie-verifier",
      },
    },
    distillerVersion: "2.5.0",
    grammarVersion: "chinese-aesthetic@1.1.0",
    metadata: {
      createdBy: "cangjie-distiller",
      tags: ["song-dynasty", "landscape", "void-solid"],
    },
  };
}

// 显式确定性时间戳（禁止 new Date()）
const FIXED_CAPTURED_AT = "2026-09-15T12:00:00.000Z";

const FIXED_OPTIONS: IntentNormalizerOptions = {
  capturedAt: FIXED_CAPTURED_AT,
  intentResolutionConfidence: 0.9,
  mappingConfidence: 0.95,
  inferenceExecutionMs: 150,
};

describe("STEP 6-B: Determinism & 1000x Hash Identity", () => {
  // ========================================================================
  // TC-DET-01: 单次调用产出合法结果
  // ========================================================================
  test("TC-DET-01: single normalization produces valid result with PASS status", () => {
    const ir = buildValidCangjieIR();
    const result = normalizeIntent(ir, FIXED_OPTIONS);

    expect(result.status).toBe("PASS");
    expect(result.coreIR).toBeDefined();
    expect(result.metadata).toBeDefined();
    expect(result.metadata.capturedAt).toBe(FIXED_CAPTURED_AT);
    expect(result.coreIR.provenance.inputHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.metadata.mappedParameters).toBeGreaterThan(0);
  });

  // ========================================================================
  // TC-DET-02: 1000 次调用 inputHash 完全一致
  // ========================================================================
  test("TC-DET-02: 1000 invocations produce identical inputHash", () => {
    const ir = buildValidCangjieIR();
    const hashes = new Set<string>();

    for (let i = 0; i < 1000; i++) {
      const result = normalizeIntent(ir, FIXED_OPTIONS);
      hashes.add(result.coreIR.provenance.inputHash);
    }

    expect(hashes.size).toBe(1); // 所有哈希完全相同
    const firstHash = normalizeIntent(ir, FIXED_OPTIONS).coreIR.provenance.inputHash;
    expect(firstHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  // ========================================================================
  // TC-DET-03: 1000 次调用 coreIR 完全一致（JSON.stringify 比较）
  // ========================================================================
  test("TC-DET-03: 1000 invocations produce byte-identical coreIR", () => {
    const ir = buildValidCangjieIR();
    const firstResult = normalizeIntent(ir, FIXED_OPTIONS);
    const firstJSON = JSON.stringify(firstResult.coreIR);

    for (let i = 0; i < 1000; i++) {
      const result = normalizeIntent(ir, FIXED_OPTIONS);
      const currentJSON = JSON.stringify(result.coreIR);
      expect(currentJSON).toBe(firstJSON);
    }
  });

  // ========================================================================
  // TC-DET-04: 1000 次调用 metadata 完全一致
  // ========================================================================
  test("TC-DET-04: 1000 invocations produce identical metadata", () => {
    const ir = buildValidCangjieIR();
    const firstResult = normalizeIntent(ir, FIXED_OPTIONS);
    const firstMetadataJSON = JSON.stringify(firstResult.metadata);

    for (let i = 0; i < 1000; i++) {
      const result = normalizeIntent(ir, FIXED_OPTIONS);
      expect(JSON.stringify(result.metadata)).toBe(firstMetadataJSON);
    }
  });

  // ========================================================================
  // TC-DET-05: capturedAt 必须显式传入，禁止默认 new Date()
  // ========================================================================
  test("TC-DET-05: capturedAt is explicitly passed and preserved in metadata", () => {
    const ir = buildValidCangjieIR();

    // 使用不同的显式 capturedAt
    const options1: IntentNormalizerOptions = { capturedAt: "2026-01-01T00:00:00.000Z" };
    const options2: IntentNormalizerOptions = { capturedAt: "2026-12-31T23:59:59.999Z" };

    const result1 = normalizeIntent(ir, options1);
    const result2 = normalizeIntent(ir, options2);

    expect(result1.metadata.capturedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(result2.metadata.capturedAt).toBe("2026-12-31T23:59:59.999Z");

    // capturedAt 不影响 inputHash（因为它在 metadata 中，不在 coreIR 语义哈希中）
    expect(result1.coreIR.provenance.inputHash).toBe(result2.coreIR.provenance.inputHash);
  });

  // ========================================================================
  // TC-DET-06: 非语义时间字段不影响哈希结果
  // ========================================================================
  test("TC-DET-06: non-semantic timestamp fields do not affect inputHash", () => {
    const ir1 = buildValidCangjieIR();

    // 构造一个时间戳不同但语义相同的 IR
    const ir2 = buildValidCangjieIR();
    ir2.metadata = {
      ...ir2.metadata,
      createdAt: "2099-12-31T23:59:59.999Z", // 不同的时间戳
    };
    if (ir2.parameters[0].calibration) {
      ir2.parameters[0].calibration.calibratedAt = "2099-01-01T00:00:00.000Z";
    }
    if (ir2.provenance.verification) {
      ir2.provenance.verification.verifiedAt = "2099-06-15T12:00:00.000Z";
    }

    const hash1 = computeSemanticInputHash(ir1);
    const hash2 = computeSemanticInputHash(ir2);

    // 时间戳字段被排除，哈希应该相同
    expect(hash1).toBe(hash2);
  });

  // ========================================================================
  // TC-DET-07: 语义字段变化会影响哈希
  // ========================================================================
  test("TC-DET-07: semantic field changes affect inputHash", () => {
    const ir1 = buildValidCangjieIR();
    const ir2 = buildValidCangjieIR();

    // 修改语义字段：参数值
    ir2.parameters[0].value = 0.55;

    const hash1 = computeSemanticInputHash(ir1);
    const hash2 = computeSemanticInputHash(ir2);

    expect(hash1).not.toBe(hash2);
  });

  // ========================================================================
  // TC-DET-08: confidence 变化会影响哈希（因为它是语义字段）
  // ========================================================================
  test("TC-DET-08: confidence changes affect inputHash", () => {
    const ir1 = buildValidCangjieIR();
    const ir2 = buildValidCangjieIR();

    ir2.parameters[0].confidence = 0.50;

    const hash1 = computeSemanticInputHash(ir1);
    const hash2 = computeSemanticInputHash(ir2);

    expect(hash1).not.toBe(hash2);
  });

  // ========================================================================
  // TC-DET-09: 相同输入不同调用顺序不影响结果
  // ========================================================================
  test("TC-DET-09: parameter order does not affect output", () => {
    const ir1 = buildValidCangjieIR();
    const ir2 = buildValidCangjieIR();

    // 反转参数顺序
    ir2.parameters = [...ir2.parameters].reverse();

    const result1 = normalizeIntent(ir1, FIXED_OPTIONS);
    const result2 = normalizeIntent(ir2, FIXED_OPTIONS);

    // coreIR 应该相同（因为参数按 path 写入，顺序不影响）
    expect(JSON.stringify(result1.coreIR)).toBe(JSON.stringify(result2.coreIR));

    // inputHash 可能不同（因为 parameters 数组顺序不同），但 coreIR 相同
  });

  // ========================================================================
  // TC-DET-10: inferenceExecutionMs 透传正确
  // ========================================================================
  test("TC-DET-10: inferenceExecutionMs is explicitly passed and preserved", () => {
    const ir = buildValidCangjieIR();

    const options: IntentNormalizerOptions = {
      capturedAt: FIXED_CAPTURED_AT,
      inferenceExecutionMs: 42,
    };

    const result = normalizeIntent(ir, options);
    expect(result.coreIR.provenance.inferenceExecutionMs).toBe(42);
  });
});
