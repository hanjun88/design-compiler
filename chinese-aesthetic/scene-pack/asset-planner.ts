/**
 * 4-B.1: Asset Planner
 *
 * 资产规划器：根据 SceneCompilationIR 规划需要生成的资产列表。
 *
 * 核心职责：
 * 1. 识别需要的物理/派生/生成资产
 * 2. 为每个资产分配合适的编译策略（COPY_SOURCE / COMPUTE_DERIVED / GENERATE_SYNTHETIC / BLOCKED）
 * 3. 严格区分 SOURCE / DERIVED / GENERATED 真实性分类
 * 4. 不支持的能力显式 BLOCKED
 *
 * 不包含实际的资产生成逻辑，只做规划。
 */

import type { SceneCompilationIR } from "../scene-contract/types";
import type {
  AssetPlan,
  AssetPlanEntry,
  AssetTruthClass,
  AssetLifecycle,
} from "./types";

// ---------------------------------------------------------------------------
// 确定性哈希（FNV-1a，用于规划摘要）
// ---------------------------------------------------------------------------

function fnv1a32(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function deterministicStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj === "number") {
    return Number.isInteger(obj) ? obj.toString() : obj.toFixed(4);
  }
  if (typeof obj === "boolean" || typeof obj === "string") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map((item) => deterministicStringify(item)).join(",") + "]";
  }
  if (typeof obj === "object") {
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    const pairs = keys.map((k) => `${JSON.stringify(k)}:${deterministicStringify((obj as Record<string, unknown>)[k])}`);
    return "{" + pairs.join(",") + "}";
  }
  return JSON.stringify(obj);
}

// ---------------------------------------------------------------------------
// 标准 8+1 资产清单定义
// ---------------------------------------------------------------------------

interface StandardAssetDefinition {
  assetId: string;
  fileName: string;
  category: string;
  truthClass: AssetTruthClass;
  lifecycle: AssetLifecycle;
  mimeType: string;
  required: boolean;
  compilationStrategy: AssetPlanEntry["compilationStrategy"];
  sourceIRField?: string;
  description: string;
  parallaxLayer?: number;
  expectedBitDepth?: number;
}

/**
 * 标准 8+1 专业场景包资产清单。
 *
 * 8 个视觉资产 + 1 个主清单（scene.json）。
 */
const STANDARD_ASSET_DEFINITIONS: StandardAssetDefinition[] = [
  // 1. 主视觉
  {
    assetId: "asset:scene-primary",
    fileName: "scene.webp",
    category: "PRIMARY_VISUAL",
    truthClass: "SOURCE",
    lifecycle: "PHYSICAL",
    mimeType: "image/webp",
    required: true,
    compilationStrategy: "COPY_SOURCE",
    sourceIRField: "sourceProvenance.validatedDesignIRHash",
    description: "主视觉底板（来自真实输入帧）",
  },
  // 2. 深度图
  {
    assetId: "asset:depth",
    fileName: "depth.webp",
    category: "SPATIAL_GEOMETRY",
    truthClass: "DERIVED",
    lifecycle: "DERIVED",
    mimeType: "image/webp",
    required: true,
    compilationStrategy: "COMPUTE_DERIVED",
    sourceIRField: "spatial.depthLayers",
    description: "空间深度图（16-bit 灰度，从物理证据计算）",
    expectedBitDepth: 16,
  },
  // 3. 水面遮罩
  {
    assetId: "asset:water-mask",
    fileName: "water-mask.webp",
    category: "MATERIAL_MASK",
    truthClass: "DERIVED",
    lifecycle: "DERIVED",
    mimeType: "image/webp",
    required: false,
    compilationStrategy: "COMPUTE_DERIVED",
    sourceIRField: "material.surfaceEntropy",
    description: "水面区域遮罩（8-bit 单通道）",
    expectedBitDepth: 8,
  },
  // 4. 水面法线
  {
    assetId: "asset:water-normal",
    fileName: "water-normal.webp",
    category: "PHYSICAL_NORMAL",
    truthClass: "DERIVED",
    lifecycle: "DERIVED",
    mimeType: "image/webp",
    required: false,
    compilationStrategy: "COMPUTE_DERIVED",
    sourceIRField: "material.specularSharpness",
    description: "水面切线空间法线图（RGB，归一化向量）",
  },
  // 5. 巨构门阙
  {
    assetId: "asset:gate-colossus",
    fileName: "gate-colossus.webp",
    category: "OCCLUSION_SPRITE",
    truthClass: "SOURCE",
    lifecycle: "PHYSICAL",
    mimeType: "image/webp",
    required: false,
    compilationStrategy: "COPY_SOURCE",
    description: "巨构门阙前景遮挡层（RGBA 透明通道）",
  },
  // 6. 左侧翼
  {
    assetId: "asset:gate-left",
    fileName: "gate-left.webp",
    category: "OCCLUSION_SPRITE",
    truthClass: "SOURCE",
    lifecycle: "PHYSICAL",
    mimeType: "image/webp",
    required: false,
    compilationStrategy: "COPY_SOURCE",
    description: "左侧翼前景进深框景（视差层 1）",
    parallaxLayer: 1,
  },
  // 7. 右侧翼
  {
    assetId: "asset:gate-right",
    fileName: "gate-right.webp",
    category: "OCCLUSION_SPRITE",
    truthClass: "SOURCE",
    lifecycle: "PHYSICAL",
    mimeType: "image/webp",
    required: false,
    compilationStrategy: "COPY_SOURCE",
    description: "右侧翼前景进深框景（视差层 1）",
    parallaxLayer: 1,
  },
  // 8. 洞天内景
  {
    assetId: "asset:interior-realm",
    fileName: "interior-realm.webp",
    category: "ATMOSPHERIC_SPRITE",
    truthClass: "SOURCE",
    lifecycle: "PHYSICAL",
    mimeType: "image/webp",
    required: false,
    compilationStrategy: "COPY_SOURCE",
    description: "洞天内景/深层视觉锚点（视差层 3）",
    parallaxLayer: 3,
  },
  // 9. 主清单（scene.json）
  {
    assetId: "asset:scene-manifest",
    fileName: "scene.json",
    category: "MASTER_MANIFEST",
    truthClass: "DERIVED",
    lifecycle: "DERIVED",
    mimeType: "application/json",
    required: true,
    compilationStrategy: "COMPUTE_DERIVED",
    description: "Runtime 驱动核心主档（契约根容器）",
  },
];

