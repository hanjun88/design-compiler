/**
 * ANTI-01: Symbolic Stacking — 符号化机械堆砌
 *
 * 物理/拓扑依据：
 * - 实体节点数 >= 4，但图拓扑中节点间平均度数（Degree）极低（缺乏咬合/交叠）
 * - 不存在明确的 HOST_GUEST 统御或向心收敛边
 * - 物象孤立并置、无空间礼序支撑
 *
 * 判定：FLAG（可疑堆砌）或 REJECT（明确机械堆砌）
 *
 * 宪法约束：
 * - 必须基于图拓扑特征，不能基于"物象数量多"直接判定
 * - 节点数多但关系丰富的复杂构图不应被误判
 */

import type { AntiPatternResult, GateContext } from "../types";

export const GATE_ID = "ANTI-01";
export const GATE_NAME = "Symbolic Stacking";

export function detectSymbolicStacking(ctx: GateContext): AntiPatternResult {
  const { evidence, graph } = ctx;
  const evidenceRefs: string[] = [];
  const metrics: Record<string, number | string | boolean> = {};

  // 1. 图拓扑分析
  const nodes = graph.nodes;
  const relations = graph.relations;
  const nodeCount = nodes.length;
  const relationCount = relations.length;

  metrics.nodeCount = nodeCount;
  metrics.relationCount = relationCount;
  evidenceRefs.push(`graph:node-count=${nodeCount}`);
  evidenceRefs.push(`graph:relation-count=${relationCount}`);

  // 2. 计算平均度数（无向图）
  // 每条关系贡献 2 个度数（source 和 target 各 1）
  // MUTUAL 关系也是一条边，贡献 2 度
  const totalDegree = relationCount * 2;
  const averageDegree = nodeCount > 0 ? totalDegree / nodeCount : 0;
  metrics.averageDegree = Number(averageDegree.toFixed(4));
  evidenceRefs.push(`graph:average-degree=${averageDegree.toFixed(4)}`);

  // 3. 计算每个节点的度数，找出孤立节点
  const degreeMap = new Map<string, number>();
  for (const n of nodes) degreeMap.set(n.id, 0);
  for (const r of relations) {
    degreeMap.set(r.sourceId, (degreeMap.get(r.sourceId) ?? 0) + 1);
    degreeMap.set(r.targetId, (degreeMap.get(r.targetId) ?? 0) + 1);
  }
  const isolatedNodes = Array.from(degreeMap.entries()).filter(([, d]) => d === 0);
  metrics.isolatedNodeCount = isolatedNodes.length;
  if (isolatedNodes.length > 0) {
    evidenceRefs.push(`graph:isolated-nodes=${isolatedNodes.map(([id]) => id).join(",")}`);
  }

  // 4. 检查 HOST_GUEST 统御边
  const hostGuestEdges = relations.filter((r) => r.relationType === "HOST_GUEST");
  metrics.hostGuestEdgeCount = hostGuestEdges.length;
  evidenceRefs.push(`graph:host-guest-edges=${hostGuestEdges.length}`);

  // 5. 检查向心收敛（是否有节点被多条关系指向）
  const inDegreeMap = new Map<string, number>();
  for (const n of nodes) inDegreeMap.set(n.id, 0);
  for (const r of relations) {
    inDegreeMap.set(r.targetId, (inDegreeMap.get(r.targetId) ?? 0) + 1);
  }
  const maxInDegree = Math.max(...Array.from(inDegreeMap.values()), 0);
  metrics.maxInDegree = maxInDegree;
  evidenceRefs.push(`graph:max-in-degree=${maxInDegree}`);

  // 6. 物理证据：边缘像素比例（低边缘比例可能意味着物象缺乏交叠）
  const edgePixelRatio = evidence.pixel?.edgePixelRatio?.value;
  if (edgePixelRatio !== undefined) {
    metrics.edgePixelRatio = edgePixelRatio;
    evidenceRefs.push(evidence.pixel.edgePixelRatio.evidenceRef);
  }

  // 7. 负空间连通分量数（过多分量可能意味着碎片化堆砌）
  const voidComponentCount = evidence.pixel?.negativeSpaceComponentCount?.value;
  if (voidComponentCount !== undefined) {
    metrics.voidComponentCount = voidComponentCount;
    evidenceRefs.push(evidence.pixel.negativeSpaceComponentCount.evidenceRef);
  }

  // 判定逻辑
  // 符号化堆砌的特征：节点多 + 平均度数低 + 无 HOST_GUEST 统御 + 无向心收敛
  const hasManyNodes = nodeCount >= 8;
  const hasLowConnectivity = averageDegree < 1.8;
  const hasNoHostGuest = hostGuestEdges.length === 0;
  const hasNoConvergence = maxInDegree < 2;
  const hasIsolatedNodes = isolatedNodes.length >= 2;

  let verdict: "ALLOW" | "FLAG" | "REJECT";
  let rationale: string;
  let confidence: number;

  const severeSignals = [hasManyNodes, hasLowConnectivity, hasNoHostGuest, hasNoConvergence].filter(Boolean).length;
  metrics.severeSignalCount = severeSignals;

  if (severeSignals >= 3 && hasIsolatedNodes) {
    verdict = "REJECT";
    confidence = 0.85;
    rationale =
      `Symbolic stacking detected: nodeCount=${nodeCount}, averageDegree=${averageDegree.toFixed(2)}, ` +
      `hostGuestEdges=${hostGuestEdges.length}, maxInDegree=${maxInDegree}, ` +
      `isolatedNodes=${isolatedNodes.length}. ` +
      `Entities are isolated juxtapositions without spatial hierarchy or guest-host relations.`;
  } else if (severeSignals >= 2) {
    verdict = "FLAG";
    confidence = 0.65;
    rationale =
      `Potential symbolic stacking: nodeCount=${nodeCount}, averageDegree=${averageDegree.toFixed(2)}, ` +
      `hostGuestEdges=${hostGuestEdges.length}, maxInDegree=${maxInDegree}. ` +
      `Graph topology shows weak connectivity — FLAG for manual review.`;
  } else {
    verdict = "ALLOW";
    confidence = 0.8;
    rationale =
      `No symbolic stacking: nodeCount=${nodeCount}, averageDegree=${averageDegree.toFixed(2)}, ` +
      `hostGuestEdges=${hostGuestEdges.length}, maxInDegree=${maxInDegree}. ` +
      `Graph has sufficient connectivity and hierarchy.`;
  }

  return {
    gateId: GATE_ID,
    name: GATE_NAME,
    verdict,
    confidence,
    evidenceRefs,
    method: "graph-topology:degree-distribution + host-guest-presence + convergence-analysis + pixel-edge-ratio",
    rationale,
    metrics,
  };
}
