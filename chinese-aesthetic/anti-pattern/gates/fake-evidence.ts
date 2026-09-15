/**
 * ANTI-06: Fake Evidence / Default Injection — 伪证据与默认值注入
 *
 * 最高优先级门禁。遍历证据集，检测是否存在：
 * - 静态硬编码的浮点常数回退（如 ?? 0.7）
 * - 未测深度强行推断值
 * - IR 声明值冒充渲染观测值
 * - confidence=1 但缺乏证据支撑
 *
 * 一旦触发，直接判定底层证据链污染，无条件 HARD_REJECT。
 *
 * 宪法约束：
 * - 本门禁是元审计（meta-audit），不依赖具体视觉测度
 * - 若 purityAudit 自身缺失，返回 FLAG 而非 REJECT
 */

import type { AntiPatternResult, GateContext } from "../types";
import type { ObservableEvidenceSet } from "../../extraction/types";

export const GATE_ID = "ANTI-06";
export const GATE_NAME = "Fake Evidence / Default Injection";

export function detectFakeEvidence(ctx: GateContext): AntiPatternResult {
  const { evidence } = ctx;
  const evidenceRefs: string[] = [];
  const metrics: Record<string, number | string | boolean> = {};

  // 1. 检查 purityAudit 中的硬编码常数
  const hardcoded = evidence.purityAudit?.hardcodedConstantsFound ?? [];
  metrics.hardcodedConstantsCount = hardcoded.length;
  if (hardcoded.length > 0) {
    evidenceRefs.push(`purity-audit:hardcoded-constants:count=${hardcoded.length}`);
    for (const c of hardcoded.slice(0, 5)) {
      evidenceRefs.push(`purity-audit:hardcoded:${c}`);
    }
  }

  // 2. 检查缺失 evidenceRef 的字段
  const missingRefs = evidence.purityAudit?.fieldsMissingEvidenceRef ?? [];
  metrics.fieldsMissingEvidenceRef = missingRefs.length;
  if (missingRefs.length > 0) {
    evidenceRefs.push(`purity-audit:missing-evidence-ref:count=${missingRefs.length}`);
  }

  // 3. 检查缺失 confidence 的字段
  const missingConf = evidence.purityAudit?.fieldsMissingConfidence ?? [];
  metrics.fieldsMissingConfidence = missingConf.length;
  if (missingConf.length > 0) {
    evidenceRefs.push(`purity-audit:missing-confidence:count=${missingConf.length}`);
  }

  // 4. 检查 purityStatus
  const purityStatus: "PURE" | "CONTAMINATED" | "UNKNOWN" = evidence.purityAudit?.purityStatus ?? "UNKNOWN";
  metrics.purityStatus = purityStatus;
  evidenceRefs.push(`purity-audit:status=${purityStatus}`);

  // 5. 检查 confidence=1 的字段（潜在过度自信）
  const overconfidentFields = scanForConfidenceOne(evidence);
  metrics.overconfidentFieldsCount = overconfidentFields.length;
  if (overconfidentFields.length > 0) {
    evidenceRefs.push(`meta-scan:confidence=1:count=${overconfidentFields.length}`);
  }

  // 6. 检查 IR 声明值是否被误标为物理观测
  // IR 字段的 method 应包含 "ir-declared" 或 "ir-read"，而非 "pixel-measured"
  const irMasquerading = scanIRMasquerading(evidence);
  metrics.irMasqueradingCount = irMasquerading.length;
  if (irMasquerading.length > 0) {
    evidenceRefs.push(`meta-scan:ir-masquerading:count=${irMasquerading.length}`);
  }

  // 判定逻辑
  const isContaminated = purityStatus === "CONTAMINATED";
  const hasHardcoded = hardcoded.length > 0;
  const hasCriticalMissing = missingRefs.length > 3 || missingConf.length > 3;

  let verdict: "ALLOW" | "FLAG" | "REJECT";
  let rationale: string;
  let confidence: number;

  if (isContaminated || hasHardcoded) {
    verdict = "REJECT";
    confidence = 0.95;
    rationale =
      `Evidence chain contaminated: purityStatus=${purityStatus}, ` +
      `hardcodedConstants=${hardcoded.length}. ` +
      `Physical evidence integrity violated — HARD_REJECT.`;
  } else if (hasCriticalMissing || overconfidentFields.length > 5 || irMasquerading.length > 0) {
    verdict = "FLAG";
    confidence = 0.7;
    rationale =
      `Evidence integrity concerns: missingRefs=${missingRefs.length}, ` +
      `missingConf=${missingConf.length}, overconfident=${overconfidentFields.length}, ` +
      `irMasquerading=${irMasquerading.length}. ` +
      `Evidence may be partially unreliable — FLAG for manual review.`;
  } else if (purityStatus !== "PURE" && purityStatus !== "CONTAMINATED") {
    verdict = "FLAG";
    confidence = 0.3;
    rationale =
      "Purity audit status unrecognized — cannot verify evidence integrity. " +
      "FLAG due to missing meta-audit evidence.";
  } else {
    verdict = "ALLOW";
    confidence = 0.9;
    rationale =
      `Evidence chain pure: purityStatus=${purityStatus}, ` +
      `hardcodedConstants=0, missingRefs=${missingRefs.length}, ` +
      `missingConf=${missingConf.length}. ` +
      `No fake evidence or default injection detected.`;
  }

  return {
    gateId: GATE_ID,
    name: GATE_NAME,
    verdict,
    confidence,
    evidenceRefs,
    method: "meta-audit:purity-scan + confidence-distribution-scan + ir-masquerade-scan",
    rationale,
    metrics,
  };
}

