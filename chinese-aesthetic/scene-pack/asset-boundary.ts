/**
 * Asset Boundary Guard
 *
 * 物理/派生资产边界守卫。
 *
 * 核心原则（Asset Truth Boundary）：
 * - SOURCE: 来自真实输入的物理原始资产
 * - DERIVED: 由编译阶段从 SOURCE 计算/派生的资产
 * - GENERATED: 由编译器生成的合成资产
 *
 * 严禁将 GENERATED 标记为 SOURCE 或 DERIVED。
 * 严禁将 DERIVED 标记为 SOURCE。
 *
 * 这个守卫确保资产真实性分类的正确性，防止"伪物理资产"污染证据链。
 */

import type {
  AssetTruthClass,
  AssetLifecycle,
  CompiledAsset,
  AssetPlanEntry,
} from "./types";

// ---------------------------------------------------------------------------
// 真实性分类 → 生命周期类型映射
// ---------------------------------------------------------------------------

/**
 * 真实性分类到生命周期类型的映射。
 *
 * - SOURCE → PHYSICAL
 * - DERIVED → DERIVED
 * - GENERATED → DERIVED（生成资产也属于派生类，但需要额外标记）
 */
export const TRUTH_CLASS_TO_LIFECYCLE: Record<AssetTruthClass, AssetLifecycle> = {
  SOURCE: "PHYSICAL",
  DERIVED: "DERIVED",
  GENERATED: "DERIVED",
};

// ---------------------------------------------------------------------------
// 编译策略 → 真实性分类映射
// ---------------------------------------------------------------------------

/**
 * 编译策略到真实性分类的映射。
 *
 * - COPY_SOURCE → SOURCE（直接复制源资产）
 * - COMPUTE_DERIVED → DERIVED（从源资产计算派生）
 * - GENERATE_SYNTHETIC → GENERATED（合成生成）
 * - BLOCKED → 不适用
 */
export const COMPILATION_STRATEGY_TO_TRUTH_CLASS: Record<
  AssetPlanEntry["compilationStrategy"],
  AssetTruthClass | null
> = {
  COPY_SOURCE: "SOURCE",
  COMPUTE_DERIVED: "DERIVED",
  GENERATE_SYNTHETIC: "GENERATED",
  BLOCKED: null,
};

// ---------------------------------------------------------------------------
// 边界违规类型
// ---------------------------------------------------------------------------

export type BoundaryViolationCode =
  | "TRUTH_CLASS_MISMATCH"        // 真实性分类不匹配
  | "LIFECYCLE_MISMATCH"          // 生命周期类型不匹配
  | "GENERATED_MARKED_AS_SOURCE"  // GENERATED 被标记为 SOURCE
  | "GENERATED_MARKED_AS_DERIVED" // GENERATED 被标记为 DERIVED（无 GENERATED 标记）
  | "DERIVED_MARKED_AS_SOURCE"    // DERIVED 被标记为 SOURCE
  | "MISSING_SOURCE_EVIDENCE"     // SOURCE 资产缺少来源证据
  | "MISSING_DERIVATION_METHOD";  // DERIVED 资产缺少派生方法

export interface BoundaryViolation {
  code: BoundaryViolationCode;
  message: string;
  assetId: string;
  severity: "ERROR" | "CRITICAL";
}

export interface BoundaryValidationResult {
  valid: boolean;
  violations: BoundaryViolation[];
  warnings: Array<{ code: string; message: string; assetId: string }>;
}

// ---------------------------------------------------------------------------
// 边界守卫
// ---------------------------------------------------------------------------

/**
 * 验证单个资产的真实性分类边界。
 *
 * @param asset 已编译资产
 * @returns 违规列表（空表示通过）
 */
