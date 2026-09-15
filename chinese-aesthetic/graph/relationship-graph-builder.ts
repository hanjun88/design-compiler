/**
 * Relationship Graph Builder — 关系图构建器
 *
 * Phase 2 Step 2.3 主编排器：
 *   ObservableEvidenceSet → Node Instantiation → Relation Derivation → Topology Audit → Graph
 *
 * 核心原则：
 * - 所有节点和边必须可回溯至具体 EvidenceField
 * - 无法从物理证据推导的关系显式标记为未测量，不脑补
 * - 字节级确定性：相同输入 → 相同图
 * - 严禁输出语义评分或文化分类器结果
 */

import type { ObservableEvidenceSet } from "../extraction/types";
import type {
  AestheticNode,
  AestheticRelation,
  AestheticRelationshipGraph,
  UnmeasuredRelation,
  NormalizedRect,
} from "./types";
import { auditTopology } from "./topology-guard";

// Derivers
import { deriveHostGuest } from "./derivers/host-guest";
import { deriveSolidVoid } from "./derivers/solid-void";
import { deriveDenseSparse } from "./derivers/dense-sparse";
import { deriveCenterEdge } from "./derivers/center-edge";
import { deriveMoveStill, unmeasuredMoveStill } from "./derivers/move-still";
import { deriveNearFar, unmeasuredNearFar } from "./derivers/near-far";
import {
  deriveHighLow,
  deriveHeavyLight,
  deriveOldNew,
  deriveOpenClose,
} from "./derivers/field-relations";

// ---------------------------------------------------------------------------
// 节点实例化
// ---------------------------------------------------------------------------

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

/**
 * 从证据集实例化所有节点。
 * 每个节点绑定具体物理证据，energy 由证据归一化得到。
 */
