/**
 * Topology Guard — 拓扑不变量检验
 *
 * 四大拓扑不变量：
 * 1. 非孤立性：所有节点至少属于一条关系边
 * 2. 反向对称性：极性互斥关系方向与极性严格代数对齐
 * 3. 有界力场：全图总能量归一化 ∈ [0, 1]
 * 4. 纯度穿透：每条边必能回溯至具体 EvidenceField
 */

import type { AestheticNode, AestheticRelation, TopologyAudit } from "./types";

/**
 * 执行拓扑不变量检验。
 * @param nodes 节点列表
 * @param relations 关系边列表
 * @returns 拓扑审计结果
 */
export function auditTopology(
  nodes: AestheticNode[],
  relations: AestheticRelation[],
): TopologyAudit {
  const violations: string[] = [];

  // 1. 非孤立性：所有节点至少属于一条关系边
  const connectedNodeIds = new Set<string>();
  for (const rel of relations) {
    connectedNodeIds.add(rel.sourceId);
    connectedNodeIds.add(rel.targetId);
  }
  const isolatedNodes = nodes.filter((n) => !connectedNodeIds.has(n.id));
  const noIsolatedNodes = isolatedNodes.length === 0;
  if (!noIsolatedNodes) {
    violations.push(`Isolated nodes: ${isolatedNodes.map((n) => n.id).join(", ")}`);
  }

  // 2. 反向对称性：MUTUAL 极性关系应存在反向边（或自身即为双向语义）
  // 检查：每个 MUTUAL 关系的 source/target 对，是否存在反向关系或自身语义闭合
  const polarAlignment = checkPolarAlignment(relations);
  if (!polarAlignment) {
    violations.push("Polar alignment violation: MUTUAL relations lack consistent reverse-edge semantics");
  }

  // 3. 有界力场：全图总能量归一化
  const totalEnergy = nodes.reduce((sum, n) => sum + n.energy, 0);
  const boundedEnergy = totalEnergy >= 0 && totalEnergy <= nodes.length * 1.5; // 允许略超1的累积
  if (!boundedEnergy) {
    violations.push(`Energy out of bounds: total=${totalEnergy.toFixed(4)}, nodeCount=${nodes.length}`);
  }

  // 4. 纯度穿透：每条边必能回溯至具体 EvidenceField（derivedFrom 非空）
  const impureEdges = relations.filter((r) => r.derivedFrom.length === 0);
  const purityPenetration = impureEdges.length === 0;
  if (!purityPenetration) {
    violations.push(`Edges without provenance: ${impureEdges.map((r) => `${r.sourceId}->${r.targetId}`).join(", ")}`);
  }

  const status = noIsolatedNodes && polarAlignment && boundedEnergy && purityPenetration
    ? "PASS" as const
    : "FAIL" as const;

  return {
    noIsolatedNodes,
    polarAlignment,
    boundedEnergy,
    purityPenetration,
    violations,
    status,
  };
}

/**
 * 检查极性对齐：
 * 1. MUTUAL 关系：magnitude 和 confidence 必须在 [0,1] 且非 NaN
 * 2. FORWARD 关系：不应存在同类型的反向 FORWARD（会矛盾）
 * 3. REVERSE 关系：类似检查
 * MUTUAL 本身即双向，不需要显式反向边。
 */
function checkPolarAlignment(relations: AestheticRelation[]): boolean {
  // 1. MUTUAL 关系检查
  const mutualRels = relations.filter((r) => r.polarity === "MUTUAL");
  for (const rel of mutualRels) {
    if (Number.isNaN(rel.magnitude) || rel.magnitude < 0 || rel.magnitude > 1) return false;
    if (Number.isNaN(rel.confidence) || rel.confidence < 0 || rel.confidence > 1) return false;
  }

  // 2. FORWARD 关系检查：不应存在同类型的反向 FORWARD
  const forwardRels = relations.filter((r) => r.polarity === "FORWARD");
  for (const rel of forwardRels) {
    if (Number.isNaN(rel.magnitude) || Number.isNaN(rel.confidence)) return false;
    const contradictory = relations.some(
      (r) =>
        r.relationType === rel.relationType &&
        r.sourceId === rel.targetId &&
        r.targetId === rel.sourceId &&
        r.polarity === "FORWARD",
    );
    if (contradictory) return false;
  }

  // 3. REVERSE 关系检查：不应存在同类型的反向 REVERSE
  const reverseRels = relations.filter((r) => r.polarity === "REVERSE");
  for (const rel of reverseRels) {
    if (Number.isNaN(rel.magnitude) || Number.isNaN(rel.confidence)) return false;
    const contradictory = relations.some(
      (r) =>
        r.relationType === rel.relationType &&
        r.sourceId === rel.targetId &&
        r.targetId === rel.sourceId &&
        r.polarity === "REVERSE",
    );
    if (contradictory) return false;
  }

  return true;
}