export function validateAssetBoundary(asset: CompiledAsset): BoundaryViolation[] {
  const violations: BoundaryViolation[] = [];

  // 1. 检查真实性分类与生命周期类型的一致性
  const expectedLifecycle = TRUTH_CLASS_TO_LIFECYCLE[asset.truthClass];
  if (asset.lifecycle !== expectedLifecycle) {
    violations.push({
      code: "LIFECYCLE_MISMATCH",
      message: `Asset ${asset.assetId}: truthClass=${asset.truthClass} expects lifecycle=${expectedLifecycle}, got ${asset.lifecycle}`,
      assetId: asset.assetId,
      severity: "CRITICAL",
    });
  }

  // 2. 检查编译策略与真实性分类的一致性
  const expectedTruthClass = COMPILATION_STRATEGY_TO_TRUTH_CLASS[
    asset.sourcePlanEntry.compilationStrategy
  ];
  if (expectedTruthClass && asset.truthClass !== expectedTruthClass) {
    violations.push({
      code: "TRUTH_CLASS_MISMATCH",
      message: `Asset ${asset.assetId}: compilationStrategy=${asset.sourcePlanEntry.compilationStrategy} expects truthClass=${expectedTruthClass}, got ${asset.truthClass}`,
      assetId: asset.assetId,
      severity: "CRITICAL",
    });
  }

  // 3. 检查 GENERATED 资产是否被错误标记
  if (asset.sourcePlanEntry.compilationStrategy === "GENERATE_SYNTHETIC") {
    if (asset.truthClass === "SOURCE") {
      violations.push({
        code: "GENERATED_MARKED_AS_SOURCE",
        message: `Asset ${asset.assetId}: GENERATED asset must not be marked as SOURCE`,
        assetId: asset.assetId,
        severity: "CRITICAL",
      });
    }
  }

  // 4. 检查 DERIVED 资产是否被标记为 SOURCE
  if (asset.sourcePlanEntry.compilationStrategy === "COMPUTE_DERIVED" && asset.truthClass === "SOURCE") {
    violations.push({
      code: "DERIVED_MARKED_AS_SOURCE",
      message: `Asset ${asset.assetId}: DERIVED asset must not be marked as SOURCE`,
      assetId: asset.assetId,
      severity: "CRITICAL",
    });
  }

  // 5. 检查 SOURCE 资产是否有来源证据
  if (asset.truthClass === "SOURCE" && asset.status === "COMPILED") {
    if (!asset.sourcePlanEntry.sourceIRField && !asset.sourcePlanEntry.description) {
      violations.push({
        code: "MISSING_SOURCE_EVIDENCE",
        message: `Asset ${asset.assetId}: SOURCE asset must have source evidence (sourceIRField or description)`,
        assetId: asset.assetId,
        severity: "ERROR",
      });
    }
  }

  return violations;
}

/**
 * 批量验证资产边界。
 *
 * @param assets 已编译资产列表
 * @returns 边界验证结果
 */
export function validateAssetBoundaries(assets: CompiledAsset[]): BoundaryValidationResult {
  const allViolations: BoundaryViolation[] = [];
  const warnings: Array<{ code: string; message: string; assetId: string }> = [];

  for (const asset of assets) {
    const violations = validateAssetBoundary(asset);
    allViolations.push(...violations);

    // 警告：BLOCKED 资产
    if (asset.status === "BLOCKED") {
      warnings.push({
        code: "ASSET_BLOCKED",
        message: `Asset ${asset.assetId} is BLOCKED: ${asset.failureReason ?? "unknown reason"}`,
        assetId: asset.assetId,
      });
    }

    // 警告：GENERATED 资产
    if (asset.truthClass === "GENERATED") {
      warnings.push({
        code: "GENERATED_ASSET",
        message: `Asset ${asset.assetId} is GENERATED — not a physical or derived asset`,
        assetId: asset.assetId,
      });
    }
  }

  return {
    valid: allViolations.length === 0,
    violations: allViolations,
    warnings,
  };
}

/**
 * 断言资产真实性分类的正确性（用于编译时守卫）。
 *
 * 如果发现违规，抛出错误。
 *
 * @param asset 已编译资产
 * @throws 如果发现边界违规
 */
export function assertAssetBoundary(asset: CompiledAsset): void {
  const violations = validateAssetBoundary(asset);
  if (violations.length > 0) {
    const critical = violations.find((v) => v.severity === "CRITICAL");
    if (critical) {
      throw new Error(`Asset boundary violation (CRITICAL): ${critical.message}`);
    }
    throw new Error(`Asset boundary violation: ${violations.map((v) => v.message).join("; ")}`);
  }
}
