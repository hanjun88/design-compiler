/**
 * 3.4-A: Aesthetic Intent → Operation Selector
 *
 * 零隐式规则映射：每个算子的入选必须且仅能由已声明的
 * principles 与 activeRelationships 双重激活。
 *
 * 不使用启发式猜测，不使用隐式默认，不使用"看起来相关"的模糊匹配。
 * 过滤条件不满足时，生成明确的 SKIPPED_REASON 记录。
 */

import type { DesignOperationId, OperationCategory } from "../operations/types";
import type { AestheticPrinciple, ActiveRelationship, AestheticIntentExtension } from "../intent/types";
import type { OperationSelectionRecord } from "./types";
import { OPERATION_CATEGORIES } from "../operations/types";

// ---------------------------------------------------------------------------
// 原则 → 算子映射（显式声明，零隐式）
// ---------------------------------------------------------------------------

/**
 * 美学原则到设计算子的显式映射表。
 * 每个原则必须显式声明它能驱动哪些算子，未声明的算子不会被此原则激活。
 */
const PRINCIPLE_TO_OPERATIONS: Record<AestheticPrinciple, DesignOperationId[]> = {
  // 计白当黑 → 呼吸场围合 + 大气留白注入
  COUNT_WHITE_AS_BLACK: ["OP_ENCLOSE_BREATHING_FIELD", "OP_INJECT_ATMOSPHERIC_VOID"],
  // 虚实相生 → 呼吸场围合 + 泊松簇分区
  VOID_SOLID_INTERPLAY: ["OP_ENCLOSE_BREATHING_FIELD", "OP_PARTITION_POISSON_CLUSTER"],
  // 宾主揖让 → 宾主张力对齐 + 轴向秩序校准
  GUEST_HOST_COMITY: ["OP_ALIGN_GUEST_HOST_TENSION", "OP_CALIBRATE_AXIAL_ORDER"],
  // 经营位置 → 轴向秩序校准 + 视平线比例偏移
  POSITION_MANAGEMENT: ["OP_CALIBRATE_AXIAL_ORDER", "OP_SHIFT_HORIZON_PROPORTION"],
  // 尺度气势 → 泊松簇分区 + 深度层次退晕
  SCALE_PROPORTION: ["OP_PARTITION_POISSON_CLUSTER", "OP_LAYER_DEPTH_RECESSION"],
  // 材质时间 → 岁月包浆应用 + 表面熵风化
  MATERIAL_PATINA: ["OP_APPLY_TIME_PATINA", "OP_WEATHER_SURFACE_ENTROPY"],
  // 光照天时 → 天空亮度协调 + 阴影色度冷却 + 雾气散射过滤
  LIGHT_TEMPORALITY: ["OP_HARMONIZE_SKY_LUMINANCE", "OP_COOL_SHADOW_CHROMATICITY", "OP_FILTER_MIST_SCATTER"],
  // 气韵贯通 → 深度层次退晕 + 雾气散射过滤 + 次主体遮挡框定
  QI_YUN_CONTINUITY: ["OP_LAYER_DEPTH_RECESSION", "OP_FILTER_MIST_SCATTER", "OP_FRAME_SECONDARY_OCCLUSION"],
};

// ---------------------------------------------------------------------------
// 关系 → 算子映射（显式声明，零隐式）
// ---------------------------------------------------------------------------

/**
 * 关系边类型到设计算子的显式映射表。
 * 每个关系类型必须显式声明它能触发哪些算子。
 */
const RELATION_TO_OPERATIONS: Record<string, DesignOperationId[]> = {
  // 虚实关系 → 呼吸场围合 + 大气留白注入
  SOLID_VOID: ["OP_ENCLOSE_BREATHING_FIELD", "OP_INJECT_ATMOSPHERIC_VOID"],
  // 宾主关系 → 宾主张力对齐
  HOST_GUEST: ["OP_ALIGN_GUEST_HOST_TENSION"],
  // 中心-边缘 → 轴向秩序校准
  CENTER_EDGE: ["OP_CALIBRATE_AXIAL_ORDER"],
  // 疏密关系 → 泊松簇分区
  DENSE_SPARSE: ["OP_PARTITION_POISSON_CLUSTER"],
  // 远近关系 → 深度层次退晕
  NEAR_FAR: ["OP_LAYER_DEPTH_RECESSION"],
  // 高低关系 → 天空亮度协调 + 强调亮度限制
  HIGH_LOW: ["OP_HARMONIZE_SKY_LUMINANCE", "OP_RESTRICT_ACCENT_LUMINANCE"],
  // 重轻关系 → 材质对比编排
  HEAVY_LIGHT: ["OP_ORCHESTRATE_MATERIAL_CONTRAST"],
  // 动静关系 → 雾气散射过滤
  MOVE_STILL: ["OP_FILTER_MIST_SCATTER"],
};

// ---------------------------------------------------------------------------
// 算子目标参数路径映射
// ---------------------------------------------------------------------------

/**
 * 每个算子的目标参数路径（用于冲突解析和参数变更追踪）。
 */
