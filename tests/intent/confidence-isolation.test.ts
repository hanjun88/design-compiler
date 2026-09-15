/**
 * tests/intent/confidence-isolation.test.ts
 *
 * 置信度隔离测试。
 *
 * 严格隔离原则：
 * - Core IR 中每个参数的 confidence 严格来自 Cangjie 层参数的 confidence（sourceObservationConfidence）
 * - intentResolutionConfidence（意图解析置信度）仅存于 NormalizationMetadata，不得进入 Core IR
 * - mappingConfidence（路径映射置信度）仅存于 NormalizationMetadata，不得进入 Core IR
 * - Core IR 的 provenance 中不得包含任何 confidence 字段
 */

import { normalizeIntent } from "../../compiler-intent/intent-normalizer";
import {
  verifyConfidenceIsolation,
  assertConfidenceIsolation,
  collectCoreParameters,
  buildCangjieParameterIndex,
} from "../../compiler-intent/confidence-isolator";
import type { CangjieRawDesignIR, IntentNormalizerOptions } from "../../compiler-intent/types";

// ============================================================================
// 测试夹具
// ============================================================================

function buildCangjieIRWithConfidence(confidences: number[]): CangjieRawDesignIR {
  const paramPaths = [
    "/composition/negativeSpaceRatio",
    "/composition/focalPoint",
    "/lighting/keyLight/colorTemp",
    "/color/dominant",
  ];

  return {
    irId: "ir-conf-test-001",
    concept: {
      name: "虚实相生",
      ontologyPath: "/aesthetics/void-solid",
    },
    intent: {
      statement: "测试置信度隔离",
      heuristicIds: ["h-test-01"],
    },
    parameters: paramPaths.map((path, i) => ({
      paramId: `param-${i}`,
      path,
      value: path === "/composition/focalPoint" ? [0.5, 0.5] : path === "/color/dominant" ? "#808080" : 0.5,
      confidence: confidences[i] ?? 0.8,
      source: {
        type: "literature" as const,
        ref: `source-${i}`,
      },
      calibration: {
        method: "expert-calibrated" as const,
        status: "PRODUCTION" as const,
      },
    })),
    provenance: {
      corpusSources: [
        { corpusId: "c1", title: "Test", type: "book" as const },
      ],
      distillationMethod: "test",
    },
    distillerVersion: "1.0.0",
  };
}

const FIXED_OPTIONS: IntentNormalizerOptions = {
  capturedAt: "2026-09-15T12:00:00.000Z",
  intentResolutionConfidence: 0.88,
  mappingConfidence: 0.92,
};