function instantiateNodes(evidence: ObservableEvidenceSet): AestheticNode[] {
  const nodes: AestheticNode[] = [];

  // 1. SUBJECT: 主体（显著性质心区域）
  const focalPoint = evidence.pixel.focalPoint.value; // [x, y] ∈ [0,1]
  const focalOffset = evidence.pixel.focalCenterOffset.value;
  const dominantRatio = evidence.pixel.dominantColorRatio.value;
  const subjectEnergy = Math.min(1, dominantRatio * (1 - Math.min(1, focalOffset / 0.707)) + 0.1);
  nodes.push({
    id: "node:subject:primary",
    type: "SUBJECT",
    boundingRegion: [
      Math.max(0, focalPoint[0] - 0.15),
      Math.max(0, focalPoint[1] - 0.15),
      0.3,
      0.3,
    ] as NormalizedRect,
    energy: round4(subjectEnergy),
    evidenceRefs: [
      evidence.pixel.focalPoint.evidenceRef,
      evidence.pixel.dominantColorRatio.evidenceRef,
      evidence.pixel.focalCenterOffset.evidenceRef,
    ],
    confidence: round4(Math.min(
      evidence.pixel.focalPoint.confidence,
      evidence.pixel.dominantColorRatio.confidence,
    )),
  });

  // 2. VOID: 虚空（负空间）
  const negRatio = evidence.pixel.negativeSpaceRatio.value;
  nodes.push({
    id: "node:void:negative-space",
    type: "VOID",
    boundingRegion: null, // 负空间无固定边界
    energy: round4(negRatio),
    evidenceRefs: [
      evidence.pixel.negativeSpaceRatio.evidenceRef,
      evidence.pixel.negativeSpaceComponentCount.evidenceRef,
      evidence.pixel.largestVoidRegionRatio.evidenceRef,
    ],
    confidence: round4(evidence.pixel.negativeSpaceRatio.confidence),
  });

  // 3. SPACE: 空间（构图/对称/视平线）
  const symmetry = evidence.ir.symmetry.value;
  const horizon = evidence.ir.horizonPosition.value;
  const spaceEnergy = Math.min(1, symmetry * 0.6 + (1 - Math.abs(horizon - 0.5) * 2) * 0.4);
  nodes.push({
    id: "node:space:composition",
    type: "SPACE",
    boundingRegion: [0, 0, 1, 1] as NormalizedRect, // 全画面空间
    energy: round4(spaceEnergy),
    evidenceRefs: [
      evidence.ir.symmetry.evidenceRef,
      evidence.ir.horizonPosition.evidenceRef,
      evidence.ir.compositionType.evidenceRef,
    ],
    confidence: round4(Math.min(evidence.ir.symmetry.confidence, evidence.ir.horizonPosition.confidence)),
  });

  // 4. LIGHT: 光照（亮度场/色温）
  const meanLuma = evidence.pixel.meanLuminance.value / 255;
  const tempBias = evidence.pixel.temperatureBias.value;
  nodes.push({
    id: "node:light:luminance-field",
    type: "LIGHT",
    boundingRegion: null,
    energy: round4(meanLuma),
    evidenceRefs: [
      evidence.pixel.meanLuminance.evidenceRef,
      evidence.pixel.temperatureBias.evidenceRef,
      evidence.ir.colorTemp.evidenceRef,
      evidence.ir.lightIntensity.evidenceRef,
    ],
    confidence: round4(Math.min(evidence.pixel.meanLuminance.confidence, evidence.ir.colorTemp.confidence)),
  });

  // 5. MATERIAL: 材质（表面/粗糙度/金属度）
  const metalness = evidence.material.dominantMetalness.value;
  const roughness = evidence.material.dominantRoughness.value;
  const surfaceVar = evidence.material.surfaceVariation.value;
  const materialEnergy = Math.min(1, metalness * 0.4 + roughness * 0.3 + Math.min(1, surfaceVar / 50) * 0.3);
  nodes.push({
    id: "node:material:dominant",
    type: "MATERIAL",
    boundingRegion: null,
    energy: round4(materialEnergy),
    evidenceRefs: [
      evidence.material.dominantMetalness.evidenceRef,
      evidence.material.dominantRoughness.evidenceRef,
      evidence.material.surfaceVariation.evidenceRef,
      evidence.material.dominantBaseType.evidenceRef,
    ],
    confidence: round4(Math.min(
      evidence.material.dominantMetalness.confidence,
      evidence.material.surfaceVariation.confidence,
    )),
  });

  // 6. AXIS: 轴线（中轴对称）
  nodes.push({
    id: "node:axis:symmetry",
    type: "AXIS",
    boundingRegion: [0.5 - 0.02, 0, 0.04, 1] as NormalizedRect, // 中轴带
    energy: round4(symmetry),
    evidenceRefs: [
      evidence.ir.symmetry.evidenceRef,
      evidence.pixel.focalPoint.evidenceRef,
    ],
    confidence: round4(evidence.ir.symmetry.confidence),
  });

  // 7. BOUNDARY: 边界（边缘密度/轮廓）
  const edgeRatio = evidence.pixel.edgePixelRatio.value;
  nodes.push({
    id: "node:boundary:edges",
    type: "BOUNDARY",
    boundingRegion: null,
    energy: round4(Math.min(1, edgeRatio / 0.3)),
    evidenceRefs: [
      evidence.pixel.edgePixelRatio.evidenceRef,
      evidence.pixel.spatialLaplacianVariance.evidenceRef,
      evidence.pixel.sobelEdgeGradientSkew.evidenceRef,
    ],
    confidence: round4(evidence.pixel.edgePixelRatio.confidence),
  });

  // 8. SCALE: 尺度（天地人级差/前景背景比）
  const scaleEnergy = Math.min(1, Math.abs(horizon - 0.5) * 2 + focalOffset / 0.707);
  nodes.push({
    id: "node:scale:hierarchy",
    type: "SCALE",
    boundingRegion: null,
    energy: round4(scaleEnergy),
    evidenceRefs: [
      evidence.ir.horizonPosition.evidenceRef,
      evidence.ir.cameraPitch.evidenceRef,
      evidence.pixel.focalCenterOffset.evidenceRef,
    ],
    confidence: round4(Math.min(evidence.ir.horizonPosition.confidence, evidence.ir.cameraPitch.confidence)),
  });

  // 9. TIME: 时间（包浆/风化/痕迹）
  const wear = evidence.material.dominantWear.value;
  const timeTrace = evidence.material.timeTraceDetectability.value;
  nodes.push({
    id: "node:time:patina",
    type: "TIME",
    boundingRegion: null,
    energy: round4(Math.min(1, wear * 0.6 + timeTrace * 0.4)),
    evidenceRefs: [
      evidence.material.dominantWear.evidenceRef,
      evidence.material.timeTraceDetectability.evidenceRef,
      evidence.material.colorVariationSpatialGradient.evidenceRef,
    ],
    confidence: round4(Math.min(
      evidence.material.dominantWear.confidence,
      evidence.material.timeTraceDetectability.confidence,
    )),
  });

  // 10. VIEW: 视角（相机俯仰/视平线）
  const cameraPitch = evidence.ir.cameraPitch.value;
  nodes.push({
    id: "node:view:camera",
    type: "VIEW",
    boundingRegion: null,
    energy: round4(Math.min(1, Math.abs(cameraPitch) / 45)),
    evidenceRefs: [
      evidence.ir.cameraPitch.evidenceRef,
      evidence.ir.horizonPosition.evidenceRef,
    ],
    confidence: round4(evidence.ir.cameraPitch.confidence),
  });

  // 11. MOTION: 运动（仅多帧时存在）
  if (evidence.motion !== null) {
    const flowCoherence = evidence.motion.opticalFlowDirectionCoherence.value;
    const motionCont = evidence.motion.motionContinuity.value;
    nodes.push({
      id: "node:motion:optical-flow",
      type: "MOTION",
      boundingRegion: null,
      energy: round4(Math.min(1, flowCoherence * 0.6 + motionCont * 0.4)),
      evidenceRefs: [
        evidence.motion.opticalFlowDirectionCoherence.evidenceRef,
        evidence.motion.motionContinuity.evidenceRef,
        evidence.motion.globalDisplacementMean.evidenceRef,
      ],
      confidence: round4(Math.min(
        evidence.motion.opticalFlowDirectionCoherence.confidence,
        evidence.motion.motionContinuity.confidence,
      )),
    });
  }

  return nodes;
}

