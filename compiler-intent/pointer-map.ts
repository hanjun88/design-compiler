/**
 * compiler-intent/pointer-map.ts
 *
 * 基于物理读取的 contracts.ts RawDesignIR 结构生成的路径映射表。
 *
 * 严格对齐 ABI 1.0.0 Core IR 的实际字段、类型和 required 结构。
 * 不得按示例假定字段存在 — 所有路径均来自 contracts.ts 的真实类型定义。
 *
 * 用途：
 * 1. Intent Normalizer 将 Cangjie 层扁平 parameters[] 按 path 组装为 Core IR 嵌套结构
 * 2. 指针物理校验：验证 Cangjie 参数的 path 是否指向 Core IR 中真实存在的字段
 * 3. 提供每个路径的默认值、单位、来源和状态
 */

import type { ParameterUnit, RawParameterStatus } from "../compiler-core/contracts";

// ============================================================================
// 路径映射条目类型
// ============================================================================

export type CoreIRValueType = "number" | "string" | "boolean" | "number-array";

export interface PointerMapEntry {
  /** Core IR 中的 JSON Pointer 路径 */
  path: string;
  /** 值类型，用于校验 Cangjie 参数 value 的类型 */
  valueType: CoreIRValueType;
  /** 默认单位（ParameterUnit 枚举） */
  defaultUnit: ParameterUnit;
  /** 默认来源（RawEstimatedParameter.source 枚举） */
  defaultSource: "vision-estimation" | "depth-estimator" | "optical-flow" | "fallback-default";
  /** 默认参数状态 */
  defaultStatus: RawParameterStatus;
  /** 是否为 G1 Data Gate 的必选路径（缺失会触发 BLOCKED_DATA） */
  required: boolean;
  /** 分类，用于 ScoringEngine 权重计算 */
  category: "composition" | "camera" | "lighting" | "materials" | "color";
  /** 描述 */
  description: string;
}

// ============================================================================
// 路径映射表 — 严格对齐 contracts.ts RawDesignIR
// ============================================================================

/**
 * Core IR 所有合法参数路径的映射表。
 *
 * 生成依据：contracts.ts RawDesignIR 接口的物理类型定义。
 * 包含 composition / camera / lighting / materials / color 五个分类的全部参数字段。
 *
 * 注意：materials 为数组，此处以 /materials/0/... 为模板定义，
 * 实际运行时支持任意索引（/materials/0/..., /materials/1/... 等）。
 */
