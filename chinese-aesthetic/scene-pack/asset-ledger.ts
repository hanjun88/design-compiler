/**
 * SHA-256 Asset Ledger
 *
 * 资产哈希账本。
 *
 * 核心原则：
 * - 物理资产完整性使用 SHA-256（不使用 FNV-1a）
 * - 每个资产的字节都经过 SHA-256 哈希
 * - 账本根哈希是所有条目按 assetId 排序后的 SHA-256
 * - 资产字节变更必须能被检测到（SHA-256 mismatch）
 *
 * 注意：FNV-1a 只用于计划/配置级别的确定性摘要，
 * 物理资产文件的完整性必须使用 SHA-256。
 */

import { createHash } from "node:crypto";
import type {
  AssetHashLedger,
  AssetHashLedgerEntry,
  CompiledAsset,
  AssetTruthClass,
} from "./types";

// ---------------------------------------------------------------------------
// SHA-256 工具函数
// ---------------------------------------------------------------------------

/**
 * 计算字节数组的 SHA-256 哈希。
 *
 * @param data 字节数据
 * @returns SHA-256 十六进制字符串（64字符）
 */
export function sha256Bytes(data: Uint8Array | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * 计算字符串的 SHA-256 哈希。
 *
 * @param str 输入字符串
 * @returns SHA-256 十六进制字符串
 */
export function sha256String(str: string): string {
  return createHash("sha256").update(str, "utf8").digest("hex");
}

/**
 * 计算对象的确定性 SHA-256 哈希。
 *
 * 使用 JSON.stringify 排序键后计算哈希。
 * 正确处理数组和对象。
 *
 * @param obj 输入对象
 * @returns SHA-256 十六进制字符串
 */
export function sha256Object(obj: unknown): string {
  let canonical: string;
  if (Array.isArray(obj)) {
    // 数组：递归规范化每个元素后序列化
    const normalized = obj.map((item) => {
      if (typeof item === "object" && item !== null) {
        return JSON.parse(sha256Object_normalizeObject(item));
      }
      return item;
    });
    canonical = JSON.stringify(normalized);
  } else if (typeof obj === "object" && obj !== null) {
    canonical = sha256Object_normalizeObject(obj as Record<string, unknown>);
  } else {
    canonical = JSON.stringify(obj);
  }
  return sha256String(canonical);
}

/**
 * 规范化对象（排序键），返回 JSON 字符串。
 */
function sha256Object_normalizeObject(obj: Record<string, unknown>): string {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    const value = obj[key];
    if (Array.isArray(value)) {
      sorted[key] = value.map((item) => {
        if (typeof item === "object" && item !== null) {
          return JSON.parse(sha256Object_normalizeObject(item as Record<string, unknown>));
        }
        return item;
      });
    } else if (typeof value === "object" && value !== null) {
      sorted[key] = JSON.parse(sha256Object_normalizeObject(value as Record<string, unknown>));
    } else {
      sorted[key] = value;
    }
  }
  return JSON.stringify(sorted);
}

// ---------------------------------------------------------------------------
// 账本构建
// ---------------------------------------------------------------------------

export interface LedgerBuilderOptions {
  /** 账本生成时间（用于确定性） */
  generatedAt?: string;
}

/**
 * 从已编译资产生成 SHA-256 资产哈希账本。
 *
 * @param sceneId 场景标识
 * @param assets 已编译资产列表
 * @param options 构建选项
 * @returns AssetHashLedger 资产哈希账本
 */
export function buildAssetHashLedger(
  sceneId: string,
  assets: CompiledAsset[],
  options: LedgerBuilderOptions = {},
): AssetHashLedger {
  const generatedAt = options.generatedAt ?? new Date().toISOString();

  // 只包含已编译成功的资产（BLOCKED/FAILED 的资产不进入账本）
  const compiledAssets = assets.filter((a) => a.status === "COMPILED");

  // 构建条目
  const entries: AssetHashLedgerEntry[] = compiledAssets.map((asset) => ({
    assetId: asset.assetId,
    fileName: asset.fileName,
    sha256: asset.sha256,
    byteSize: asset.byteSize,
    truthClass: asset.truthClass,
    hashedAt: generatedAt,
  }));

  // 按 assetId 确定性排序
  entries.sort((a, b) => a.assetId.localeCompare(b.assetId));

  // 计算账本根哈希（所有条目按 assetId 排序后的 SHA-256）
  const ledgerRootHash = computeLedgerRootHash(entries);

  return {
    ledgerVersion: "1.0.0",
    sceneId,
    generatedAt,
    entries,
    totalAssets: entries.length,
    ledgerRootHash,
  };
}