// ---------------------------------------------------------------------------
// 辅助扫描函数
// ---------------------------------------------------------------------------

/**
 * 扫描证据集中 confidence=1 的字段（潜在过度自信）。
 * 物理测量通常不应有 100% 置信度，除非是确定性计算。
 */
function scanForConfidenceOne(evidence: ObservableEvidenceSet): string[] {
  const found: string[] = [];
  scanObject(evidence as unknown as Record<string, unknown>, (path, value) => {
    if (
      typeof value === "object" &&
      value !== null &&
      "confidence" in value &&
      (value as { confidence: unknown }).confidence === 1 &&
      "method" in value &&
      typeof (value as { method: unknown }).method === "string" &&
      !(value as { method: string }).method.includes("deterministic") &&
      !(value as { method: string }).method.includes("ir-read") &&
      !(value as { method: string }).method.includes("ir-declared")
    ) {
      found.push(path);
    }
  });
  return found;
}

/**
 * 扫描 IR 字段是否被误标为物理观测（method 包含 "pixel-measured" 但实际在 ir 域）。
 */
function scanIRMasquerading(evidence: ObservableEvidenceSet): string[] {
  const found: string[] = [];
  const ir = evidence.ir as unknown as Record<string, unknown> | undefined;
  if (!ir) return found;

  scanObject(ir, (path, value) => {
    if (
      typeof value === "object" &&
      value !== null &&
      "method" in value &&
      typeof (value as { method: unknown }).method === "string" &&
      ((value as { method: string }).method.includes("pixel-measured") ||
        (value as { method: string }).method.includes("render-observed"))
    ) {
      found.push(`ir.${path}`);
    }
  });
  return found;
}

/**
 * 递归扫描对象，对每个叶子节点调用 callback。
 */
function scanObject(
  obj: Record<string, unknown>,
  callback: (path: string, value: unknown) => void,
  prefix = "",
): void {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      // 检查是否为 EvidenceField（有 confidence 和 method）
      if ("confidence" in value && "method" in value) {
        callback(path, value);
      } else {
        scanObject(value as Record<string, unknown>, callback, path);
      }
    }
  }
}