// ---------------------------------------------------------------------------
// 关系推导编排
// ---------------------------------------------------------------------------

function deriveRelations(
  evidence: ObservableEvidenceSet,
  nodes: AestheticNode[],
): { relations: AestheticRelation[]; unmeasured: UnmeasuredRelation[] } {
  const relations: AestheticRelation[] = [];
  const unmeasured: UnmeasuredRelation[] = [];

  // 节点查找
  const getNode = (id: string): AestheticNode | undefined => nodes.find((n) => n.id === id);
  const subject = getNode("node:subject:primary")!;
  const voidNode = getNode("node:void:negative-space")!;
  const space = getNode("node:space:composition")!;
  const light = getNode("node:light:luminance-field")!;
  const material = getNode("node:material:dominant")!;
  const axis = getNode("node:axis:symmetry")!;
  const boundary = getNode("node:boundary:edges")!;
  const time = getNode("node:time:patina")!;

  // 1. HOST_GUEST: SUBJECT → SPACE
  relations.push(deriveHostGuest(evidence, subject, space));

  // 2. SOLID_VOID: SUBJECT ↔ VOID
  relations.push(deriveSolidVoid(evidence, subject, voidNode));

  // 3. DENSE_SPARSE: BOUNDARY ↔ VOID
  relations.push(deriveDenseSparse(evidence, boundary, voidNode));

  // 4. CENTER_EDGE: AXIS ↔ BOUNDARY
  relations.push(deriveCenterEdge(evidence, axis, boundary));

  // 5. MOVE_STILL: MOTION ↔ SPACE（仅多帧时）
  const motionNode = getNode("node:motion:optical-flow");
  if (motionNode) {
    const moveStill = deriveMoveStill(evidence, motionNode, space);
    if (moveStill) relations.push(moveStill);
  } else {
    unmeasured.push(unmeasuredMoveStill());
  }

  // 6. NEAR_FAR: 仅深度缓冲可用时
  const nearFar = deriveNearFar(evidence, subject, voidNode);
  if (nearFar) {
    relations.push(nearFar);
  } else {
    unmeasured.push(unmeasuredNearFar());
  }

  // 7. HIGH_LOW: LIGHT ↔ VOID
  relations.push(deriveHighLow(evidence, light, voidNode));

  // 8. HEAVY_LIGHT: MATERIAL ↔ LIGHT
  relations.push(deriveHeavyLight(evidence, material, light));

  // 9. OLD_NEW: TIME ↔ MATERIAL
  relations.push(deriveOldNew(evidence, time, material));

  // 10. OPEN_CLOSE: SPACE ↔ BOUNDARY
  relations.push(deriveOpenClose(evidence, space, boundary));

  // 11. SCALE ↔ SPACE: 尺度层级对空间构图的支配（HOST_GUEST）
  const scaleNode = getNode("node:scale:hierarchy")!;
  relations.push({
    sourceId: scaleNode.id,
    targetId: space.id,
    relationType: "HOST_GUEST",
    magnitude: round4(Math.min(1, scaleNode.energy * space.energy * 1.5)),
    polarity: "FORWARD",
    derivedFrom: [
      "deriver:scale-space",
      evidence.ir.horizonPosition.evidenceRef,
      evidence.ir.symmetry.evidenceRef,
      evidence.pixel.focalCenterOffset.evidenceRef,
    ],
    confidence: round4(Math.min(scaleNode.confidence, space.confidence)),
  });

  // 12. VIEW ↔ AXIS: 视角与中轴的对齐张力（CENTER_EDGE）
  const viewNode = getNode("node:view:camera")!;
  relations.push({
    sourceId: viewNode.id,
    targetId: axis.id,
    relationType: "CENTER_EDGE",
    magnitude: round4(Math.min(1, viewNode.energy * axis.energy * 1.5)),
    polarity: "MUTUAL",
    derivedFrom: [
      "deriver:view-axis",
      evidence.ir.cameraPitch.evidenceRef,
      evidence.ir.symmetry.evidenceRef,
      evidence.ir.horizonPosition.evidenceRef,
    ],
    confidence: round4(Math.min(viewNode.confidence, axis.confidence)),
  });

  return { relations, unmeasured };
}

