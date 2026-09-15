/**
 * Golden Case Matrix — Material Category Guard
 *
 * 解析 Matrix Cell 模板中 materials[0].baseType 的受控词表前缀，
 * 验证 PBR 参数（roughness / metalness / wear）是否落在该材质类别的
 * 物理合理区间内。
 *
 * 受控词表格式: "{CATEGORY}::{descriptive-name}"
 * 例: "BRONZE::tang-gilt-bronze" → category = "BRONZE"
 *
 * 区间定义来源: GOLDEN-CASE-MATRIX-CONTRACT-v1.md §2.2
 */

// ============================================================================
// 材质类别定义（与 Contract §2.2 严格一致）
// ============================================================================

export type MaterialCategoryId = "WOOD" | "GLAZE" | "BRONZE" | "STONE";

export interface MaterialCategorySpec {
  categoryId: MaterialCategoryId;
  label: string;
  roughnessRange: [number, number];
  metalnessRange: [number, number];
  wearRange: [number, number];
  f0Characteristic: string;
}

export const MATERIAL_CATEGORIES: Record<MaterialCategoryId, MaterialCategorySpec> = {
  WOOD: {
    categoryId: "WOOD",
    label: "木",
    roughnessRange: [0.55, 0.80],
    metalnessRange: [0.0, 0.05],
    wearRange: [0.2, 0.6],
    f0Characteristic: "0.04 (dielectric)",
  },
  GLAZE: {
    categoryId: "GLAZE",
    label: "釉/琉璃",
    roughnessRange: [0.15, 0.35],
    metalnessRange: [0.0, 0.1],
    wearRange: [0.05, 0.25],
    f0Characteristic: "0.04 + clearcoat",
  },
  BRONZE: {
    categoryId: "BRONZE",
    label: "青铜/金",
    roughnessRange: [0.25, 0.55],
    metalnessRange: [0.7, 1.0],
    wearRange: [0.15, 0.5],
    f0Characteristic: "0.9+ (tinted metallic)",
  },
  STONE: {
    categoryId: "STONE",
    label: "石/玉",
    roughnessRange: [0.35, 0.70],
    metalnessRange: [0.0, 0.15],
    wearRange: [0.2, 0.55],
    f0Characteristic: "0.04 (dielectric)",
  },
};

// ============================================================================
// 解析与验证
// ============================================================================

export interface ParsedMaterialCategory {
  /** 解析出的类别 ID，如 "BRONZE" */
  categoryId: MaterialCategoryId | null;
  /** baseType 中 "::" 后的描述性名称 */
  descriptiveName: string | null;
  /** 原始 baseType 字符串 */
  rawBaseType: string;
  /** 解析是否成功（格式合法且类别在受控词表中） */
  parseOk: boolean;
  /** 解析失败时的诊断信息 */
  parseError: string | null;
}

/**
 * 解析 baseType 字符串，提取材质类别 ID。
 *
 * 格式要求: "{CATEGORY}::{descriptive-name}"
 * - CATEGORY 必须是 MATERIAL_CATEGORIES 的 key
 * - "::" 为分隔符
 * - descriptive-name 为任意非空字符串
 */
export function parseMaterialCategory(baseType: string): ParsedMaterialCategory {
  if (typeof baseType !== "string" || baseType.length === 0) {
    return {
      categoryId: null,
      descriptiveName: null,
      rawBaseType: baseType,
      parseOk: false,
      parseError: "baseType is empty or not a string",
    };
  }

  const separatorIndex = baseType.indexOf("::");
  if (separatorIndex === -1) {
    return {
      categoryId: null,
      descriptiveName: null,
      rawBaseType: baseType,
      parseOk: false,
      parseError: `baseType "${baseType}" missing "::" separator; expected format "{CATEGORY}::{name}"`,
    };
  }

  const categoryPart = baseType.substring(0, separatorIndex);
  const namePart = baseType.substring(separatorIndex + 2);

  if (!(categoryPart in MATERIAL_CATEGORIES)) {
    return {
      categoryId: null,
      descriptiveName: namePart.length > 0 ? namePart : null,
      rawBaseType: baseType,
      parseOk: false,
      parseError: `Unknown material category "${categoryPart}"; expected one of: ${Object.keys(MATERIAL_CATEGORIES).join(", ")}`,
    };
  }

  if (namePart.length === 0) {
    return {
      categoryId: categoryPart as MaterialCategoryId,
      descriptiveName: null,
      rawBaseType: baseType,
      parseOk: false,
      parseError: `baseType "${baseType}" has empty descriptive name after "::"`,
    };
  }

  return {
    categoryId: categoryPart as MaterialCategoryId,
    descriptiveName: namePart,
    rawBaseType: baseType,
    parseOk: true,
    parseError: null,
  };
}

