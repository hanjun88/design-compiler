/**
 * ANTI-04: Conflicted Hierarchy — 主从混乱 / 多主冲突
 *
 * 拓扑依据：
 * - 图拓扑中存在多个被标记为主体（SUBJECT）的节点
 * - 其节点能量差 < 15%
 * - 它们之间不存在主次从属关系（无有效 HOST_GUEST 边）
 *
 * 判定：多焦点争抢视线，违反宾主揖让
 *
 * 宪法约束：
 * - 必须基于图拓扑，不能基于"画面元素多"直接判定
 * - 单一主体节点不应被判定
 * - 多个主体但能量差异明显（有明确主次）不应被判定
 */

import type { AntiPatternResult, GateContext } from "../types";

export const GATE_ID = "ANTI-04";
export const GATE_NAME = "Conflicted Hierarchy";

export function detectConflictedHierarchy(ctx: GateContext): AntiPatternResult {
  const { evidence, graph } = ctx;
  const evidenceRefs: string[] = [];
  const metrics: Record<string, number | string | boolean> = {};

  // 1. 找出所有 SUBJECT 类型节点
  const subjectNodes = graph.nodes.filter((n) => n.type === "SUBJECT");
  metrics.subjectNodeCount = subjectNodes.length;
  evidenceRefs.push(`graph:subject-node-count=${subjectNodes.length}`);

  // 2. 记录所有 SUBJECT 节点的能量
  const subjectEnergies = subjectNodes.map((n) => n.energy);
  metrics.subjectEnergies = JSON.stringify(subjectEnergies);
  for (const n of subjectNodes) {
    evidenceRefs.push(`graph:node:${n.id}:energy=${n.energy}`);
  }

  // 3. 检查 SUBJECT 节点之间是否有 HOST_GUEST 边
  const subjectIds = new Set(subjectNodes.map((n) => n.id));
  const hostGuestBetweenSubjects = graph.relations.filter(
    (r) =>
      r.relationType === "HOST_GUEST" &&
      subjectIds.has(r.sourceId) &&
      subjectIds.has(r.targetId),
  );
  metrics.hostGuestBetweenSubjects = hostGuestBetweenSubjects.length;
  evidenceRefs.push(`graph:host-guest-between-subjects=${hostGuestBetweenSubjects.length}`);

  // 4. 检查所有 HOST_GUEST 边（可能有 SUBJECT→SPACE 的统御）
  const allHostGuestEdges = graph.relations.filter((r) => r.relationType === "HOST_GUEST");
  metrics.totalHostGuestEdges = allHostGuestEdges.length;
  evidenceRefs.push(`graph:total-host-guest-edges=${allHostGuestEdges.length}`);

  // 5. 计算 SUBJECT 节点能量的最大差异比例
  let maxEnergyDiffRatio = 0;
  if (subjectEnergies.length >= 2) {
    const maxE = Math.max(...subjectEnergies);
    const minE = Math.min(...subjectEnergies);
    maxEnergyDiffRatio = maxE > 0 ? (maxE - minE) / maxE : 0;
  }
  metrics.maxEnergyDiffRatio = Number(maxEnergyDiffRatio.toFixed(4));
  evidenceRefs.push(`graph:subject-energy-diff-ratio=${maxEnergyDiffRatio.toFixed(4)}`);

  // 6. 焦点偏移（物理证据辅助）
  const focalOffset = evidence.pixel?.focalCenterOffset?.value;
  if (focalOffset !== undefined) {
    metrics.focalCenterOffset = focalOffset;
    evidenceRefs.push(evidence.pixel.focalCenterOffset.evidenceRef);
  }

  // 7. 对称性（高对称可能意味着双主体并置）
  const symmetry = evidence.ir?.symmetry?.value;
  if (symmetry !== undefined) {
    metrics.symmetry = symmetry;
    evidenceRefs.push(evidence.ir.symmetry.evidenceRef);
  }

  // 判定逻辑
  // 主从混乱的特征：多个 SUBJECT 节点 + 能量接近 + 无 HOST_GUEST 从属
  const hasMultipleSubjects = subjectNodes.length >= 2;
  const hasCloseEnergies = maxEnergyDiffRatio < 0.15; // 能量差 < 15%
  const hasNoSubjectHierarchy = hostGuestBetweenSubjects.length === 0;

  metrics.hasMultipleSubjects = hasMultipleSubjects;
  metrics.hasCloseEnergies = hasCloseEnergies;
  metrics.hasNoSubjectHierarchy = hasNoSubjectHierarchy;

  let verdict: "ALLOW" | "FLAG" | "REJECT";
  let rationale: string;
  let confidence: number;

  if (hasMultipleSubjects && hasCloseEnergies && hasNoSubjectHierarchy) {
    verdict = "REJECT";
    confidence = 0.85;
    rationale =
      `Conflicted hierarchy detected: subjectCount=${subjectNodes.length}, ` +
      `energyDiffRatio=${maxEnergyDiffRatio.toFixed(4)}, ` +
      `hostGuestBetweenSubjects=0. ` +
      `Multiple subject nodes with nearly equal energy and no guest-host hierarchy ` +
      `indicates competing focal points violating 宾主揖让 (host-guest courtesy).`;
  } else if (hasMultipleSubjects && (hasCloseEnergies || hasNoSubjectHierarchy)) {
    verdict = "FLAG";
    confidence = 0.6;
    rationale =
      `Potential conflicted hierarchy: subjectCount=${subjectNodes.length}, ` +
      `energyDiffRatio=${maxEnergyDiffRatio.toFixed(4)}, ` +
      `hostGuestBetweenSubjects=${hostGuestBetweenSubjects.length}. ` +
      `Multiple subjects with weak hierarchy signals — FLAG for manual review.`;
  } else if (subjectNodes.length === 0) {
    // 没有 SUBJECT 节点本身不是反模式，但值得记录
    verdict = "ALLOW";
    confidence = 0.5;
    rationale =
      "No SUBJECT nodes found in graph — cannot assess hierarchy conflict. " +
      "This may indicate graph construction issue or non-representational composition.";
  } else {
    verdict = "ALLOW";
    confidence = 0.85;
    rationale =
      `No conflicted hierarchy: subjectCount=${subjectNodes.length}, ` +
      `energyDiffRatio=${maxEnergyDiffRatio.toFixed(4)}, ` +
      `hostGuestBetweenSubjects=${hostGuestBetweenSubjects.length}. ` +
      `Subject hierarchy is clear or single-dominant.`;
  }

  return {
    gateId: GATE_ID,
    name: GATE_NAME,
    verdict,
    confidence,
    evidenceRefs,
    method: "graph-topology:subject-node-count + energy-distribution + host-guest-edge-presence + focal-offset cross-check",
    rationale,
    metrics,
  };
}