export const POINTER_MAP: readonly PointerMapEntry[] = [
  // ── composition ──────────────────────────────────────────────────────
  {
    path: "/composition/focalPoint",
    valueType: "number-array",
    defaultUnit: "vector2",
    defaultSource: "vision-estimation",
    defaultStatus: "observed",
    required: true,
    category: "composition",
    description: "构图焦点坐标 [x, y]，归一化 0-1",
  },
  {
    path: "/composition/negativeSpaceRatio",
    valueType: "number",
    defaultUnit: "ratio",
    defaultSource: "vision-estimation",
    defaultStatus: "estimated",
    required: true,
    category: "composition",
    description: "负空间（留白）比例，0-1",
  },
  {
    path: "/composition/depthLayerCount",
    valueType: "number",
    defaultUnit: "scalar",
    defaultSource: "depth-estimator",
    defaultStatus: "estimated",
    required: true,
    category: "composition",
    description: "空间深度层次数量",
  },
  {
    path: "/composition/symmetry",
    valueType: "number",
    defaultUnit: "normalized",
    defaultSource: "vision-estimation",
    defaultStatus: "estimated",
    required: false,
    category: "composition",
    description: "中轴对称度，0-1",
  },

  // ── camera ───────────────────────────────────────────────────────────
  {
    path: "/camera/fov",
    valueType: "number",
    defaultUnit: "degrees",
    defaultSource: "vision-estimation",
    defaultStatus: "estimated",
    required: true,
    category: "camera",
    description: "视场角（度）",
  },
  {
    path: "/camera/shotSize",
    valueType: "string",
    defaultUnit: "scalar",
    defaultSource: "vision-estimation",
    defaultStatus: "observed",
    required: true,
    category: "camera",
    description: "景别（long-shot / medium-shot / close-up 等）",
  },
  {
    path: "/camera/angle",
    valueType: "number",
    defaultUnit: "degrees",
    defaultSource: "vision-estimation",
    defaultStatus: "estimated",
    required: false,
    category: "camera",
    description: "相机俯仰角（度），0=水平",
  },
  {
    path: "/camera/height",
    valueType: "number",
    defaultUnit: "scalar",
    defaultSource: "vision-estimation",
    defaultStatus: "estimated",
    required: false,
    category: "camera",
    description: "相机高度（米）",
  },

  // ── lighting / keyLight ──────────────────────────────────────────────
  {
    path: "/lighting/keyLight/azimuth",
    valueType: "number",
    defaultUnit: "degrees",
    defaultSource: "vision-estimation",
    defaultStatus: "estimated",
    required: true,
    category: "lighting",
    description: "主光方位角（度），0=正前方",
  },
  {
    path: "/lighting/keyLight/elevation",
    valueType: "number",
    defaultUnit: "degrees",
    defaultSource: "vision-estimation",
    defaultStatus: "estimated",
    required: true,
    category: "lighting",
    description: "主光高度角（度），0=水平，90=正上方",
  },
  {
    path: "/lighting/keyLight/colorTemp",
    valueType: "number",
    defaultUnit: "kelvin",
    defaultSource: "vision-estimation",
    defaultStatus: "estimated",
    required: true,
    category: "lighting",
    description: "主光色温（开尔文）",
  },
  {
    path: "/lighting/keyLight/intensity",
    valueType: "number",
    defaultUnit: "scalar",
    defaultSource: "vision-estimation",
    defaultStatus: "estimated",
    required: true,
    category: "lighting",
    description: "主光强度",
  },
  {
    path: "/lighting/keyLight/softness",
    valueType: "number",
    defaultUnit: "normalized",
    defaultSource: "vision-estimation",
    defaultStatus: "estimated",
    required: false,
    category: "lighting",
    description: "主光柔和度，0=硬光，1=极软",
  },
  {
    path: "/lighting/ambientRatio",
    valueType: "number",
    defaultUnit: "ratio",
    defaultSource: "vision-estimation",
    defaultStatus: "estimated",
    required: true,
    category: "lighting",
    description: "环境光比例，0-1",
  },
  {
    path: "/lighting/rimLightPresent",
    valueType: "boolean",
    defaultUnit: "scalar",
    defaultSource: "vision-estimation",
    defaultStatus: "observed",
    required: false,
    category: "lighting",
    description: "是否存在轮廓光",
  },

  // ── materials（以 /materials/0/ 为模板）──────────────────────────────
  {
    path: "/materials/0/baseType",
    valueType: "string",
    defaultUnit: "scalar",
    defaultSource: "vision-estimation",
    defaultStatus: "observed",
    required: true,
    category: "materials",
    description: "材质基础类型（stone / wood / metal / fabric 等）",
  },
  {
    path: "/materials/0/roughness",
    valueType: "number",
    defaultUnit: "normalized",
    defaultSource: "vision-estimation",
    defaultStatus: "estimated",
    required: true,
    category: "materials",
    description: "粗糙度，0=镜面，1=完全漫反射",
  },
  {
    path: "/materials/0/metalness",
    valueType: "number",
    defaultUnit: "normalized",
    defaultSource: "vision-estimation",
    defaultStatus: "estimated",
    required: true,
    category: "materials",
    description: "金属度，0=非金属，1=纯金属",
  },
  {
    path: "/materials/0/wear",
    valueType: "number",
    defaultUnit: "normalized",
    defaultSource: "vision-estimation",
    defaultStatus: "estimated",
    required: false,
    category: "materials",
    description: "磨损程度，0=全新，1=严重磨损",
  },

  // ── color ────────────────────────────────────────────────────────────
  {
    path: "/color/dominant",
    valueType: "string",
    defaultUnit: "hex",
    defaultSource: "vision-estimation",
    defaultStatus: "observed",
    required: true,
    category: "color",
    description: "主导色（hex 格式，如 #2b2b2b）",
  },
  {
    path: "/color/secondary",
    valueType: "string",
    defaultUnit: "hex",
    defaultSource: "vision-estimation",
    defaultStatus: "observed",
    required: true,
    category: "color",
    description: "辅助色（hex 格式）",
  },
  {
    path: "/color/accent",
    valueType: "string",
    defaultUnit: "hex",
    defaultSource: "vision-estimation",
    defaultStatus: "observed",
    required: false,
    category: "color",
    description: "点缀色（hex 格式）",
  },
  {
    path: "/color/contrastRatio",
    valueType: "number",
    defaultUnit: "ratio",
    defaultSource: "fallback-default",
    defaultStatus: "derived",
    required: true,
    category: "color",
    description: "对比度（WCAG 公式计算）",
  },
  {
    path: "/color/temperatureBias",
    valueType: "number",
    defaultUnit: "normalized",
    defaultSource: "vision-estimation",
    defaultStatus: "estimated",
    required: false,
    category: "color",
    description: "色温偏移，-1=极冷，1=极暖，0=中性",
  },
];