// ============================================================================
// 区间验证
// ============================================================================

export interface ParameterRangeCheck {
  paramName: "roughness" | "metalness" | "wear";
  actualValue: number;
  expectedRange: [number, number];
  passed: boolean;
  deviation: number;
  message: string;
}

export interface MaterialCategoryValidationResult {
  category: ParsedMaterialCategory;
  roughnessCheck: ParameterRangeCheck;
  metalnessCheck: ParameterRangeCheck;
  wearCheck: ParameterRangeCheck;
  /** 三项全部通过且类别解析成功 */
  allPassed: boolean;
  /** 失败项列表（空表示全部通过） */
  failures: string[];
}

function checkRange(
  paramName: "roughness" | "metalness" | "wear",
  value: number,
  range: [number, number],
  categoryLabel: string,
): ParameterRangeCheck {
  const [min, max] = range;
  const passed = value >= min && value <= max;
  const deviation = passed ? 0 : Math.min(Math.abs(value - min), Math.abs(value - max));
  return {
    paramName,
    actualValue: value,
    expectedRange: range,
    passed,
    deviation,
    message: passed
      ? `${paramName}=${value.toFixed(3)} in ${categoryLabel} range [${min}, ${max}]`
      : `${paramName}=${value.toFixed(3)} OUTSIDE ${categoryLabel} range [${min}, ${max}] (deviation=${deviation.toFixed(3)})`,
  };
}

/**
 * 验证材质参数是否符合类别区间。
 *
 * @param baseType materials[0].baseType 的值
 * @param roughness materials[0].roughness 的值
 * @param metalness materials[0].metalness 的值
 * @param wear materials[0].wear 的值
 */
export function validateMaterialCategory(
  baseType: string,
  roughness: number,
  metalness: number,
  wear: number,
): MaterialCategoryValidationResult {
  const category = parseMaterialCategory(baseType);

  if (!category.parseOk || !category.categoryId) {
    const spec: MaterialCategorySpec = {
      categoryId: "STONE",
      label: "UNKNOWN",
      roughnessRange: [0, 1],
      metalnessRange: [0, 1],
      wearRange: [0, 1],
      f0Characteristic: "unknown",
    };
    const roughnessCheck = checkRange("roughness", roughness, spec.roughnessRange, spec.label);
    const metalnessCheck = checkRange("metalness", metalness, spec.metalnessRange, spec.label);
    const wearCheck = checkRange("wear", wear, spec.wearRange, spec.label);
    return {
      category,
      roughnessCheck,
      metalnessCheck,
      wearCheck,
      allPassed: false,
      failures: [`CATEGORY_PARSE_FAIL: ${category.parseError}`],
    };
  }

  const spec = MATERIAL_CATEGORIES[category.categoryId];
  const roughnessCheck = checkRange("roughness", roughness, spec.roughnessRange, spec.label);
  const metalnessCheck = checkRange("metalness", metalness, spec.metalnessRange, spec.label);
  const wearCheck = checkRange("wear", wear, spec.wearRange, spec.label);

  const failures: string[] = [];
  if (!roughnessCheck.passed) failures.push(roughnessCheck.message);
  if (!metalnessCheck.passed) failures.push(metalnessCheck.message);
  if (!wearCheck.passed) failures.push(wearCheck.message);

  return {
    category,
    roughnessCheck,
    metalnessCheck,
    wearCheck,
    allPassed: failures.length === 0,
    failures,
  };
}

// ============================================================================
// 从 ValidatedDesignIR 便捷提取
// ============================================================================

import type { ValidatedDesignIR } from "../../../compiler-core/contracts";

/**
 * 从 ValidatedDesignIR 中提取主导材质参数并验证。
 */
export function validateDominantMaterial(validatedIR: ValidatedDesignIR): MaterialCategoryValidationResult {
  const dominant = validatedIR.validated.materials.find((m) => m.role === "dominant")
    ?? validatedIR.validated.materials[0];

  if (!dominant) {
    return {
      category: parseMaterialCategory(""),
      roughnessCheck: checkRange("roughness", NaN, [0, 1], "NONE"),
      metalnessCheck: checkRange("metalness", NaN, [0, 1], "NONE"),
      wearCheck: checkRange("wear", NaN, [0, 1], "NONE"),
      allPassed: false,
      failures: ["NO_MATERIAL: validatedIR.validated.materials is empty"],
    };
  }

  return validateMaterialCategory(
    dominant.baseType.value,
    dominant.roughness.value,
    dominant.metalness.value,
    dominant.wear.value,
  );
}
