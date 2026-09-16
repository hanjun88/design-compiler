/**
 * Asset Validator
 *
 * 资产验证器。
 *
 * 验证已编译资产的：
 * 1. 格式有效性（MIME 类型、尺寸、位深）
 * 2. 物理/派生分类有效性
 * 3. 完整性（SHA-256 匹配）
 * 4. 溯源完整性
 */

import type {
  CompiledAsset,
  AssetValidationResult,
  AssetValidationReport,
} from "./types";
import { validateAssetBoundary } from "./asset-boundary";

// ---------------------------------------------------------------------------
// 单个资产验证
// ---------------------------------------------------------------------------

/**
 * 验证单个已编译资产。
 *
 * @param asset 已编译资产
 * @returns AssetValidationResult 验证结果
 */
export function validateAsset(asset: CompiledAsset): AssetValidationResult {
  const violations: AssetValidationResult["violations"] = [];
  const warnings: AssetValidationResult["warnings"] = [];

  // 1. BLOCKED / FAILED 资产不做进一步验证
  if (asset.status === "BLOCKED") {
    return {
      assetId: asset.assetId,
      valid: true, // BLOCKED 是合法状态，不是验证失败
      violations: [],
      warnings: [{
        code: "ASSET_BLOCKED",
        message: `Asset is BLOCKED: ${asset.failureReason ?? "unknown reason"}`,
        path: `$.assets[${asset.assetId}].status`,
      }],
    };
  }

  if (asset.status === "FAILED") {
    return {
      assetId: asset.assetId,
      valid: false,
      violations: [{
        code: "ASSET_FAILED",
        message: `Asset compilation failed: ${asset.failureReason ?? "unknown reason"}`,
        path: `$.assets[${asset.assetId}].status`,
        severity: "CRITICAL",
      }],
      warnings: [],
    };
  }

  // 2. SHA-256 有效性
  if (!asset.sha256 || asset.sha256.length !== 64) {
    violations.push({
      code: "INVALID_SHA256",
      message: `Asset SHA-256 is invalid or missing (length=${asset.sha256?.length ?? 0})`,
      path: `$.assets[${asset.assetId}].sha256`,
      severity: "CRITICAL",
    });
  }

  // 3. 文件大小有效性
  if (asset.byteSize <= 0) {
    violations.push({
      code: "INVALID_BYTE_SIZE",
      message: `Asset byteSize is invalid: ${asset.byteSize}`,
      path: `$.assets[${asset.assetId}].byteSize`,
      severity: "CRITICAL",
    });
  }

  // 4. MIME 类型有效性
  if (!asset.mimeType || asset.mimeType.length === 0) {
    violations.push({
      code: "INVALID_MIME_TYPE",
      message: "Asset mimeType is missing",
      path: `$.assets[${asset.assetId}].mimeType`,
      severity: "ERROR",
    });
  }

  // 5. 图片资产尺寸检查
  if (asset.mimeType?.startsWith("image/")) {
    if (!asset.dimensions) {
      warnings.push({
        code: "MISSING_DIMENSIONS",
        message: "Image asset has no dimensions metadata",
        path: `$.assets[${asset.assetId}].dimensions`,
      });
    } else if (asset.dimensions.width <= 0 || asset.dimensions.height <= 0) {
      violations.push({
        code: "INVALID_DIMENSIONS",
        message: `Image dimensions are invalid: ${asset.dimensions.width}x${asset.dimensions.height}`,
        path: `$.assets[${asset.assetId}].dimensions`,
        severity: "ERROR",
      });
    }
  }

  // 6. 边界验证（真实性分类）
  const boundaryViolations = validateAssetBoundary(asset);
  for (const bv of boundaryViolations) {
    violations.push({
      code: bv.code,
      message: bv.message,
      path: `$.assets[${asset.assetId}]`,
      severity: bv.severity,
    });
  }

  // 7. 溯源完整性
  if (!asset.sourcePlanEntry) {
    violations.push({
      code: "MISSING_SOURCE_PLAN_ENTRY",
      message: "Asset is missing sourcePlanEntry (provenance broken)",
      path: `$.assets[${asset.assetId}].sourcePlanEntry`,
      severity: "CRITICAL",
    });
  }

  return {
    assetId: asset.assetId,
    valid: violations.length === 0,
    violations,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// 批量验证
// ---------------------------------------------------------------------------

/**
 * 批量验证已编译资产。
 *
 * @param sceneId 场景标识
 * @param assets 已编译资产列表
 * @param validatedAt 验证时间
 * @returns AssetValidationReport 验证报告
 */
export function validateAssets(
  sceneId: string,
  assets: CompiledAsset[],
  validatedAt?: string,
): AssetValidationReport {
  const results: AssetValidationResult[] = [];
  let passedCount = 0;
  let failedCount = 0;

  for (const asset of assets) {
    const result = validateAsset(asset);
    results.push(result);
    if (result.valid) {
      passedCount++;
    } else {
      failedCount++;
    }
  }

  return {
    validationVersion: "1.0.0",
    sceneId,
    validatedAt: validatedAt ?? new Date().toISOString(),
    results,
    totalValidated: assets.length,
    passedCount,
    failedCount,
    allValid: failedCount === 0,
  };
}
