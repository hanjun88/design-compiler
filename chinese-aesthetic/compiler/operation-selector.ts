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
import type { ActiveRelationship, AestheticIntentExtension } from "../intent/types";
import { principleOperations, relationOperations } from "../grammar/design-grammar";
import type { OperationSelectionRecord } from "./types";
import { OPERATION_CATEGORIES } from "../operations/types";

// 原则 → 算子、关系 → 算子的显式映射表由 skill 的 sheet 决定（grammar/design-grammar.ts），
// 本文件只执行「原则 AND 关系」双重激活规则，不持有任何审美表。

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
  const PRINCIPLE_TO_OPERATIONS = principleOperations(intent.period);
  const RELATION_TO_OPERATIONS = relationOperations(intent.period);
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