export const OPERATION_TARGET_PATH: Record<DesignOperationId, string> = {
  OP_ENCLOSE_BREATHING_FIELD: "scene.composition.negativeSpaceRatio",
  OP_ALIGN_GUEST_HOST_TENSION: "scene.composition.focalOffset",
  OP_PARTITION_POISSON_CLUSTER: "scene.composition.clusterDensity",
  OP_CALIBRATE_AXIAL_ORDER: "scene.composition.axialSymmetry",
  OP_LAYER_DEPTH_RECESSION: "scene.spatial.depthLayers",
  OP_INJECT_ATMOSPHERIC_VOID: "scene.spatial.atmosphericDensity",
  OP_SHIFT_HORIZON_PROPORTION: "scene.spatial.horizonPosition",
  OP_FRAME_SECONDARY_OCCLUSION: "scene.spatial.occlusionRatio",
  OP_APPLY_TIME_PATINA: "scene.material.patinaLevel",
  OP_DAMPEN_SPECULAR_HARSHNESS: "scene.material.specularSharpness",
  OP_ORCHESTRATE_MATERIAL_CONTRAST: "scene.material.contrastRatio",
  OP_WEATHER_SURFACE_ENTROPY: "scene.material.surfaceEntropy",
  OP_HARMONIZE_SKY_LUMINANCE: "scene.lighting.skyLuminance",
  OP_COOL_SHADOW_CHROMATICITY: "scene.lighting.shadowTemperature",
  OP_FILTER_MIST_SCATTER: "scene.lighting.mistDensity",
  OP_RESTRICT_ACCENT_LUMINANCE: "scene.lighting.accentLuminance",
};

// ---------------------------------------------------------------------------
// Operation Selector
// ---------------------------------------------------------------------------

/**
 * 基于 AestheticIntent 的 principles + activeRelationships 双重激活选择算子。
 *
 * 选择规则（零隐式）：
 * 1. 算子必须同时被至少一个激活原则 AND 至少一个激活关系映射
 * 2. 若算子只被原则映射但无对应激活关系 → SKIPPED（原因：缺少触发关系）
 * 3. 若算子只被关系映射但无对应激活原则 → SKIPPED（原因：缺少驱动原则）
 * 4. 若算子既无原则映射也无关系映射 → SKIPPED（原因：未在当前范式激活集中）
 *
 * @param intent AestheticIntentExtension（包含 principles 和 activeRelationships）
 * @returns 全部 16 个算子的选择记录（含未选中的跳过原因）
 */
export function selectOperationsFromIntent(
  intent: AestheticIntentExtension,
): OperationSelectionRecord[] {
  const { principles, activeRelationships } = intent;
  const allOpIds = Object.keys(OPERATION_CATEGORIES) as DesignOperationId[];

  // 构建激活关系类型集合
  const activeRelationTypes = new Set(activeRelationships.map((r) => r.relationType));

  const selections: OperationSelectionRecord[] = [];

  for (const opId of allOpIds) {
    const category = OPERATION_CATEGORIES[opId];

    // 检查哪些激活原则映射到此算子
    const matchingPrinciples = principles.filter((p) =>
      PRINCIPLE_TO_OPERATIONS[p]?.includes(opId),
    );

    // 检查哪些激活关系映射到此算子
    const matchingRelations = activeRelationships.filter((r) =>
      RELATION_TO_OPERATIONS[r.relationType]?.includes(opId),
    );

    if (matchingPrinciples.length > 0 && matchingRelations.length > 0) {
      // 双重激活：选中
      // 选择第一个匹配的原则和关系作为主要驱动（确定性：按 principles 数组顺序）
      const primaryPrinciple = matchingPrinciples[0];
      const primaryRelation = matchingRelations[0];
      const relationRef = `${primaryRelation.sourceId} --[${primaryRelation.relationType}]--> ${primaryRelation.targetId}`;

      selections.push({
        operationId: opId,
        category,
        selected: true,
        principleRef: primaryPrinciple,
        relationRef,
      });
    } else if (matchingPrinciples.length > 0 && matchingRelations.length === 0) {
      // 有原则但无关系
      const missingRelationTypes = Object.entries(RELATION_TO_OPERATIONS)
        .filter(([, ops]) => ops.includes(opId))
        .map(([relType]) => relType);
      selections.push({
        operationId: opId,
        category,
        selected: false,
        skippedReason: `PRINCIPLE_ACTIVE_BUT_RELATION_MISSING: needs one of [${missingRelationTypes.join(", ")}]`,
      });
    } else if (matchingPrinciples.length === 0 && matchingRelations.length > 0) {
      // 有关系但无原则
      selections.push({
        operationId: opId,
        category,
        selected: false,
        skippedReason: `RELATION_ACTIVE_BUT_PRINCIPLE_MISSING: no active principle maps to this operation`,
      });
    } else {
      // 既无原则也无关系
      selections.push({
        operationId: opId,
        category,
        selected: false,
        skippedReason: `NOT_IN_ACTIVATION_SET: no principle or relation maps to this operation`,
      });
    }
  }

  return selections;
}

/**
 * 获取选中的算子（过滤掉未选中的）。
 */
export function getSelectedOperations(
  selections: OperationSelectionRecord[],
): OperationSelectionRecord[] {
  return selections.filter((s) => s.selected);
}