// ============================================================================
// 路径查找索引
// ============================================================================

/** 路径 → 映射条目的快速查找 Map */
const POINTER_LOOKUP: Map<string, PointerMapEntry> = new Map(
  POINTER_MAP.map((entry) => [entry.path, entry]),
);

/**
 * 规范化 materials 数组路径：将 /materials/N/xxx 归一化为 /materials/0/xxx
 * 用于匹配 POINTER_MAP 中的模板条目。
 */
function normalizeMaterialsPath(path: string): string {
  return path.replace(/^\/materials\/\d+\//, "/materials/0/");
}

/**
 * 查找路径对应的映射条目。
 * 支持 materials 数组的任意索引（自动归一化为模板 /materials/0/）。
 *
 * @param path Core IR 中的 JSON Pointer 路径
 * @returns 映射条目，若路径不存在则返回 undefined
 */
export function lookupPointer(path: string): PointerMapEntry | undefined {
  // 直接查找
  const direct = POINTER_LOOKUP.get(path);
  if (direct) return direct;

  // materials 数组路径归一化后查找
  if (path.startsWith("/materials/")) {
    const normalized = normalizeMaterialsPath(path);
    return POINTER_LOOKUP.get(normalized);
  }

  return undefined;
}

/**
 * 验证路径是否指向 Core IR 中真实存在的参数字段。
 *
 * @param path 待验证的 JSON Pointer 路径
 * @returns true 表示路径合法，false 表示路径不存在
 */
export function isValidPointer(path: string): boolean {
  return lookupPointer(path) !== undefined;
}

/**
 * 获取所有必选路径（G1 Data Gate requiredPaths）。
 * 这些路径缺失会触发 BLOCKED_DATA。
 *
 * @returns 必选路径列表
 */
export function getRequiredPaths(): string[] {
  return POINTER_MAP.filter((e) => e.required).map((e) => e.path);
}

/**
 * 获取所有合法路径列表（用于校验和测试）。
 *
 * @returns 所有合法路径
 */
export function getAllPaths(): string[] {
  return POINTER_MAP.map((e) => e.path);
}

/**
 * 校验 Cangjie 参数值的类型是否与 Core IR 目标路径的期望类型匹配。
 *
 * @param value Cangjie 参数值
 * @param expectedType 期望的值类型
 * @returns true 表示类型匹配
 */
export function validateValueType(value: unknown, expectedType: CoreIRValueType): boolean {
  switch (expectedType) {
    case "number":
      return typeof value === "number" && !Number.isNaN(value);
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    case "number-array":
      return Array.isArray(value) && value.every((v) => typeof v === "number" && !Number.isNaN(v));
    default:
      return false;
  }
}