describe("STEP 6-B: Confidence Isolation", () => {
  // ========================================================================
  // TC-CI-01: Core 参数 confidence 严格来自 Cangjie sourceObservationConfidence
  // ========================================================================
  test("TC-CI-01: Core parameter confidence strictly matches Cangjie sourceObservationConfidence", () => {
    const confidences = [0.95, 0.82, 0.71, 0.88];
    const cangjieIR = buildCangjieIRWithConfidence(confidences);
    const result = normalizeIntent(cangjieIR, FIXED_OPTIONS);

    const report = verifyConfidenceIsolation(cangjieIR, result.coreIR, result.metadata);
    expect(report.passed).toBe(true);
    expect(report.violations.length).toBe(0);
    expect(report.stats.confidenceMatches).toBe(4);
    expect(report.stats.confidenceMismatches).toBe(0);

    // 逐个验证
    const coreParams = collectCoreParameters(result.coreIR);
    expect(coreParams.get("/composition/negativeSpaceRatio")?.confidence).toBe(0.95);
    expect(coreParams.get("/composition/focalPoint")?.confidence).toBe(0.82);
    expect(coreParams.get("/lighting/keyLight/colorTemp")?.confidence).toBe(0.71);
    expect(coreParams.get("/color/dominant")?.confidence).toBe(0.88);
  });

  // ========================================================================
  // TC-CI-02: intentResolutionConfidence 不进入 Core IR
  // ========================================================================
  test("TC-CI-02: intentResolutionConfidence is isolated to metadata, not in Core IR", () => {
    const cangjieIR = buildCangjieIRWithConfidence([0.9, 0.9, 0.9, 0.9]);
    const result = normalizeIntent(cangjieIR, FIXED_OPTIONS);

    // metadata 中存在
    expect(result.metadata.intentResolutionConfidence).toBe(0.88);

    // Core IR 中不存在
    const coreParams = collectCoreParameters(result.coreIR);
    for (const [, param] of coreParams) {
      expect(param.evidence?.some((e) => e.includes("intentResolutionConfidence"))).toBe(false);
      if (param.derivedFrom) {
        expect(param.derivedFrom).not.toContain("intentResolutionConfidence");
      }
    }

    // provenance 中不存在
    const provenanceAny = result.coreIR.provenance as Record<string, unknown>;
    expect("intentResolutionConfidence" in provenanceAny).toBe(false);
  });

  // ========================================================================
  // TC-CI-03: mappingConfidence 不进入 Core IR
  // ========================================================================
  test("TC-CI-03: mappingConfidence is isolated to metadata, not in Core IR", () => {
    const cangjieIR = buildCangjieIRWithConfidence([0.9, 0.9, 0.9, 0.9]);
    const result = normalizeIntent(cangjieIR, FIXED_OPTIONS);

    // metadata 中存在
    expect(result.metadata.mappingConfidence).toBe(0.92);

    // Core IR 中不存在
    const coreParams = collectCoreParameters(result.coreIR);
    for (const [, param] of coreParams) {
      expect(param.evidence?.some((e) => e.includes("mappingConfidence"))).toBe(false);
    }
  });

  // ========================================================================
  // TC-CI-04: Core IR provenance 中不包含 confidence 字段
  // ========================================================================
  test("TC-CI-04: Core IR provenance does not contain any confidence field", () => {
    const cangjieIR = buildCangjieIRWithConfidence([0.9, 0.9, 0.9, 0.9]);
    const result = normalizeIntent(cangjieIR, FIXED_OPTIONS);

    const provenanceAny = result.coreIR.provenance as Record<string, unknown>;
    expect("confidence" in provenanceAny).toBe(false);
    expect("intentResolutionConfidence" in provenanceAny).toBe(false);
    expect("mappingConfidence" in provenanceAny).toBe(false);
    expect("sourceObservationConfidence" in provenanceAny).toBe(false);
  });

  // ========================================================================
  // TC-CI-05: assertConfidenceIsolation 通过时不抛出
  // ========================================================================
  test("TC-CI-05: assertConfidenceIsolation does not throw when isolation holds", () => {
    const cangjieIR = buildCangjieIRWithConfidence([0.9, 0.9, 0.9, 0.9]);
    const result = normalizeIntent(cangjieIR, FIXED_OPTIONS);

    expect(() => {
      assertConfidenceIsolation(cangjieIR, result.coreIR, result.metadata);
    }).not.toThrow();
  });

  // ========================================================================
  // TC-CI-06: 不同 Cangjie confidence 产生不同 Core confidence
  // ========================================================================
  test("TC-CI-06: different Cangjie confidence produces different Core confidence", () => {
    const ir1 = buildCangjieIRWithConfidence([0.5, 0.5, 0.5, 0.5]);
    const ir2 = buildCangjieIRWithConfidence([0.99, 0.99, 0.99, 0.99]);

    const result1 = normalizeIntent(ir1, FIXED_OPTIONS);
    const result2 = normalizeIntent(ir2, FIXED_OPTIONS);

    const params1 = collectCoreParameters(result1.coreIR);
    const params2 = collectCoreParameters(result2.coreIR);

    expect(params1.get("/composition/negativeSpaceRatio")?.confidence).toBe(0.5);
    expect(params2.get("/composition/negativeSpaceRatio")?.confidence).toBe(0.99);
  });

  // ========================================================================
  // TC-CI-07: confidence 边界值（0 和 1）正确传递
  // ========================================================================
  test("TC-CI-07: confidence boundary values (0 and 1) are correctly passed through", () => {
    const ir = buildCangjieIRWithConfidence([0.0, 1.0, 0.5, 0.0]);
    const result = normalizeIntent(ir, FIXED_OPTIONS);
    const params = collectCoreParameters(result.coreIR);

    expect(params.get("/composition/negativeSpaceRatio")?.confidence).toBe(0.0);
    expect(params.get("/composition/focalPoint")?.confidence).toBe(1.0);
    expect(params.get("/color/dominant")?.confidence).toBe(0.0);
  });

  // ========================================================================
  // TC-CI-08: buildCangjieParameterIndex 正确构建索引
  // ========================================================================
  test("TC-CI-08: buildCangjieParameterIndex correctly indexes by path", () => {
    const ir = buildCangjieIRWithConfidence([0.9, 0.8, 0.7, 0.6]);
    const index = buildCangjieParameterIndex(ir);

    expect(index.size).toBe(4);
    expect(index.get("/composition/negativeSpaceRatio")?.confidence).toBe(0.9);
    expect(index.get("/composition/focalPoint")?.confidence).toBe(0.8);
    expect(index.get("/lighting/keyLight/colorTemp")?.confidence).toBe(0.7);
    expect(index.get("/color/dominant")?.confidence).toBe(0.6);
  });

  // ========================================================================
  // TC-CI-09: collectCoreParameters 收集所有 Core 参数
  // ========================================================================
  test("TC-CI-09: collectCoreParameters collects all Core IR parameters", () => {
    const ir = buildCangjieIRWithConfidence([0.9, 0.9, 0.9, 0.9]);
    const result = normalizeIntent(ir, FIXED_OPTIONS);
    const params = collectCoreParameters(result.coreIR);

    // composition (4) + camera (4) + lighting (7) + materials (4) + color (5) = 24
    expect(params.size).toBe(24);

    // 验证关键路径存在
    expect(params.has("/composition/focalPoint")).toBe(true);
    expect(params.has("/camera/fov")).toBe(true);
    expect(params.has("/lighting/keyLight/azimuth")).toBe(true);
    expect(params.has("/lighting/ambientRatio")).toBe(true);
    expect(params.has("/materials/0/roughness")).toBe(true);
    expect(params.has("/color/dominant")).toBe(true);
  });

  // ========================================================================
  // TC-CI-10: 完整端到端置信度隔离验证
  // ========================================================================
  test("TC-CI-10: full end-to-end confidence isolation verification passes", () => {
    const cangjieIR = buildCangjieIRWithConfidence([0.91, 0.83, 0.77, 0.95]);
    const result = normalizeIntent(cangjieIR, FIXED_OPTIONS);

    const report = verifyConfidenceIsolation(cangjieIR, result.coreIR, result.metadata);

    expect(report.passed).toBe(true);
    expect(report.violations).toEqual([]);
    expect(report.stats.matchedCangjieParameters).toBe(4);
    expect(report.stats.confidenceMatches).toBe(4);
    expect(report.stats.confidenceMismatches).toBe(0);
    expect(report.stats.totalCoreParameters).toBe(24);
  });
});
