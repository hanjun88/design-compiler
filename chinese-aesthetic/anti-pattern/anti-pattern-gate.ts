/**
 * Anti-Pattern Gate Runner — 反模式门禁协调器
 *
 * Phase 2 Step 2.4: 聚合 6 大独立门禁，生成具备 SHA256 指纹的法医对账报告。
 *
 * 输入：ObservableEvidenceSet (2.2) + AestheticRelationshipGraph (2.3)
 * 输出：AntiPatternReport（含 overallVerdict + 6 gateResults + reportHash + constitutionCompliance）
 *
 * 宪法约束：
 * - 每个 REJECT 必须有 evidenceRef
 * - 每个 FLAG 必须有 reason + evidence
 * - UNMEASURED / SOURCE_LIMITED ≠ FAIL
 * - 输出必须确定性（相同输入 → 相同 reportHash）
 */

import type {
  AntiPatternReport,
  AntiPatternResult,
  GateContext,
  OverallVerdict,
  ConstitutionCompliance,
} from "./types";
import { detectSymbolicStacking } from "./gates/symbolic-stacking";
import { detectUnphysicalGlow } from "./gates/unphysical-glow";
import { detectDeadVoid } from "./gates/dead-void";
import { detectConflictedHierarchy } from "./gates/conflicted-hierarchy";
import { detectToxicSaturation } from "./gates/toxic-saturation";
import { detectFakeEvidence } from "./gates/fake-evidence";
import type { ObservableEvidenceSet } from "../extraction/types";
import type { AestheticRelationshipGraph } from "../graph/types";

// ---------------------------------------------------------------------------
// 门禁注册表（按执行顺序，ANTI-06 最高优先级但最后执行以确保元审计完整）
// ---------------------------------------------------------------------------

const GATE_REGISTRY = [
  { id: "ANTI-01", name: "Symbolic Stacking", fn: detectSymbolicStacking },
  { id: "ANTI-02", name: "Unphysical Glow", fn: detectUnphysicalGlow },
  { id: "ANTI-03", name: "Dead Void", fn: detectDeadVoid },
  { id: "ANTI-04", name: "Conflicted Hierarchy", fn: detectConflictedHierarchy },
  { id: "ANTI-05", name: "Toxic Saturation", fn: detectToxicSaturation },
  { id: "ANTI-06", name: "Fake Evidence", fn: detectFakeEvidence },
] as const;

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

/**
 * 执行全部 6 大反模式门禁，生成法医报告。
 *
 * @param evidence 可观测证据集（2.2 产物）
 * @param graph 美学关系图（2.3 产物）
 * @returns 反模式门禁报告（确定性，含 SHA256 指纹）
 */
export function runAntiPatternGate(
  evidence: ObservableEvidenceSet,
  graph: AestheticRelationshipGraph,
): AntiPatternReport {
  const ctx: GateContext = { evidence, graph };

  // 1. 按顺序执行 6 大门禁
  const gateResults: AntiPatternResult[] = GATE_REGISTRY.map((gate) => {
    try {
      return gate.fn(ctx);
    } catch (error) {
      // 门禁执行异常时返回 FLAG（不崩溃，不伪造 ALLOW）
      return {
        gateId: gate.id,
        name: gate.name,
        verdict: "FLAG",
        confidence: 0.1,
        evidenceRefs: [],
        method: "gate-execution-error",
        rationale: `Gate execution failed: ${error instanceof Error ? error.message : String(error)}`,
        metrics: { executionError: true },
      };
    }
  });

  // 2. 聚合整体判定
  const rejectedGates = gateResults
    .filter((r) => r.verdict === "REJECT")
    .map((r) => r.gateId);
  const flaggedGates = gateResults
    .filter((r) => r.verdict === "FLAG")
    .map((r) => r.gateId);

  let overallVerdict: OverallVerdict;
  if (rejectedGates.length > 0) {
    overallVerdict = "REJECT";
  } else if (flaggedGates.length > 0) {
    overallVerdict = "FLAG";
  } else {
    overallVerdict = "ALLOW";
  }

  // 3. 宪法合规性自检
  const constitutionCompliance = checkConstitutionCompliance(gateResults);

  // 4. 生成报告 ID（基于 evidenceId + graphHash）
  const reportId = `anti-pattern-report:${evidence.evidenceId}:${graph.graphHash}`;

  // 5. 生成报告哈希（确定性 SHA256）
  const reportHash = computeReportHash({
    reportId,
    evidenceId: evidence.evidenceId,
    graphHash: graph.graphHash,
    overallVerdict,
    gateResults,
    rejectedGates,
    flaggedGates,
    generatedAt: evidence.capturedAt,
  });

  return {
    reportId,
    evidenceId: evidence.evidenceId,
    graphHash: graph.graphHash,
    overallVerdict,
    gateResults,
    rejectedGates,
    flaggedGates,
    generatedAt: evidence.capturedAt,
    reportHash,
    constitutionCompliance,
  };
}

