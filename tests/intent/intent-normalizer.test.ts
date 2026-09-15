/**
 * tests/intent/intent-normalizer.test.ts
 *
 * Intent Normalization Engine 端到端测试。
 *
 * 验证 Cangjie 层 RawDesignIR → Core Compiler 层 RawDesignIR 的完整降维编译：
 * 1. PASS 状态：所有必选参数映射成功
 * 2. BLOCKED_DATA 状态：必选路径缺失
 * 3. 未映射参数处理
 * 4. 类型不匹配处理
 * 5. materials 数组多索引处理
 * 6. 覆盖检测
 * 7. Core IR 结构完整性
 */

import { normalizeIntent } from "../../compiler-intent/intent-normalizer";
import { lookupPointer } from "../../compiler-intent/pointer-map";
import type {
  CangjieRawDesignIR,
  CangjieEstimatedParameter,
  IntentNormalizerOptions,
} from "../../compiler-intent/types";

// ============================================================================
// 辅助函数
// ============================================================================

function makeParam(
  paramId: string,
  path: string,
  value: unknown,
  confidence = 0.9,
): CangjieEstimatedParameter {
  return {
    paramId,
    path,
    value,
    confidence,
    source: { type: "literature", ref: `ref-${paramId}` },
    calibration: { method: "expert-calibrated", status: "PRODUCTION" },
  };
}

function buildBaseIR(parameters: CangjieEstimatedParameter[]): CangjieRawDesignIR {
  return {
    irId: "ir-e2e-test-001",
    concept: { name: "虚实相生", ontologyPath: "/aesthetics/void-solid" },
    intent: { statement: "端到端测试", heuristicIds: ["h-e2e-01"] },
    parameters,
    provenance: {
      corpusSources: [{ corpusId: "c1", title: "Test Corpus", type: "book" }],
      distillationMethod: "test-method",
    },
    distillerVersion: "2.5.0",
  };
}

const FIXED_OPTIONS: IntentNormalizerOptions = {
  capturedAt: "2026-09-15T12:00:00.000Z",
  inferenceExecutionMs: 100,
};

// 所有必选路径的完整参数列表（用于 PASS 测试）
function buildFullRequiredParams(): CangjieEstimatedParameter[] {
  return [
    // composition (required: focalPoint, negativeSpaceRatio, depthLayerCount)
    makeParam("p-focal", "/composition/focalPoint", [0.4, 0.5], 0.92),
    makeParam("p-neg-space", "/composition/negativeSpaceRatio", 0.45, 0.88),
    makeParam("p-depth", "/composition/depthLayerCount", 4, 0.85),
    makeParam("p-symmetry", "/composition/symmetry", 0.7, 0.80),
    // camera (required: fov, shotSize)
    makeParam("p-fov", "/camera/fov", 35, 0.87),
    makeParam("p-shot", "/camera/shotSize", "long-shot", 0.90),
    makeParam("p-angle", "/camera/angle", 5, 0.75),
    makeParam("p-height", "/camera/height", 1.6, 0.78),
    // lighting (required: azimuth, elevation, colorTemp, intensity, ambientRatio)
    makeParam("p-azimuth", "/lighting/keyLight/azimuth", 45, 0.86),
    makeParam("p-elevation", "/lighting/keyLight/elevation", 30, 0.84),
    makeParam("p-colortemp", "/lighting/keyLight/colorTemp", 5500, 0.82),
    makeParam("p-intensity", "/lighting/keyLight/intensity", 1.2, 0.80),
    makeParam("p-softness", "/lighting/keyLight/softness", 0.6, 0.75),
    makeParam("p-ambient", "/lighting/ambientRatio", 0.25, 0.83),
    makeParam("p-rim", "/lighting/rimLightPresent", true, 0.70),
    // materials (required: baseType, roughness, metalness)
    makeParam("p-mat-base", "/materials/0/baseType", "stone", 0.91),
    makeParam("p-mat-rough", "/materials/0/roughness", 0.7, 0.88),
    makeParam("p-mat-metal", "/materials/0/metalness", 0.1, 0.85),
    makeParam("p-mat-wear", "/materials/0/wear", 0.4, 0.78),
    // color (required: dominant, secondary, contrastRatio)
    makeParam("p-color-dom", "/color/dominant", "#2b2b2b", 0.95),
    makeParam("p-color-sec", "/color/secondary", "#7c7c7c", 0.92),
    makeParam("p-color-accent", "/color/accent", "#d4af37", 0.85),
    makeParam("p-color-contrast", "/color/contrastRatio", 4.5, 0.90),
    makeParam("p-color-temp", "/color/temperatureBias", -0.1, 0.80),
  ];
}

