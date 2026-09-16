/**
 * Phase 4-C: Machine Provenance Evidence Generator
 *
 * 机器溯源证据生成器。
 *
 * 生成 evidence/machine-provenance.json，包含：
 * - 输入 IR 摘要
 * - 资产 SHA-256 散列树
 * - 编译参数矩阵
 * - ScenePackDigest 物理链
 * - 自校验哈希
 */

import type { ProfessionalScenePack } from "../types";
import type { CompiledAsset } from "../types";
import { sha256Bytes, sha256Object, sha256String } from "../asset-ledger";
import type {
  MachineProvenanceEvidence,
  MachineAssetProvenanceEntry,
  CompilationParameterMatrix,
} from "./types";

// ---------------------------------------------------------------------------
// 资产散列树构建
// ---------------------------------------------------------------------------

/**
 * 构建资产散列树。
 *
 * 根哈希 = SHA-256(所有资产 sha256 按 assetId 排序后拼接)
 */
function buildAssetHashTree(
  assets: CompiledAsset[],
): { rootHash: string; entries: MachineAssetProvenanceEntry[] } {
  const compiledAssets = assets.filter((a) => a.status === "COMPILED");

  const entries: MachineAssetProvenanceEntry[] = compiledAssets.map((asset) => {
    const entry: MachineAssetProvenanceEntry = {
      assetId: asset.assetId,
      fileName: asset.fileName,
      truthClass: asset.truthClass,
      sha256: asset.sha256,
      byteSize: asset.byteSize,
      compilationStrategy: asset.sourcePlanEntry.compilationStrategy,
    };

    if (asset.sourcePlanEntry.sourceIRField) {
      entry.sourceIRField = asset.sourcePlanEntry.sourceIRField;
    }

    // DERIVED 资产记录派生算法
    if (asset.truthClass === "DERIVED" && asset.sourcePlanEntry.compilationStrategy === "COMPUTE_DERIVED") {
      const algoMap: Record<string, string> = {
        "asset:depth": "luminance-invert-gaussian-depth",
        "asset:water-mask": "blue-channel-threshold-mask",
        "asset:water-normal": "heightfield-tangent-normal",
        "asset:scene-manifest": "scene-manifest-json",
      };
      entry.derivationAlgorithm = algoMap[asset.assetId] ?? "unknown";
      entry.inputAssetHashes = ["scene.webp"];
    }

    return entry;
  });

  // 按 assetId 排序
  entries.sort((a, b) => a.assetId.localeCompare(b.assetId));

  // 计算根哈希
  const concatenated = entries.map((e) => e.sha256).join("");
  const rootHash = sha256String(concatenated);

  return { rootHash, entries };
}

// ---------------------------------------------------------------------------
// 编译参数矩阵构建
// ---------------------------------------------------------------------------

function buildCompilationParams(
  pack: ProfessionalScenePack,
  compilerId: string,
): CompilationParameterMatrix {
  const perAssetParams: Record<string, Record<string, unknown>> = {};

  for (const asset of pack.compiledAssets.assets) {
    if (asset.status !== "COMPILED") continue;
    const params: Record<string, unknown> = {
      strategy: asset.sourcePlanEntry.compilationStrategy,
      mimeType: asset.mimeType,
    };
    if (asset.dimensions) {
      params.dimensions = asset.dimensions;
    }
    if (asset.bitDepth) {
      params.bitDepth = asset.bitDepth;
    }
    perAssetParams[asset.assetId] = params;
  }

  return {
    targetWidth: pack.assetPlan.entries[0]?.expectedDimensions?.width ?? 1920,
    targetHeight: pack.assetPlan.entries[0]?.expectedDimensions?.height ?? 1080,
    compilerId,
    compilerVersion: pack.compilerVersion,
    compiledAt: pack.compiledAssets.compiledAt,
    perAssetParams,
  };
}

// ---------------------------------------------------------------------------
// 机器证据生成
// ---------------------------------------------------------------------------

