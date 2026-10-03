/**
 * ANTI-01: Symbolic Stacking — 符号化机械堆砌
 *
 * 物理/拓扑依据：
 * - 实体节点数多，但图拓扑中节点间平均度数（Degree）极低（缺乏咬合/交叠）
 * - 不存在明确的 HOST_GUEST 统御或向心收敛边
 * - 物象孤立并置、无空间礼序支撑
 *
 * 判定：FLAG（可疑堆砌）或 REJECT（明确机械堆砌）
 *
 * 宪法约束：
 * - 必须基于图拓扑特征，不能基于"物象数量多"直接判定
 * - 节点数多但关系丰富的复杂构图不应被误判
 *
 * 阈值不在本文件定义：全部来自 skill 的 AestheticConstraintSheet
 * （ANTI_PATTERN_THRESHOLD / symbolic-stacking，规则 CAS-AP-GATE-SYMBOLIC-STACKING）。
 */

import type { AntiPatternResult, GateContext } from "../types";
import { requireDecisionPack } from "../../../skill-bridge/active-pack";

export const GATE_ID = "ANTI-01";
export const GATE_NAME = "Symbolic Stacking";
/** Decision subject of this gate in the skill's sheet (kind ANTI_PATTERN_THRESHOLD). */
export const GATE_SUBJECT = "symbolic-stacking";

export function detectSymbolicStacking(ctx: GateContext): AntiPatternResult {
  const { evidence, graph } = ctx;
  const t = requireDecisionPack().policy("ANTI_PATTERN_THRESHOLD", GATE_SUBJECT);
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
  // ssot-ok(NUMERIC_GUARD): division-by-zero guard for an empty graph (average degree of no nodes is 0)
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
  // ssot-ok(SELECTION_MECHANISM): an isolated node is by definition a node of degree zero (set membership, no magnitude)
  const isolatedNodes = Array.from(degreeMap.entries()).filter(([, d]) => d === 0);
  metrics.isolatedNodeCount = isolatedNodes.length;
  // ssot-ok(SELECTION_MECHANISM): set non-emptiness decides only whether the isolated ids are listed as evidence
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
  const hasManyNodes = nodeCount >= t.num("many_nodes_min");
  const hasLowConnectivity = averageDegree < t.num("low_average_degree_below");
  // ssot-ok(SELECTION_MECHANISM): absence of any HOST_GUEST edge is a set-emptiness test, not an aesthetic magnitude
  const hasNoHostGuest = hostGuestEdges.length === 0;
  const hasNoConvergence = maxInDegree < t.num("convergence_in_degree_min");
  const hasIsolatedNodes = isolatedNodes.length >= t.num("isolated_nodes_min");

  let verdict: "ALLOW" | "FLAG" | "REJECT";
  let rationale: string;
  let confidence: number;

  const severeSignals = [hasManyNodes, hasLowConnectivity, hasNoHostGuest, hasNoConvergence].filter(Boolean).length;
  metrics.severeSignalCount = severeSignals;

  if (severeSignals >= t.num("reject_severe_signals_min") && hasIsolatedNodes) {
    verdict = "REJECT";
    confidence = t.num("confidence_reject");
    rationale =
      `Symbolic stacking detected: nodeCount=${nodeCount}, averageDegree=${averageDegree.toFixed(2)}, ` +
      `hostGuestEdges=${hostGuestEdges.length}, maxInDegree=${maxInDegree}, ` +
      `isolatedNodes=${isolatedNodes.length}. ` +
      `Entities are isolated juxtapositions without spatial hierarchy or guest-host relations.`;
  } else if (severeSignals >= t.num("flag_severe_signals_min")) {
    verdict = "FLAG";
    confidence = t.num("confidence_flag");
    rationale =
      `Potential symbolic stacking: nodeCount=${nodeCount}, averageDegree=${averageDegree.toFixed(2)}, ` +
      `hostGuestEdges=${hostGuestEdges.length}, maxInDegree=${maxInDegree}. ` +
      `Graph topology shows weak connectivity — FLAG for manual review.`;
  } else {
    verdict = "ALLOW";
    confidence = t.num("confidence_allow");
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