// ---------------------------------------------------------------------------
// 图哈希（确定性）
// ---------------------------------------------------------------------------

function computeGraphHash(nodes: AestheticNode[], relations: AestheticRelation[]): string {
  // 简单确定性哈希：拼接所有节点和关系的关键字段，然后用简单 hash
  // 不使用 crypto 以保持纯函数和可测试性
  const parts: string[] = [];
  for (const n of nodes) {
    parts.push(`${n.id}|${n.type}|${n.energy}|${n.confidence}`);
  }
  for (const r of relations) {
    parts.push(`${r.sourceId}|${r.targetId}|${r.relationType}|${r.magnitude}|${r.polarity}|${r.confidence}`);
  }
  const str = parts.join(";");

  // FNV-1a 哈希（32位，确定性）
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // 转为 16 进制字符串，补零到 8 位
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

// ---------------------------------------------------------------------------
// 主构建函数
// ---------------------------------------------------------------------------

/**
 * 从 ObservableEvidenceSet 构建 AestheticRelationshipGraph。
 *
 * @param evidence 可观测证据集（Step 2.2 产物）
 * @returns 美学关系图（确定性，字节级可复现）
 */
export function buildRelationshipGraph(evidence: ObservableEvidenceSet): AestheticRelationshipGraph {
  // Stage 1: 节点实例化
  const nodes = instantiateNodes(evidence);

  // Stage 2: 关系推导
  const { relations, unmeasured } = deriveRelations(evidence, nodes);

  // Stage 3: 拓扑不变量检验
  const topologyAudit = auditTopology(nodes, relations);

  // Stage 4: 图哈希
  const graphHash = computeGraphHash(nodes, relations);

  // 推导管线记录
  const derivationPipeline = [
    "instantiate:nodes:11-types",
    "derive:host-guest",
    "derive:solid-void",
    "derive:dense-sparse",
    "derive:center-edge",
    "derive:move-still",
    "derive:near-far",
    "derive:high-low",
    "derive:heavy-light",
    "derive:old-new",
    "derive:open-close",
    "audit:topology-invariants",
    "hash:fnv1a-deterministic",
  ];

  return {
    graphId: `graph:${evidence.evidenceId}`,
    evidenceId: evidence.evidenceId,
    generatedAt: evidence.capturedAt,
    nodes,
    relations,
    unmeasuredRelations: unmeasured,
    topologyAudit,
    graphHash,
    derivationPipeline,
  };
}