export interface MachineProvenanceOptions {
  /** 编译器标识 */
  compilerId?: string;
  /** 生成时间（确定性） */
  generatedAt?: string;
}

/**
 * 从 ProfessionalScenePack 生成机器溯源证据。
 *
 * @param pack 专业场景包
 * @param options 选项
 * @returns MachineProvenanceEvidence 机器溯源证据
 */
export function generateMachineProvenance(
  pack: ProfessionalScenePack,
  options: MachineProvenanceOptions = {},
): MachineProvenanceEvidence {
  const generatedAt = options.generatedAt ?? pack.generatedAt;
  const compilerId = options.compilerId ?? "standard-asset-compiler@1.0.0";

  const assetHashTree = buildAssetHashTree(pack.compiledAssets.assets);
  const compilationParams = buildCompilationParams(pack, compilerId);

  const evidence: Omit<MachineProvenanceEvidence, "selfHash"> = {
    evidenceVersion: "1.0.0",
    evidenceType: "MACHINE_PROVENANCE",
    sceneId: pack.sceneId,
    inputIRDigest: pack.sourceProvenance.sceneIRDigest,
    inputProvenance: {
      validatedDesignIRHash: pack.sourceProvenance.validatedDesignIRHash,
      aestheticExecutionPlanHash: pack.sourceProvenance.aestheticExecutionPlanHash,
      aestheticRuntimePlanHash: pack.sourceProvenance.aestheticRuntimePlanHash,
    },
    assetHashTree,
    compilationParams,
    scenePackDigest: pack.packDigest,
    generatedAt,
  };

  // 自校验哈希
  const selfHash = `sha256:${sha256Object(evidence)}`;

  return {
    ...evidence,
    selfHash,
  };
}

/**
 * 验证机器证据的自洽性。
 *
 * 检查：
 * 1. selfHash 是否正确
 * 2. 资产散列树根哈希是否正确
 * 3. scenePackDigest 是否与输入 pack 匹配
 */
export function verifyMachineProvenance(
  evidence: MachineProvenanceEvidence,
  pack?: ProfessionalScenePack,
): { valid: boolean; violations: Array<{ code: string; message: string; path: string }> } {
  const violations: Array<{ code: string; message: string; path: string }> = [];

  // 1. 验证 selfHash
  const { selfHash, ...rest } = evidence;
  const expectedSelfHash = `sha256:${sha256Object(rest)}`;
  if (selfHash !== expectedSelfHash) {
    violations.push({
      code: "SELF_HASH_MISMATCH",
      message: `Machine evidence selfHash mismatch: expected ${expectedSelfHash}, got ${selfHash}`,
      path: "$.selfHash",
    });
  }

  // 2. 验证资产散列树根哈希
  const concatenated = evidence.assetHashTree.entries
    .sort((a, b) => a.assetId.localeCompare(b.assetId))
    .map((e) => e.sha256)
    .join("");
  const expectedRootHash = sha256String(concatenated);
  if (evidence.assetHashTree.rootHash !== expectedRootHash) {
    violations.push({
      code: "HASH_TREE_ROOT_MISMATCH",
      message: `Asset hash tree root mismatch: expected ${expectedRootHash}, got ${evidence.assetHashTree.rootHash}`,
      path: "$.assetHashTree.rootHash",
    });
  }

  // 3. 验证与 pack 的一致性（如果提供）
  if (pack) {
    if (evidence.scenePackDigest !== pack.packDigest) {
      violations.push({
        code: "SCENE_PACK_DIGEST_MISMATCH",
        message: `scenePackDigest mismatch: evidence has ${evidence.scenePackDigest}, pack has ${pack.packDigest}`,
        path: "$.scenePackDigest",
      });
    }
    if (evidence.sceneId !== pack.sceneId) {
      violations.push({
        code: "SCENE_ID_MISMATCH",
        message: `sceneId mismatch: evidence has ${evidence.sceneId}, pack has ${pack.sceneId}`,
        path: "$.sceneId",
      });
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