// ---------------------------------------------------------------------------
// 资产规划器
// ---------------------------------------------------------------------------

export interface AssetPlannerOptions {
  /** 规划时间（用于确定性，默认使用当前时间） */
  plannedAt?: string;
  /** 目标像素宽度 */
  targetWidth?: number;
  /** 目标像素高度 */
  targetHeight?: number;
  /** 是否允许 GENERATED 类资产（默认 false） */
  allowGeneratedAssets?: boolean;
}

/**
 * 根据 SceneCompilationIR 规划资产列表。
 *
 * @param ir SceneCompilationIR
 * @param options 规划选项
 * @returns AssetPlan 资产规划结果
 */
export function planAssets(
  ir: SceneCompilationIR,
  options: AssetPlannerOptions = {},
): AssetPlan {
  const plannedAt = options.plannedAt ?? new Date().toISOString();
  const targetWidth = options.targetWidth ?? 3840;
  const targetHeight = options.targetHeight ?? 2160;
  const allowGenerated = options.allowGeneratedAssets ?? false;

  const entries: AssetPlanEntry[] = [];
  let sourceCount = 0;
  let derivedCount = 0;
  let generatedCount = 0;
  let blockedCount = 0;
  let requiredCount = 0;

  for (const def of STANDARD_ASSET_DEFINITIONS) {
    const entry: AssetPlanEntry = {
      assetId: def.assetId,
      fileName: def.fileName,
      category: def.category,
      truthClass: def.truthClass,
      lifecycle: def.lifecycle,
      mimeType: def.mimeType,
      required: def.required,
      compilationStrategy: def.compilationStrategy,
      sourceIRField: def.sourceIRField,
      description: def.description,
    };

    // 设置期望尺寸
    if (def.mimeType.startsWith("image/")) {
      entry.expectedDimensions = { width: targetWidth, height: targetHeight };
    }
    if (def.expectedBitDepth) {
      entry.expectedBitDepth = def.expectedBitDepth;
    }
    if (def.parallaxLayer) {
      entry.parallaxLayer = def.parallaxLayer;
    }

    // 能力检查：深度图需要深度缓冲
    if (def.assetId === "asset:depth") {
      const hasDepthEvidence = ir.capabilityBlocks?.some(
        (b) => b.code === "DEPTH_BUFFER_UNAVAILABLE",
      ) !== true;
      if (!hasDepthEvidence) {
        entry.compilationStrategy = "BLOCKED";
        entry.blockedReason = "Depth buffer unavailable — cannot declare PHYSICAL depth asset";
        entry.blockedCode = "DEPTH_BUFFER_UNAVAILABLE";
      }
    }

    // 能力检查：运动相关资产需要运动数据
    if (def.assetId === "asset:water-normal") {
      const hasMotionData = ir.capabilityBlocks?.some(
        (b) => b.code === "MOTION_DATA_UNAVAILABLE",
      ) !== true;
      if (!hasMotionData) {
        entry.compilationStrategy = "BLOCKED";
        entry.blockedReason = "Motion data unavailable — cannot compute water normal";
        entry.blockedCode = "MOTION_DATA_UNAVAILABLE";
      }
    }

    // GENERATED 资产检查
    if (entry.compilationStrategy === "GENERATE_SYNTHETIC" && !allowGenerated) {
      entry.compilationStrategy = "BLOCKED";
      entry.blockedReason = "Generated assets not allowed — set allowGeneratedAssets=true to enable";
      entry.blockedCode = "UNSUPPORTED_ASSET_TYPE";
    }

    // 统计
    if (entry.compilationStrategy === "BLOCKED") {
      blockedCount++;
    } else {
      switch (entry.truthClass) {
        case "SOURCE":
          sourceCount++;
          break;
        case "DERIVED":
          derivedCount++;
          break;
        case "GENERATED":
          generatedCount++;
          break;
      }
    }
    if (entry.required) {
      requiredCount++;
    }

    entries.push(entry);
  }

  // 按 assetId 确定性排序
  entries.sort((a, b) => a.assetId.localeCompare(b.assetId));

  // 构建规划结果（不含 planDigest）
  const plan: Omit<AssetPlan, "planDigest"> = {
    planVersion: "1.0.0",
    sceneId: ir.sceneId,
    sourceIRDigest: ir.deterministicDigest,
    plannedAt,
    entries,
    totalAssets: entries.length,
    sourceAssetCount: sourceCount,
    derivedAssetCount: derivedCount,
    generatedAssetCount: generatedCount,
    blockedAssetCount: blockedCount,
    requiredAssetCount: requiredCount,
  };

  // 计算确定性摘要
  const planDigest = `fnv1a:${fnv1a32(deterministicStringify(plan))}`;

  return {
    ...plan,
    planDigest,
  };
}

// ---------------------------------------------------------------------------
// 导出
// ---------------------------------------------------------------------------

export { STANDARD_ASSET_DEFINITIONS };
