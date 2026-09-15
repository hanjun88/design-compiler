/**
 * tests/intent/pointer-map.test.ts
 *
 * 指针物理校验测试。
 *
 * 验证 POINTER_MAP 中的所有路径：
 * 1. 严格对齐 contracts.ts RawDesignIR 的实际字段结构
 * 2. 路径格式合法（JSON Pointer）
 * 3. 类型映射正确
 * 4. materials 数组路径归一化正确
 * 5. 必选路径列表完整
 */

import {
  POINTER_MAP,
  lookupPointer,
  isValidPointer,
  getRequiredPaths,
  getAllPaths,
  validateValueType,
} from "../../compiler-intent/pointer-map";

describe("STEP 6-B: Pointer Map Physical Validation", () => {
  // ========================================================================
  // TC-PM-01: 映射表非空且结构完整
  // ========================================================================
  test("TC-PM-01: POINTER_MAP is non-empty and every entry has all required fields", () => {
    expect(POINTER_MAP.length).toBeGreaterThan(0);

    for (const entry of POINTER_MAP) {
      expect(entry.path).toBeDefined();
      expect(entry.path.startsWith("/")).toBe(true);
      expect(entry.valueType).toBeDefined();
      expect(["number", "string", "boolean", "number-array"]).toContain(entry.valueType);
      expect(entry.defaultUnit).toBeDefined();
      expect(entry.defaultSource).toBeDefined();
      expect(entry.defaultStatus).toBeDefined();
      expect(typeof entry.required).toBe("boolean");
      expect(entry.category).toBeDefined();
      expect(["composition", "camera", "lighting", "materials", "color"]).toContain(entry.category);
      expect(entry.description).toBeDefined();
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  // ========================================================================
  // TC-PM-02: 路径唯一性
  // ========================================================================
  test("TC-PM-02: all paths in POINTER_MAP are unique", () => {
    const paths = POINTER_MAP.map((e) => e.path);
    const uniquePaths = new Set(paths);
    expect(uniquePaths.size).toBe(paths.length);
  });

  // ========================================================================
  // TC-PM-03: Core IR 所有参数字段都在映射表中
  // ========================================================================
  test("TC-PM-03: all Core IR parameter fields are covered in pointer map", () => {
    const expectedPaths = [
      // composition
      "/composition/focalPoint",
      "/composition/negativeSpaceRatio",
      "/composition/depthLayerCount",
      "/composition/symmetry",
      // camera
      "/camera/fov",
      "/camera/shotSize",
      "/camera/angle",
      "/camera/height",
      // lighting
      "/lighting/keyLight/azimuth",
      "/lighting/keyLight/elevation",
      "/lighting/keyLight/colorTemp",
      "/lighting/keyLight/intensity",
      "/lighting/keyLight/softness",
      "/lighting/ambientRatio",
      "/lighting/rimLightPresent",
      // materials (template)
      "/materials/0/baseType",
      "/materials/0/roughness",
      "/materials/0/metalness",
      "/materials/0/wear",
      // color
      "/color/dominant",
      "/color/secondary",
      "/color/accent",
      "/color/contrastRatio",
      "/color/temperatureBias",
    ];

    const mapPaths = new Set(POINTER_MAP.map((e) => e.path));
    for (const expected of expectedPaths) {
      expect(mapPaths.has(expected)).toBe(true);
    }
    expect(POINTER_MAP.length).toBe(expectedPaths.length);
  });

  // ========================================================================
  // TC-PM-04: lookupPointer 直接查找
  // ========================================================================
  test("TC-PM-04: lookupPointer finds direct paths", () => {
    const entry = lookupPointer("/composition/negativeSpaceRatio");
    expect(entry).toBeDefined();
    expect(entry?.path).toBe("/composition/negativeSpaceRatio");
    expect(entry?.valueType).toBe("number");
    expect(entry?.category).toBe("composition");
    expect(entry?.required).toBe(true);
  });

  // ========================================================================
  // TC-PM-05: lookupPointer materials 数组索引归一化
  // ========================================================================
  test("TC-PM-05: lookupPointer normalizes materials array indices", () => {
    // /materials/0/ 是模板
    const entry0 = lookupPointer("/materials/0/roughness");
    expect(entry0).toBeDefined();
    expect(entry0?.valueType).toBe("number");

    // /materials/1/ 应该归一化为 /materials/0/ 模板
    const entry1 = lookupPointer("/materials/1/roughness");
    expect(entry1).toBeDefined();
    expect(entry1?.valueType).toBe("number");
    expect(entry1?.path).toBe("/materials/0/roughness"); // 归一化后的模板路径

    // /materials/5/ 也应该工作
    const entry5 = lookupPointer("/materials/5/baseType");
    expect(entry5).toBeDefined();
    expect(entry5?.valueType).toBe("string");
  });

  // ========================================================================
  // TC-PM-06: lookupPointer 不存在的路径返回 undefined
  // ========================================================================
  test("TC-PM-06: lookupPointer returns undefined for non-existent paths", () => {
    expect(lookupPointer("/composition/nonexistent")).toBeUndefined();
    expect(lookupPointer("/lighting/volumetric/intensity")).toBeUndefined();
    expect(lookupPointer("/spatialLayers/0/position")).toBeUndefined();
    expect(lookupPointer("/invalid")).toBeUndefined();
    expect(lookupPointer("")).toBeUndefined();
  });

  // ========================================================================
  // TC-PM-07: isValidPointer 布尔验证
  // ========================================================================
  test("TC-PM-07: isValidPointer returns correct boolean", () => {
    expect(isValidPointer("/composition/focalPoint")).toBe(true);
    expect(isValidPointer("/camera/fov")).toBe(true);
    expect(isValidPointer("/lighting/keyLight/colorTemp")).toBe(true);
    expect(isValidPointer("/materials/0/metalness")).toBe(true);
    expect(isValidPointer("/color/dominant")).toBe(true);
    expect(isValidPointer("/materials/3/wear")).toBe(true); // 任意索引

    expect(isValidPointer("/composition/nonexistent")).toBe(false);
    expect(isValidPointer("/spatialLayers")).toBe(false);
    expect(isValidPointer("/position")).toBe(false);
  });

  // ========================================================================
  // TC-PM-08: getRequiredPaths 返回所有必选路径
  // ========================================================================
  test("TC-PM-08: getRequiredPaths returns all required paths", () => {
    const required = getRequiredPaths();
    expect(required.length).toBeGreaterThan(0);

    // 验证所有返回的路径确实是 required
    for (const path of required) {
      const entry = lookupPointer(path);
      expect(entry?.required).toBe(true);
    }

    // 验证已知的必选路径都在列表中
    expect(required).toContain("/composition/focalPoint");
    expect(required).toContain("/composition/negativeSpaceRatio");
    expect(required).toContain("/camera/fov");
    expect(required).toContain("/lighting/keyLight/azimuth");
    expect(required).toContain("/lighting/ambientRatio");
    expect(required).toContain("/materials/0/baseType");
    expect(required).toContain("/color/dominant");
    expect(required).toContain("/color/contrastRatio");

    // 验证可选路径不在列表中
    expect(required).not.toContain("/composition/symmetry");
    expect(required).not.toContain("/camera/angle");
    expect(required).not.toContain("/lighting/rimLightPresent");
    expect(required).not.toContain("/materials/0/wear");
    expect(required).not.toContain("/color/accent");
  });

  // ========================================================================
  // TC-PM-09: getAllPaths 返回所有路径
  // ========================================================================
  test("TC-PM-09: getAllPaths returns all paths", () => {
    const all = getAllPaths();
    expect(all.length).toBe(POINTER_MAP.length);
    expect(new Set(all).size).toBe(all.length); // 唯一性
  });

  // ========================================================================
  // TC-PM-10: validateValueType 类型校验
  // ========================================================================
  test("TC-PM-10: validateValueType correctly validates value types", () => {
    // number
    expect(validateValueType(0.5, "number")).toBe(true);
    expect(validateValueType(0, "number")).toBe(true);
    expect(validateValueType(-1.5, "number")).toBe(true);
    expect(validateValueType("0.5", "number")).toBe(false);
    expect(validateValueType(NaN, "number")).toBe(false);
    expect(validateValueType(null, "number")).toBe(false);

    // string
    expect(validateValueType("hello", "string")).toBe(true);
    expect(validateValueType("#808080", "string")).toBe(true);
    expect(validateValueType("", "string")).toBe(true);
    expect(validateValueType(123, "string")).toBe(false);
    expect(validateValueType(null, "string")).toBe(false);

    // boolean
    expect(validateValueType(true, "boolean")).toBe(true);
    expect(validateValueType(false, "boolean")).toBe(true);
    expect(validateValueType(1, "boolean")).toBe(false);
    expect(validateValueType("true", "boolean")).toBe(false);

    // number-array
    expect(validateValueType([0.5, 0.3], "number-array")).toBe(true);
    expect(validateValueType([0, 0, 0], "number-array")).toBe(true);
    expect(validateValueType([1.5, -2.0, 0.0], "number-array")).toBe(true);
    expect(validateValueType([0.5, "0.3"], "number-array")).toBe(false);
    expect(validateValueType([0.5, NaN], "number-array")).toBe(false);
    expect(validateValueType(0.5, "number-array")).toBe(false);
    expect(validateValueType([], "number-array")).toBe(true); // 空数组技术上通过
  });

  // ========================================================================
  // TC-PM-11: focalPoint 是 number-array 类型
  // ========================================================================
  test("TC-PM-11: focalPoint is number-array type with vector2 unit", () => {
    const entry = lookupPointer("/composition/focalPoint");
    expect(entry).toBeDefined();
    expect(entry?.valueType).toBe("number-array");
    expect(entry?.defaultUnit).toBe("vector2");
  });

  // ========================================================================
  // TC-PM-12: color 字段是 string 类型 with hex unit
  // ========================================================================
  test("TC-PM-12: color fields are string type with hex unit", () => {
    for (const path of ["/color/dominant", "/color/secondary", "/color/accent"]) {
      const entry = lookupPointer(path);
      expect(entry).toBeDefined();
      expect(entry?.valueType).toBe("string");
      expect(entry?.defaultUnit).toBe("hex");
    }
  });
});