// ---------------------------------------------------------------------------
// 宪法合规性自检
// ---------------------------------------------------------------------------

function checkConstitutionCompliance(gateResults: AntiPatternResult[]): ConstitutionCompliance {
  // 1. 所有 REJECT 都有 evidenceRef
  const rejects = gateResults.filter((r) => r.verdict === "REJECT");
  const allRejectsHaveEvidence = rejects.every((r) => r.evidenceRefs.length > 0);

  // 2. 所有 FLAG 都有 reason + evidence
  const flags = gateResults.filter((r) => r.verdict === "FLAG");
  const allFlagsHaveReason = flags.every(
    (r) => r.rationale.length > 0 && r.evidenceRefs.length > 0,
  );

  // 3. 无 confidence=1 但 evidenceRefs 为空
  const noUnsupportedConfidenceOne = gateResults.every(
    (r) => !(r.confidence === 1 && r.evidenceRefs.length === 0),
  );

  // 4. UNMEASURED 未被当作 FAIL（有 unmeasuredReason 的结果 verdict 应为 ALLOW）
  const unmeasuredResults = gateResults.filter((r) => r.unmeasuredReason !== undefined);
  const unmeasuredNotTreatedAsFail = unmeasuredResults.every((r) => r.verdict === "ALLOW");

  // 5. 无语义评分输入（检查 method 中是否包含 "semantic-score" 或 "aesthetic-score"）
  const noSemanticScoreInput = gateResults.every(
    (r) =>
      !r.method.includes("semantic-score") &&
      !r.method.includes("aesthetic-score") &&
      !r.method.includes("qiyun"),
  );

  const compliant =
    allRejectsHaveEvidence &&
    allFlagsHaveReason &&
    noUnsupportedConfidenceOne &&
    unmeasuredNotTreatedAsFail &&
    noSemanticScoreInput;

  return {
    allRejectsHaveEvidence,
    allFlagsHaveReason,
    noUnsupportedConfidenceOne,
    unmeasuredNotTreatedAsFail,
    noSemanticScoreInput,
    compliant,
  };
}

// ---------------------------------------------------------------------------
// 确定性报告哈希（FNV-1a，与 graph hash 一致）
// ---------------------------------------------------------------------------

function computeReportHash(reportData: Record<string, unknown>): string {
  // 使用确定性 JSON 序列化（键排序）
  const canonical = deterministicStringify(reportData);

  // FNV-1a 32位哈希
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * 确定性 JSON 序列化：递归排序对象键，确保相同数据产生相同字符串。
 */
function deterministicStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj === "number" || typeof obj === "boolean" || typeof obj === "string") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map(deterministicStringify).join(",")}]`;
  }
  if (typeof obj === "object") {
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    const parts = keys.map(
      (k) => `${JSON.stringify(k)}:${deterministicStringify((obj as Record<string, unknown>)[k])}`,
    );
    return `{${parts.join(",")}}`;
  }
  return JSON.stringify(obj);
}