describe("STEP 6-B: Intent Normalizer End-to-End", () => {
  // ========================================================================
  // TC-IN-01: 完整必选参数 → PASS
  // ========================================================================
  test("TC-IN-01: full required parameters produce PASS status", () => {
    const ir = buildBaseIR(buildFullRequiredParams());
    const result = normalizeIntent(ir, FIXED_OPTIONS);

    expect(result.status).toBe("PASS");
    expect(result.metadata.mappedParameters).toBe(24);
    expect(result.metadata.unmappedParameters).toEqual([]);
    expect(result.diagnostics.length).toBe(0);
    expect(result.coreIR.provenance.rawIntegrityStatus).toBe("READY");
  });

  // ========================================================================
  // TC-IN-02: 必选路径缺失 → BLOCKED_DATA
  // ========================================================================
  test("TC-IN-02: missing required path produces BLOCKED_DATA", () => {
    // 移除 focalPoint（必选）
    const params = buildFullRequiredParams().filter((p) => p.path !== "/composition/focalPoint");
    const ir = buildBaseIR(params);
    const result = normalizeIntent(ir, FIXED_OPTIONS);

    expect(result.status).toBe("BLOCKED_DATA");
    expect(result.coreIR.provenance.rawIntegrityStatus).toBe("BLOCKED_DATA");
    expect(result.diagnostics.some((d) => d.includes("BLOCKED_DATA"))).toBe(true);
    expect(result.diagnostics.some((d) => d.includes("/composition/focalPoint"))).toBe(true);
  });

  // ========================================================================
  // TC-IN-03: 多个必选路径缺失 → BLOCKED_DATA 列出所有缺失
  // ========================================================================
  test("TC-IN-03: multiple missing required paths all listed in BLOCKED_DATA", () => {
    const params = buildFullRequiredParams().filter(
      (p) => p.path !== "/composition/focalPoint" && p.path !== "/camera/fov" && p.path !== "/color/dominant",
    );
    const ir = buildBaseIR(params);
    const result = normalizeIntent(ir, FIXED_OPTIONS);

    expect(result.status).toBe("BLOCKED_DATA");
    expect(result.diagnostics.some((d) => d.includes("/composition/focalPoint"))).toBe(true);
    expect(result.diagnostics.some((d) => d.includes("/camera/fov"))).toBe(true);
    expect(result.diagnostics.some((d) => d.includes("/color/dominant"))).toBe(true);
  });

  // ========================================================================
  // TC-IN-04: 未映射参数（path 不存在）不阻断，但记录
  // ========================================================================
  test("TC-IN-04: unmapped parameters are recorded but do not block if required paths exist", () => {
    const params = [
      ...buildFullRequiredParams(),
      makeParam("p-invalid-1", "/spatialLayers/0/position", { x: 0, y: 0 }, 0.8),
      makeParam("p-invalid-2", "/lighting/volumetric/intensity", 0.5, 0.7),
      makeParam("p-invalid-3", "/nonexistent/path", "value", 0.6),
    ];
    const ir = buildBaseIR(params);
    const result = normalizeIntent(ir, FIXED_OPTIONS);

    expect(result.status).toBe("PASS");
    expect(result.metadata.mappedParameters).toBe(24);
    expect(result.metadata.unmappedParameters).toContain("p-invalid-1");
    expect(result.metadata.unmappedParameters).toContain("p-invalid-2");
    expect(result.metadata.unmappedParameters).toContain("p-invalid-3");
    expect(result.metadata.unmappedParameters.length).toBe(3);
    expect(result.diagnostics.length).toBe(3);
    expect(result.diagnostics.every((d) => d.includes("UNMAPPED_PARAM"))).toBe(true);
  });

  // ========================================================================
  // TC-IN-05: 类型不匹配 → 参数被跳过
  // ========================================================================
  test("TC-IN-05: type mismatch causes parameter to be skipped", () => {
    // focalPoint 期望 number-array，但传入 string
    const params = buildFullRequiredParams().filter((p) => p.path !== "/composition/focalPoint");
    params.push(makeParam("p-focal-bad", "/composition/focalPoint", "not-an-array", 0.9));

    const ir = buildBaseIR(params);
    const result = normalizeIntent(ir, FIXED_OPTIONS);

    // focalPoint 必选但类型不匹配，应该 BLOCKED_DATA
    expect(result.status).toBe("BLOCKED_DATA");
    expect(result.metadata.unmappedParameters).toContain("p-focal-bad");
    expect(result.diagnostics.some((d) => d.includes("TYPE_MISMATCH"))).toBe(true);
  });

  // ========================================================================
  // TC-IN-06: materials 数组多索引支持
  // ========================================================================
  test("TC-IN-06: materials array supports multiple indices", () => {
    const params = [
      ...buildFullRequiredParams(),
      // 第二个材质
      makeParam("p-mat1-base", "/materials/1/baseType", "wood", 0.85),
      makeParam("p-mat1-rough", "/materials/1/roughness", 0.6, 0.82),
      makeParam("p-mat1-metal", "/materials/1/metalness", 0.0, 0.80),
      makeParam("p-mat1-wear", "/materials/1/wear", 0.5, 0.75),
    ];
    const ir = buildBaseIR(params);
    const result = normalizeIntent(ir, FIXED_OPTIONS);

    expect(result.status).toBe("PASS");
    expect(result.coreIR.materials.length).toBe(2);
    expect(result.coreIR.materials[0].baseType.value).toBe("stone");
    expect(result.coreIR.materials[1].baseType.value).toBe("wood");
    expect(result.coreIR.materials[1].roughness.value).toBe(0.6);
  });

  // ========================================================================
  // TC-IN-07: 同一 path 多个参数 → 后者覆盖前者，记录 overwritten
  // ========================================================================
  test("TC-IN-07: duplicate path parameters are overwritten and recorded", () => {
    const params = [
      ...buildFullRequiredParams().filter((p) => p.path !== "/composition/negativeSpaceRatio"),
      makeParam("p-neg-first", "/composition/negativeSpaceRatio", 0.30, 0.80),
      makeParam("p-neg-second", "/composition/negativeSpaceRatio", 0.55, 0.95),
    ];
    const ir = buildBaseIR(params);
    const result = normalizeIntent(ir, FIXED_OPTIONS);

    expect(result.status).toBe("PASS");
    expect(result.coreIR.composition.negativeSpaceRatio.value).toBe(0.55); // 后者覆盖
    expect(result.coreIR.composition.negativeSpaceRatio.confidence).toBe(0.95);
    expect(result.metadata.overwrittenParameters).toContain("/composition/negativeSpaceRatio");
    expect(result.diagnostics.some((d) => d.includes("OVERWRITE"))).toBe(true);
  });

  // ========================================================================
  // TC-IN-08: Core IR 结构完整性验证
  // ========================================================================
  test("TC-IN-08: output Core IR has complete structure", () => {
    const ir = buildBaseIR(buildFullRequiredParams());
    const result = normalizeIntent(ir, FIXED_OPTIONS);

    const coreIR = result.coreIR;

    // 根级字段
    expect(coreIR.$schema).toBeDefined();
    expect(coreIR.meta).toBeDefined();
    expect(coreIR.meta.sourceType).toBe("image");
    expect(coreIR.composition).toBeDefined();
    expect(coreIR.camera).toBeDefined();
    expect(coreIR.lighting).toBeDefined();
    expect(coreIR.lighting.keyLight).toBeDefined();
    expect(coreIR.materials).toBeDefined();
    expect(Array.isArray(coreIR.materials)).toBe(true);
    expect(coreIR.color).toBeDefined();
    expect(coreIR.provenance).toBeDefined();

    // provenance 字段
    expect(coreIR.provenance.extractorVersion).toBe("2.5.0");
    expect(coreIR.provenance.inferenceExecutionMs).toBe(100);
    expect(coreIR.provenance.hashManifest.algorithm).toBe("SHA-256");
    expect(coreIR.provenance.hashManifest.canonicalization).toBe("RFC8785");
    expect(coreIR.provenance.inputHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(coreIR.provenance.rawIRHash).toBeDefined();
  });

  // ========================================================================
  // TC-IN-09: 参数值正确传递
  // ========================================================================
  test("TC-IN-09: parameter values are correctly passed through", () => {
    const ir = buildBaseIR(buildFullRequiredParams());
    const result = normalizeIntent(ir, FIXED_OPTIONS);

    expect(result.coreIR.composition.focalPoint.value).toEqual([0.4, 0.5]);
    expect(result.coreIR.composition.negativeSpaceRatio.value).toBe(0.45);
    expect(result.coreIR.composition.depthLayerCount.value).toBe(4);
    expect(result.coreIR.camera.fov.value).toBe(35);
    expect(result.coreIR.camera.shotSize.value).toBe("long-shot");
    expect(result.coreIR.lighting.keyLight.azimuth.value).toBe(45);
    expect(result.coreIR.lighting.keyLight.colorTemp.value).toBe(5500);
    expect(result.coreIR.lighting.ambientRatio.value).toBe(0.25);
    expect(result.coreIR.lighting.rimLightPresent.value).toBe(true);
    expect(result.coreIR.materials[0].baseType.value).toBe("stone");
    expect(result.coreIR.materials[0].roughness.value).toBe(0.7);
    expect(result.coreIR.color.dominant.value).toBe("#2b2b2b");
    expect(result.coreIR.color.contrastRatio.value).toBe(4.5);
  });

  // ========================================================================
  // TC-IN-10: evidence 数组包含来源信息
  // ========================================================================
  test("TC-IN-10: evidence array contains source and calibration info", () => {
    const ir = buildBaseIR(buildFullRequiredParams());
    const result = normalizeIntent(ir, FIXED_OPTIONS);

    const param = result.coreIR.composition.negativeSpaceRatio;
    expect(param.evidence.length).toBeGreaterThan(0);
    expect(param.evidence.some((e) => e.includes("source:"))).toBe(true);
    expect(param.evidence.some((e) => e.includes("calibration:"))).toBe(true);
  });

  // ========================================================================
  // TC-IN-11: 空 parameters 数组 → BLOCKED_DATA（所有必选路径缺失）
  // ========================================================================
  test("TC-IN-11: empty parameters array produces BLOCKED_DATA", () => {
    const ir = buildBaseIR([]);
    const result = normalizeIntent(ir, FIXED_OPTIONS);

    expect(result.status).toBe("BLOCKED_DATA");
    expect(result.metadata.mappedParameters).toBe(0);
    expect(result.metadata.unmappedParameters).toEqual([]);
  });

  // ========================================================================
  // TC-IN-12: lookupPointer 对 materials 任意索引返回模板条目
  // ========================================================================
  test("TC-IN-12: lookupPointer returns template entry for any materials index", () => {
    const entry0 = lookupPointer("/materials/0/roughness");
    const entry5 = lookupPointer("/materials/5/roughness");
    const entry99 = lookupPointer("/materials/99/roughness");

    expect(entry0).toBeDefined();
    expect(entry5).toBeDefined();
    expect(entry99).toBeDefined();
    expect(entry0?.valueType).toBe("number");
    expect(entry5?.valueType).toBe("number");
    expect(entry99?.valueType).toBe("number");
  });
});