/**
 * 计算账本根哈希。
 *
 * 根哈希 = SHA-256(所有条目按 assetId 排序后的规范化 JSON)
 *
 * @param entries 账本条目（已排序）
 * @returns SHA-256 十六进制字符串
 */
export function computeLedgerRootHash(entries: AssetHashLedgerEntry[]): string {
  // 规范化：只包含 assetId, sha256, byteSize, truthClass
  const canonical = entries.map((e) => ({
    assetId: e.assetId,
    sha256: e.sha256,
    byteSize: e.byteSize,
    truthClass: e.truthClass,
  }));
  return sha256Object(canonical);
}

// ---------------------------------------------------------------------------
// 账本验证
// ---------------------------------------------------------------------------

export interface LedgerVerificationResult {
  valid: boolean;
  mismatches: Array<{
    assetId: string;
    expectedSha256: string;
    actualSha256: string;
  }>;
  missingAssets: string[];
  extraAssets: string[];
  rootHashValid: boolean;
  expectedRootHash?: string;
  actualRootHash?: string;
}

/**
 * 验证资产哈希账本的完整性。
 *
 * 检查：
 * 1. 账本中的每个资产的 SHA-256 是否与实际资产字节匹配
 * 2. 账本根哈希是否正确
 * 3. 是否有缺失或多余的资产
 *
 * @param ledger 资产哈希账本
 * @param actualAssets 实际资产（包含实际字节的 SHA-256）
 * @returns 验证结果
 */
export function verifyAssetHashLedger(
  ledger: AssetHashLedger,
  actualAssets: Array<{ assetId: string; sha256: string }>,
): LedgerVerificationResult {
  const mismatches: LedgerVerificationResult["mismatches"] = [];
  const missingAssets: string[] = [];
  const extraAssets: string[] = [];

  const actualMap = new Map(actualAssets.map((a) => [a.assetId, a.sha256]));
  const ledgerMap = new Map(ledger.entries.map((e) => [e.assetId, e.sha256]));

  // 检查账本中的每个资产
  for (const entry of ledger.entries) {
    const actualSha256 = actualMap.get(entry.assetId);
    if (actualSha256 === undefined) {
      missingAssets.push(entry.assetId);
    } else if (actualSha256 !== entry.sha256) {
      mismatches.push({
        assetId: entry.assetId,
        expectedSha256: entry.sha256,
        actualSha256,
      });
    }
  }

  // 检查多余的资产
  for (const assetId of actualMap.keys()) {
    if (!ledgerMap.has(assetId)) {
      extraAssets.push(assetId);
    }
  }

  // 验证根哈希
  const actualRootHash = computeLedgerRootHash(ledger.entries);
  const rootHashValid = actualRootHash === ledger.ledgerRootHash;

  return {
    valid: mismatches.length === 0 && missingAssets.length === 0 && extraAssets.length === 0 && rootHashValid,
    mismatches,
    missingAssets,
    extraAssets,
    rootHashValid,
    expectedRootHash: ledger.ledgerRootHash,
    actualRootHash,
  };
}

// ---------------------------------------------------------------------------
// 真实性分类统计
// ---------------------------------------------------------------------------

/**
 * 按真实性分类统计账本中的资产。
 *
 * @param ledger 资产哈希账本
 * @returns 各分类的资产数量
 */
export function countByTruthClass(ledger: AssetHashLedger): Record<AssetTruthClass, number> {
  const counts: Record<AssetTruthClass, number> = {
    SOURCE: 0,
    DERIVED: 0,
    GENERATED: 0,
  };
  for (const entry of ledger.entries) {
    counts[entry.truthClass]++;
  }
  return counts;
}
