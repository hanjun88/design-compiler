/**
 * 16 个确定性设计算子实现
 *
 * 每个算子：
 * 1. 从 Relationship Graph 读取拓扑特征
 * 2. 代数推导变换量。激活阈值、增益、钳制边界、时代表等一切美学数值都来自
 *    AestheticConstraintSheet 的 OPERATION_POLICY（subject = 算子标识），经 DecisionPack 读取：
 *    本文件不定义任何美学数值，缺失即抛错（无本地默认值）
 * 3. 对 IR 深拷贝执行变换
 * 4. 返回变换结果 + 溯源 trace
 */

import type { RawDesignIR } from "../../compiler-core/contracts";
import { requireDecisionPack } from "../../skill-bridge/active-pack";
import type { PolicyView } from "../../skill-bridge/decision-pack";
import type {
  DesignOperation,
  DesignOperationContext,
  DesignOperationId,
  DesignOperationResult,
  OperationTrace,
} from "./types";
import {
  cloneIR,
  clamp,
  firstNode,
  firstRelation,
  hostGuestRatio,
  solidVoidMagnitude,
} from "./types";

// ===========================================================================
// 辅助
// ===========================================================================

/** 该算子在当前 AestheticConstraintSheet 中的决策：OPERATION_POLICY，subject = 算子标识。 */
function policyOf(ctx: DesignOperationContext, opId: DesignOperationId): PolicyView {
  return requireDecisionPack(ctx.period).policy("OPERATION_POLICY", opId);
}

const fixed3 = (v: number): string => v.toFixed(3); // ssot-ok(NUMERIC_GUARD): display precision of numbers in trace text, not a decision
const fixed1 = (v: number): string => v.toFixed(1); // ssot-ok(NUMERIC_GUARD): display precision of numbers in trace text, not a decision
const round4 = (v: number): number => Number(v.toFixed(4)); // ssot-ok(NUMERIC_GUARD): rounding precision of values written to the IR, not a decision
/** 比例 → 百分数（仅用于 trace 文本） */
const percent = (v: number): number => Math.round(v * 100);

// 归一化画幅的几何中心（焦点坐标 ∈ 归一化画幅）：几何定义，不是调参量
const FRAME_CENTER = 0.5;

// ssot-ok(PROTOCOL): contrast needs a dominant and a secondary material (array structure), not a tuning value
const MIN_CONTRAST_MATERIALS = 2;

// ===========================================================================
// 辅助：构造未应用 trace
// ===========================================================================

function notApplied(opId: string, rationale: string): OperationTrace {
  return {
    opId: opId as never,
    parameters: {},
    rationale,
    provenanceRef: "graph:no-matching-relation",
    applied: false,
  };
}

// ===========================================================================
// 构图算子 (Composition)
// ===========================================================================

/**
 * OP_ENCLOSE_BREATHING_FIELD
 * 当 SOLID_VOID 边张力不足、负空间包络破碎时，重构视口包络，
 * 聚合离散负空间为连通呼吸场。
 * 变换量 = (1 - solidVoidMagnitude) × 政策增益（由图推导）。
 * 负空间的上下界是该设计语境的有效频带（ADR-0001：negative_space_min/max 取自 sheet 的 $band），
 * 且升高类算子不会压低负空间：输入已高于频带上界时保持原值，交由修复规则处理。
 */
export function opEncloseBreathingField(ctx: DesignOperationContext): DesignOperationResult {
  const ir = cloneIR(ctx.ir);
  const policy = policyOf(ctx, "OP_ENCLOSE_BREATHING_FIELD");
  const svMag = solidVoidMagnitude(ctx.graph);
  const enclosedAt = policy.num("solid_void_enclosed_magnitude");

  if (svMag === null || svMag >= enclosedAt) {
    return {
      ir,
      trace: notApplied(
        "OP_ENCLOSE_BREATHING_FIELD",
        svMag === null
          ? "No SOLID_VOID relation in graph; breathing field enclosure not applicable."
          : `SOLID_VOID magnitude=${fixed3(svMag)} >= ${enclosedAt}; negative space already sufficiently enclosed.`,
      ),
    };
  }

  // 变换量由图推导：负空间不足程度 = 1 - svMag
  const enclosureDelta = (1 - svMag) * policy.num("enclosure_gain");
  const currentRatio = ir.composition.negativeSpaceRatio.value;
  const newRatio = Math.max(
    currentRatio,
    clamp(currentRatio + enclosureDelta, policy.num("negative_space_min"), policy.num("negative_space_max")),
  );

  ir.composition.negativeSpaceRatio.value = newRatio;

  return {
    ir,
    trace: {
      opId: "OP_ENCLOSE_BREATHING_FIELD",
      parameters: { enclosureDelta, oldRatio: currentRatio, newRatio },
      rationale: `SOLID_VOID magnitude=${fixed3(svMag)} indicates fragmented negative space. Enclosing breathing field by +${fixed3(enclosureDelta)}.`,
      provenanceRef: "graph:relation:SOLID_VOID",
      applied: true,
    },
  };
}

/**
 * OP_ALIGN_GUEST_HOST_TENSION
 * 当 HOST_GUEST 显著性比低于政策目标比时，缩放次要图元视度，
 * 向心重定向从属物象朝向矢量。
 * 变换量由 (目标比 - 当前比) / 目标比 推导（由图推导）
 */
export function opAlignGuestHostTension(ctx: DesignOperationContext): DesignOperationResult {
  const ir = cloneIR(ctx.ir);
  const policy = policyOf(ctx, "OP_ALIGN_GUEST_HOST_TENSION");
  const ratio = hostGuestRatio(ctx.graph);
  const targetRatio = policy.num("target_ratio");

  if (ratio === null || ratio >= targetRatio) {
    return {
      ir,
      trace: notApplied(
        "OP_ALIGN_GUEST_HOST_TENSION",
        ratio === null
          ? "No HOST_GUEST relation in graph; tension alignment not applicable."
          : `HOST_GUEST ratio=${fixed3(ratio)} >= ${targetRatio}; hierarchy already sufficiently differentiated.`,
      ),
    };
  }

  // 焦点向心偏移量由主客比推导
  const centeringFactor = (targetRatio - ratio) / targetRatio;
  const currentFocal = ir.composition.focalPoint.value;
  const pull = 1 - centeringFactor * policy.num("centering_strength");
  const centerX = FRAME_CENTER - (FRAME_CENTER - currentFocal[0]) * pull;
  const centerY = FRAME_CENTER - (FRAME_CENTER - currentFocal[1]) * pull;

  ir.composition.focalPoint.value = [round4(centerX), round4(centerY)];

  return {
    ir,
    trace: {
      opId: "OP_ALIGN_GUEST_HOST_TENSION",
      targetNodeId: "node:subject:primary",
      parameters: { hostGuestRatio: ratio, centeringFactor, oldFocal: currentFocal, newFocal: [centerX, centerY] },
      rationale: `HOST_GUEST ratio=${fixed3(ratio)} < ${targetRatio}. Centering focal point by factor ${fixed3(centeringFactor)} to reinforce host dominance.`,
      provenanceRef: "graph:relation:HOST_GUEST",
      applied: true,
    },
  };
}

/**
 * OP_PARTITION_POISSON_CLUSTER
 * 当局部方差呈现均质分布（DENSE_SPARSE 边强度低）时，
 * 依据泊松圆盘采样生成疏密两极对比分区。
 * 变换量 = 1 - denseSparseMagnitude
 */
export function opPartitionPoissonCluster(ctx: DesignOperationContext): DesignOperationResult {
  const ir = cloneIR(ctx.ir);
  const policy = policyOf(ctx, "OP_PARTITION_POISSON_CLUSTER");
  const ds = firstRelation(ctx.graph, "DENSE_SPARSE");
  const contrastAt = policy.num("dense_sparse_contrast_magnitude");

  if (!ds || ds.magnitude >= contrastAt) {
    return {
      ir,
      trace: notApplied(
        "OP_PARTITION_POISSON_CLUSTER",
        !ds
          ? "No DENSE_SPARSE relation; partition not applicable."
          : `DENSE_SPARSE magnitude=${fixed3(ds.magnitude)} >= ${contrastAt}; density contrast already present.`,
      ),
    };
  }

  // 疏密对比不足程度决定对称度调整
  const partitionStrength = 1 - ds.magnitude;
  const currentSymmetry = ir.composition.symmetry.value;
  // 疏密对比需要适度降低中轴对称，引入不对称聚散
  const symmetryReduction = partitionStrength * policy.num("symmetry_reduction_gain");
  const newSymmetry = clamp(
    currentSymmetry - symmetryReduction,
    policy.num("symmetry_min"),
    policy.num("symmetry_max"),
  );

  ir.composition.symmetry.value = round4(newSymmetry);

  return {
    ir,
    trace: {
      opId: "OP_PARTITION_POISSON_CLUSTER",
      parameters: { denseSparseMagnitude: ds.magnitude, partitionStrength, oldSymmetry: currentSymmetry, newSymmetry },
      rationale: `DENSE_SPARSE magnitude=${fixed3(ds.magnitude)} indicates homogeneous distribution. Applying Poisson cluster partition, reducing symmetry by ${fixed3(symmetryReduction)}.`,
      provenanceRef: "graph:relation:DENSE_SPARSE",
      applied: true,
    },
  };
}

/**
 * OP_CALIBRATE_AXIAL_ORDER
 * 当所处时代的政策启用中轴校准（雄浑巨构范式）且中轴对称度低于政策目标时，
 * 将对称度低的主体构件沿主轴镜像校准。
 * 变换量 = 目标对称度 - currentSymmetry（由范式法典推导）
 */
export function opCalibrateAxialOrder(ctx: DesignOperationContext): DesignOperationResult {
  const ir = cloneIR(ctx.ir);
  const policy = policyOf(ctx, "OP_CALIBRATE_AXIAL_ORDER");

  // 范式法典：中轴校准是否适用于该时代，由 sheet 按时代决议
  if (!policy.flag("applies_to_period")) {
    return {
      ir,
      trace: notApplied(
        "OP_CALIBRATE_AXIAL_ORDER",
        `Period=${ctx.period}; axial calibration is not enabled for this period by the aesthetic policy.`,
      ),
    };
  }

  const targetSymmetry = policy.num("axial_symmetry_target");
  const currentSymmetry = ir.composition.symmetry.value;
  if (currentSymmetry >= targetSymmetry) {
    return {
      ir,
      trace: notApplied(
        "OP_CALIBRATE_AXIAL_ORDER",
        `${ctx.period} symmetry=${fixed3(currentSymmetry)} >= ${targetSymmetry}; axial order already calibrated.`,
      ),
    };
  }

  const calibrationDelta = targetSymmetry - currentSymmetry;
  ir.composition.symmetry.value = targetSymmetry;

  return {
    ir,
    trace: {
      opId: "OP_CALIBRATE_AXIAL_ORDER",
      parameters: { oldSymmetry: currentSymmetry, newSymmetry: targetSymmetry, calibrationDelta },
      rationale: `${ctx.period} paradigm requires central-axis symmetry >= ${targetSymmetry}. Current=${fixed3(currentSymmetry)}, calibrating by +${fixed3(calibrationDelta)}.`,
      provenanceRef: `grammar:period:${ctx.period}:axial-order`,
      applied: true,
    },
  };
}

// ===========================================================================
// 空间算子 (Spatial)
// ===========================================================================

/**
 * OP_LAYER_DEPTH_RECESSION
 * 当远近进深缺少介质过渡（NEAR_FAR 未测量或强度低）时，
 * 按大气透视消光系数插入阶梯式空间层次分界。
 * 变换量 = depthLayerCount 由范式法典推导
 */
export function opLayerDepthRecession(ctx: DesignOperationContext): DesignOperationResult {
  const ir = cloneIR(ctx.ir);
  const policy = policyOf(ctx, "OP_LAYER_DEPTH_RECESSION");
  const nearFar = firstRelation(ctx.graph, "NEAR_FAR");
  const unmeasuredNearFar = ctx.graph.unmeasuredRelations.find((r) => r.relationType === "NEAR_FAR");

  // 范式法典：不同时代的进深层数偏好（sheet 按时代决议）
  const targetLayers = policy.num("target_layers");
  const presentAt = policy.num("near_far_present_magnitude");

  if (nearFar && nearFar.magnitude >= presentAt && !unmeasuredNearFar) {
    return {
      ir,
      trace: notApplied(
        "OP_LAYER_DEPTH_RECESSION",
        `NEAR_FAR magnitude=${fixed3(nearFar.magnitude)} >= ${presentAt}; depth recession already present.`,
      ),
    };
  }

  const currentLayers = ir.composition.depthLayerCount.value;
  if (currentLayers >= targetLayers) {
    return {
      ir,
      trace: notApplied(
        "OP_LAYER_DEPTH_RECESSION",
        `Current depth layers=${currentLayers} >= ${ctx.period} target=${targetLayers}; recession already sufficient.`,
      ),
    };
  }

  ir.composition.depthLayerCount.value = targetLayers;

  return {
    ir,
    trace: {
      opId: "OP_LAYER_DEPTH_RECESSION",
      parameters: { oldLayers: currentLayers, newLayers: targetLayers, period: ctx.period },
      rationale: unmeasuredNearFar
        ? `NEAR_FAR is UNMEASURED (no depth buffer). Setting ${ctx.period} canonical depth layers=${targetLayers} for atmospheric recession.`
        : `NEAR_FAR magnitude low. Setting ${ctx.period} canonical depth layers=${targetLayers}.`,
      provenanceRef: unmeasuredNearFar ? unmeasuredNearFar.semanticInterpretationRef : "graph:relation:NEAR_FAR",
      applied: true,
    },
  };
}

/**
 * OP_INJECT_ATMOSPHERIC_VOID
 * 当景深边缘硬切（BOUNDARY 节点能量过高），缺少空间呼吸带时，
 * 在前中景交界处生成基于深度梯度的介质消光带。
 * 变换量 = boundaryEnergy（由图推导）
 */
export function opInjectAtmosphericVoid(ctx: DesignOperationContext): DesignOperationResult {
  const ir = cloneIR(ctx.ir);
  const policy = policyOf(ctx, "OP_INJECT_ATMOSPHERIC_VOID");
  const boundaryEnergy = firstNode(ctx.graph, "BOUNDARY")?.energy ?? 0;
  const edgesAt = policy.num("boundary_energy_min");

  if (boundaryEnergy < edgesAt) {
    return {
      ir,
      trace: notApplied(
        "OP_INJECT_ATMOSPHERIC_VOID",
        `BOUNDARY node energy=${fixed3(boundaryEnergy)} < ${edgesAt}; no hard depth edges to soften.`,
      ),
    };
  }

  // 边界能量越高，需要越多的大气消光（提升 ambientRatio 模拟介质散射）
  const atmosphericFactor = boundaryEnergy * policy.num("ambient_gain");
  const currentAmbient = ir.lighting.ambientRatio.value;
  const newAmbient = clamp(currentAmbient + atmosphericFactor, policy.num("ambient_min"), policy.num("ambient_max"));

  ir.lighting.ambientRatio.value = round4(newAmbient);

  return {
    ir,
    trace: {
      opId: "OP_INJECT_ATMOSPHERIC_VOID",
      parameters: { boundaryEnergy, atmosphericFactor, oldAmbient: currentAmbient, newAmbient },
      rationale: `BOUNDARY energy=${fixed3(boundaryEnergy)} indicates hard depth edges. Injecting atmospheric void by +${fixed3(atmosphericFactor)} ambient ratio.`,
      provenanceRef: "graph:node:boundary:edges",
      applied: true,
    },
  };
}

/**
 * OP_SHIFT_HORIZON_PROPORTION
 * 当视平线高度落入平庸区间（相机俯仰角接近水平，|angle| 不超过政策平庸带）时，
 * 依据范式压低（虫眼仰角）或抬高（俯瞰苍茫）视点。
 * 变换量由范式法典推导
 */
export function opShiftHorizonProportion(ctx: DesignOperationContext): DesignOperationResult {
  const ir = cloneIR(ctx.ir);
  const policy = policyOf(ctx, "OP_SHIFT_HORIZON_PROPORTION");
  // camera.angle 代表俯仰角，负值=仰视，正值=俯视
  const currentAngle = ir.camera.angle.value;

  // 范式法典：视平线偏好（sheet 按时代决议）
  const targetAngle = policy.num("target_angle");
  const mediocreBand = policy.num("mediocre_angle_band");

  // 检查是否在平庸区间（角度接近水平）
  if (Math.abs(currentAngle) > mediocreBand) {
    return {
      ir,
      trace: notApplied(
        "OP_SHIFT_HORIZON_PROPORTION",
        `Current camera angle=${fixed1(currentAngle)}° outside mediocre range [−${mediocreBand}°, +${mediocreBand}°]; horizon already expressive.`,
      ),
    };
  }

  ir.camera.angle.value = targetAngle;

  return {
    ir,
    trace: {
      opId: "OP_SHIFT_HORIZON_PROPORTION",
      parameters: { oldAngle: currentAngle, newAngle: targetAngle, period: ctx.period },
      rationale: `Camera angle=${fixed1(currentAngle)}° in mediocre range. Shifting to ${ctx.period} canonical horizon angle=${targetAngle}°.`,
      provenanceRef: `grammar:period:${ctx.period}:horizon`,
      applied: true,
    },
  };
}

/**
 * OP_FRAME_SECONDARY_OCCLUSION
 * 当边缘穿帮（构图无含蓄收敛感，OPEN_CLOSE 边强度低）时，
 * 调取前景配景建立边框局部裁切。
 * 变换量 = 1 - openCloseMagnitude
 * 负空间的上下界是该设计语境的有效频带（ADR-0001：negative_space_min/max 取自 sheet 的 $band），
 * 且压低类算子不会抬高负空间：输入已低于频带下界时保持原值，交由修复规则处理。
 */
export function opFrameSecondaryOcclusion(ctx: DesignOperationContext): DesignOperationResult {
  const ir = cloneIR(ctx.ir);
  const policy = policyOf(ctx, "OP_FRAME_SECONDARY_OCCLUSION");
  const oc = firstRelation(ctx.graph, "OPEN_CLOSE");
  const containedAt = policy.num("open_close_contained_magnitude");

  if (!oc || oc.magnitude >= containedAt) {
    return {
      ir,
      trace: notApplied(
        "OP_FRAME_SECONDARY_OCCLUSION",
        !oc
          ? "No OPEN_CLOSE relation; framing not applicable."
          : `OPEN_CLOSE magnitude=${fixed3(oc.magnitude)} >= ${containedAt}; composition already contained.`,
      ),
    };
  }

  // 开放度越高，需要越多的前景遮挡（遮挡量上限即政策增益）
  const framingGain = policy.num("framing_gain");
  const framingFactor = (1 - oc.magnitude) * framingGain;
  const currentNegative = ir.composition.negativeSpaceRatio.value;
  // 前景遮挡压缩负空间感知
  const compression = policy.num("negative_space_compression");
  const newNegative = Math.min(
    currentNegative,
    clamp(currentNegative - framingFactor * compression, policy.num("negative_space_min"), policy.num("negative_space_max")),
  );

  ir.composition.negativeSpaceRatio.value = round4(newNegative);

  return {
    ir,
    trace: {
      opId: "OP_FRAME_SECONDARY_OCCLUSION",
      parameters: { openCloseMagnitude: oc.magnitude, framingFactor, oldNegative: currentNegative, newNegative },
      rationale: `OPEN_CLOSE magnitude=${fixed3(oc.magnitude)} indicates unframed composition. Adding secondary occlusion framing (≤${percent(framingGain)}%), adjusting negative space by -${fixed3(framingFactor * compression)}.`,
      provenanceRef: "graph:relation:OPEN_CLOSE",
      applied: true,
    },
  };
}

// ===========================================================================
// 材质算子 (Material)
// ===========================================================================

/**
 * OP_APPLY_TIME_PATINA
 * 当材质均质平整（MATERIAL 节点能量低，微表面高频方差接近 0）时，
 * 叠加物理风化/磨损层，向 Roughness 注入分形噪点。
 * 变换量 = 1 - materialEnergy（由图推导）
 */
export function opApplyTimePatina(ctx: DesignOperationContext): DesignOperationResult {
  const ir = cloneIR(ctx.ir);
  const policy = policyOf(ctx, "OP_APPLY_TIME_PATINA");
  const material = firstNode(ctx.graph, "MATERIAL");
  const materialEnergy = material?.energy ?? 0;
  const variedAt = policy.num("material_energy_varied");

  if (materialEnergy >= variedAt) {
    return {
      ir,
      trace: notApplied(
        "OP_APPLY_TIME_PATINA",
        `MATERIAL node energy=${fixed3(materialEnergy)} >= ${variedAt}; surface already has sufficient variation.`,
      ),
    };
  }

  // 材质能量越低，需要越多的风化包浆
  const patinaFactor = (1 - materialEnergy) * policy.num("patina_gain");
  const dominantMat = ir.materials.find((m) => m.role === "dominant") || ir.materials[0];
  if (!dominantMat) {
    return { ir, trace: notApplied("OP_APPLY_TIME_PATINA", "No dominant material in IR.") };
  }

  const roughnessDelta = patinaFactor * policy.num("roughness_gain");
  const wearDelta = patinaFactor * policy.num("wear_gain");
  const oldRoughness = dominantMat.roughness.value;
  const oldWear = dominantMat.wear.value;
  const newRoughness = clamp(oldRoughness + roughnessDelta, policy.num("roughness_min"), policy.num("roughness_max"));
  const newWear = clamp(oldWear + wearDelta, policy.num("wear_min"), policy.num("wear_max"));

  dominantMat.roughness.value = round4(newRoughness);
  dominantMat.wear.value = round4(newWear);

  return {
    ir,
    trace: {
      opId: "OP_APPLY_TIME_PATINA",
      targetNodeId: material?.id,
      parameters: { materialEnergy, patinaFactor, oldRoughness, newRoughness, oldWear, newWear },
      rationale: `MATERIAL energy=${fixed3(materialEnergy)} indicates homogeneous surface. Applying time patina: roughness +${fixed3(roughnessDelta)}, wear +${fixed3(wearDelta)}.`,
      provenanceRef: "graph:node:material:dominant",
      applied: true,
    },
  };
}

/**
 * OP_DAMPEN_SPECULAR_HARSHNESS
 * 当观测高光过渡极陡（MATERIAL-HEAVY_LIGHT 边强度高），
 * 触碰塑料质感边缘时，钳制高光反射能量锐度。
 * 变换量 = heavyLightMagnitude（由图推导）
 */
export function opDampenSpecularHarshness(ctx: DesignOperationContext): DesignOperationResult {
  const ir = cloneIR(ctx.ir);
  const policy = policyOf(ctx, "OP_DAMPEN_SPECULAR_HARSHNESS");
  const hl = firstRelation(ctx.graph, "HEAVY_LIGHT");
  const harshAt = policy.num("heavy_light_harsh_magnitude");

  if (!hl || hl.magnitude < harshAt) {
    return {
      ir,
      trace: notApplied(
        "OP_DAMPEN_SPECULAR_HARSHNESS",
        !hl
          ? "No HEAVY_LIGHT relation; specular dampening not applicable."
          : `HEAVY_LIGHT magnitude=${fixed3(hl.magnitude)} < ${harshAt}; specular transition already soft.`,
      ),
    };
  }

  // 重光强度越高，需要提升 softness（降低高光锐度）
  const dampenFactor = hl.magnitude * policy.num("dampen_gain");
  const currentSoftness = ir.lighting.keyLight.softness.value;
  const newSoftness = clamp(currentSoftness + dampenFactor, policy.num("softness_min"), policy.num("softness_max"));

  ir.lighting.keyLight.softness.value = round4(newSoftness);

  return {
    ir,
    trace: {
      opId: "OP_DAMPEN_SPECULAR_HARSHNESS",
      parameters: { heavyLightMagnitude: hl.magnitude, dampenFactor, oldSoftness: currentSoftness, newSoftness },
      rationale: `HEAVY_LIGHT magnitude=${fixed3(hl.magnitude)} indicates harsh specular transition. Dampening by increasing softness +${fixed3(dampenFactor)}.`,
      provenanceRef: "graph:relation:HEAVY_LIGHT",
      applied: true,
    },
  };
}

/**
 * OP_ORCHESTRATE_MATERIAL_CONTRAST
 * 当金石木质混杂、质感无主从阶梯（多 MATERIAL 节点能量接近）时，
 * 依据时代法典重构材质粗糙度阶梯。
 * 变换量由范式法典推导
 */
export function opOrchestrateMaterialContrast(ctx: DesignOperationContext): DesignOperationResult {
  const ir = cloneIR(ctx.ir);
  const policy = policyOf(ctx, "OP_ORCHESTRATE_MATERIAL_CONTRAST");

  if (ir.materials.length < MIN_CONTRAST_MATERIALS) {
    return {
      ir,
      trace: notApplied(
        "OP_ORCHESTRATE_MATERIAL_CONTRAST",
        `Only ${ir.materials.length} material(s) in IR; contrast orchestration requires >= ${MIN_CONTRAST_MATERIALS} materials.`,
      ),
    };
  }

  // 范式法典：材质粗糙度阶梯偏好（sheet 按时代决议）
  const lowTarget = policy.num("roughness_low_target");
  const highTarget = policy.num("roughness_high_target");

  const dominant = ir.materials.find((m) => m.role === "dominant") || ir.materials[0];
  const secondary = ir.materials.find((m) => m.role === "secondary") || ir.materials[1];

  const oldDomRough = dominant.roughness.value;
  const oldSecRough = secondary.roughness.value;
  const currentSpread = Math.abs(oldDomRough - oldSecRough);
  const targetSpread = highTarget - lowTarget;
  const satisfiedSpread = targetSpread * policy.num("spread_satisfied_fraction");

  if (currentSpread >= satisfiedSpread) {
    return {
      ir,
      trace: notApplied(
        "OP_ORCHESTRATE_MATERIAL_CONTRAST",
        `Current roughness spread=${fixed3(currentSpread)} >= ${fixed3(satisfiedSpread)} (${ctx.period} target=${targetSpread}); contrast already orchestrated.`,
      ),
    };
  }

  dominant.roughness.value = lowTarget;
  secondary.roughness.value = highTarget;

  return {
    ir,
    trace: {
      opId: "OP_ORCHESTRATE_MATERIAL_CONTRAST",
      parameters: { period: ctx.period, oldDomRough, oldSecRough, newDomRough: lowTarget, newSecRough: highTarget, targetSpread },
      rationale: `${ctx.period} material roughness spread target=${fixed3(targetSpread)}. Current=${fixed3(currentSpread)}. Orchestrating dominant→${lowTarget}, secondary→${highTarget}.`,
      provenanceRef: `grammar:period:${ctx.period}:material-contrast`,
      applied: true,
    },
  };
}

/**
 * OP_WEATHER_SURFACE_ENTROPY
 * 当人工痕迹过重（TIME 节点能量低，缺乏自然风化熵）时，
 * 在法线贴图高频带引入微小凹凸与侵蚀扰动。
 * 变换量 = 1 - timeEnergy（由图推导）
 */
export function opWeatherSurfaceEntropy(ctx: DesignOperationContext): DesignOperationResult {
  const ir = cloneIR(ctx.ir);
  const policy = policyOf(ctx, "OP_WEATHER_SURFACE_ENTROPY");
  const timeNode = firstNode(ctx.graph, "TIME");
  const timeEnergy = timeNode?.energy ?? 0;
  const weatheredAt = policy.num("time_energy_weathered");

  if (timeEnergy >= weatheredAt) {
    return {
      ir,
      trace: notApplied(
        "OP_WEATHER_SURFACE_ENTROPY",
        `TIME node energy=${fixed3(timeEnergy)} >= ${weatheredAt}; surface already shows natural weathering traces.`,
      ),
    };
  }

  // 时间能量越低，需要越多的表面侵蚀（提升 wear）
  const entropyFactor = (1 - timeEnergy) * policy.num("entropy_gain");
  const dominantMat = ir.materials.find((m) => m.role === "dominant") || ir.materials[0];
  if (!dominantMat) {
    return { ir, trace: notApplied("OP_WEATHER_SURFACE_ENTROPY", "No dominant material in IR.") };
  }

  const oldWear = dominantMat.wear.value;
  const newWear = clamp(oldWear + entropyFactor, policy.num("wear_min"), policy.num("wear_max"));

  dominantMat.wear.value = round4(newWear);

  return {
    ir,
    trace: {
      opId: "OP_WEATHER_SURFACE_ENTROPY",
      targetNodeId: timeNode?.id,
      parameters: { timeEnergy, entropyFactor, oldWear, newWear },
      rationale: `TIME energy=${fixed3(timeEnergy)} indicates overly pristine surface. Weathering entropy: wear +${fixed3(entropyFactor)}.`,
      provenanceRef: "graph:node:time:patina",
      applied: true,
    },
  };
}

// ===========================================================================
// 光影算子 (Lighting)
// ===========================================================================

/**
 * OP_HARMONIZE_SKY_LUMINANCE
 * 当人工光源过多、光源方向多向冲突（LIGHT 节点多入射方向）时，
 * 统一消减补光能量，将天光确立为唯一主源。
 * 变换量 = 光能量超出冲突阈值的部分 × 政策增益（由图推导）
 */
export function opHarmonizeSkyLuminance(ctx: DesignOperationContext): DesignOperationResult {
  const ir = cloneIR(ctx.ir);
  const policy = policyOf(ctx, "OP_HARMONIZE_SKY_LUMINANCE");
  const lightNode = firstNode(ctx.graph, "LIGHT");

  if (!lightNode) {
    return { ir, trace: notApplied("OP_HARMONIZE_SKY_LUMINANCE", "No LIGHT nodes in graph.") };
  }

  const lightEnergy = lightNode.energy;
  const conflictAt = policy.num("light_energy_conflict");
  // 光能量过高且 rimLight 存在时，消减补光
  if (lightEnergy < conflictAt || !ir.lighting.rimLightPresent.value) {
    return {
      ir,
      trace: notApplied(
        "OP_HARMONIZE_SKY_LUMINANCE",
        `LIGHT energy=${fixed3(lightEnergy)}, rimLight=${ir.lighting.rimLightPresent.value}. Sky harmonization not needed.`,
      ),
    };
  }

  // 高能量多光源时，关闭 rim light 并降低 intensity，统一天光
  const oldIntensity = ir.lighting.keyLight.intensity.value;
  const harmonizeFactor = (lightEnergy - conflictAt) * policy.num("harmonize_gain");
  const newIntensity = clamp(oldIntensity - harmonizeFactor, policy.num("intensity_min"), policy.num("intensity_max"));

  ir.lighting.rimLightPresent.value = false;
  ir.lighting.keyLight.intensity.value = round4(newIntensity);

  return {
    ir,
    trace: {
      opId: "OP_HARMONIZE_SKY_LUMINANCE",
      parameters: { lightEnergy, harmonizeFactor, oldIntensity, newIntensity, rimLightRemoved: true },
      rationale: `LIGHT energy=${fixed3(lightEnergy)} with rimLight present indicates multi-source conflict. Harmonizing to sky-only: removing rim light, reducing intensity by -${fixed3(harmonizeFactor)}.`,
      provenanceRef: "graph:node:light:luminance-field",
      applied: true,
    },
  };
}

/**
 * OP_COOL_SHADOW_CHROMATICITY
 * 当阴影区域死黑或无环境色彩反应（HIGH_LOW 边强度低）时，
 * 在几何背光面注入环境色漫反射（天青/冷黛）。
 * 变换量 = 1 - highLowMagnitude（由图推导）
 */
export function opCoolShadowChromaticity(ctx: DesignOperationContext): DesignOperationResult {
  const ir = cloneIR(ctx.ir);
  const policy = policyOf(ctx, "OP_COOL_SHADOW_CHROMATICITY");
  const hl = firstRelation(ctx.graph, "HIGH_LOW");
  const differentiatedAt = policy.num("high_low_differentiated_magnitude");

  if (!hl || hl.magnitude >= differentiatedAt) {
    return {
      ir,
      trace: notApplied(
        "OP_COOL_SHADOW_CHROMATICITY",
        !hl
          ? "No HIGH_LOW relation; shadow chromaticity not applicable."
          : `HIGH_LOW magnitude=${fixed3(hl.magnitude)} >= ${differentiatedAt}; shadows already have light/shadow differentiation.`,
      ),
    };
  }

  // 高低光对比不足时，提升 ambientRatio（模拟环境色漫反射填充阴影）
  const shadowFactor = (1 - hl.magnitude) * policy.num("shadow_gain");
  const currentAmbient = ir.lighting.ambientRatio.value;
  const newAmbient = clamp(currentAmbient + shadowFactor, policy.num("ambient_min"), policy.num("ambient_max"));

  ir.lighting.ambientRatio.value = round4(newAmbient);

  return {
    ir,
    trace: {
      opId: "OP_COOL_SHADOW_CHROMATICITY",
      parameters: { highLowMagnitude: hl.magnitude, shadowFactor, oldAmbient: currentAmbient, newAmbient },
      rationale: `HIGH_LOW magnitude=${fixed3(hl.magnitude)} indicates dead shadows. Injecting cool ambient chromaticity by +${fixed3(shadowFactor)}.`,
      provenanceRef: "graph:relation:HIGH_LOW",
      applied: true,
    },
  };
}

/**
 * OP_FILTER_MIST_SCATTER
 * 当光束过硬过利（LIGHT 节点能量高 + SOFTNESS 低），
 * 缺少东方烟雨意境时，沿主光照矢量路径激活丁达尔体积散射。
 * 变换量由 lightEnergy 和 softness 联合推导
 */
export function opFilterMistScatter(ctx: DesignOperationContext): DesignOperationResult {
  const ir = cloneIR(ctx.ir);
  const policy = policyOf(ctx, "OP_FILTER_MIST_SCATTER");
  const lightEnergy = firstNode(ctx.graph, "LIGHT")?.energy ?? 0;
  const currentSoftness = ir.lighting.keyLight.softness.value;
  const energyMin = policy.num("hard_light_energy_min");
  const softnessMax = policy.num("hard_light_softness_max");

  // 硬光条件：高能量 + 低柔和度
  if (!(lightEnergy >= energyMin && currentSoftness < softnessMax)) {
    return {
      ir,
      trace: notApplied(
        "OP_FILTER_MIST_SCATTER",
        `lightEnergy=${fixed3(lightEnergy)}, softness=${fixed3(currentSoftness)}. Mist scatter requires high energy (>=${energyMin}) + low softness (<${softnessMax}).`,
      ),
    };
  }

  // 硬光程度决定散射强度
  const hardness = lightEnergy * (1 - currentSoftness);
  const scatterFactor = hardness * policy.num("scatter_gain");
  const ambientScatter = scatterFactor * policy.num("ambient_scatter_fraction");
  const newSoftness = clamp(currentSoftness + scatterFactor, policy.num("softness_min"), policy.num("softness_max"));
  const newAmbient = clamp(ir.lighting.ambientRatio.value + ambientScatter, policy.num("ambient_min"), policy.num("ambient_max"));

  ir.lighting.keyLight.softness.value = round4(newSoftness);
  ir.lighting.ambientRatio.value = round4(newAmbient);

  return {
    ir,
    trace: {
      opId: "OP_FILTER_MIST_SCATTER",
      parameters: { lightEnergy, currentSoftness, hardness, scatterFactor, newSoftness, newAmbient },
      rationale: `Hard light detected (energy=${fixed3(lightEnergy)}, softness=${fixed3(currentSoftness)}). Applying mist scatter: softness +${fixed3(scatterFactor)}, ambient +${fixed3(ambientScatter)}.`,
      provenanceRef: "graph:node:light:luminance-field",
      applied: true,
    },
  };
}

/**
 * OP_RESTRICT_ACCENT_LUMINANCE
 * 当点缀光源（如烛火）面积失控（ACCENT 色占比过高）时，
 * 强制点缀高光区域连通面积占比不超过政策上限。
 * 变换量 = accentStrength 超出代理上限的部分（由图推导）
 */
export function opRestrictAccentLuminance(ctx: DesignOperationContext): DesignOperationResult {
  const ir = cloneIR(ctx.ir);
  const policy = policyOf(ctx, "OP_RESTRICT_ACCENT_LUMINANCE");
  const accentLimit = policy.num("accent_area_limit");

  // 从 IR color 域无法直接获取 accent 面积占比，使用 temperatureBias 作为点缀光强度代理
  // 高色温偏移 + 高 intensity 组合暗示点缀光过强
  const tempBias = ir.color.temperatureBias.value;
  const intensity = ir.lighting.keyLight.intensity.value;

  // 点缀光过强条件：暖色温偏移（正 bias 偏暖=烛光）+ 高 intensity
  const accentStrength = Math.max(0, tempBias) * intensity;
  // 面积占比上限换算到强度代理量纲
  const strengthLimit = accentLimit * policy.num("accent_proxy_scale");

  if (accentStrength <= strengthLimit) {
    return {
      ir,
      trace: notApplied(
        "OP_RESTRICT_ACCENT_LUMINANCE",
        `accentStrength=${fixed3(accentStrength)} within bounds. Accent luminance restriction not needed.`,
      ),
    };
  }

  const reductionFactor = (accentStrength - strengthLimit) / accentStrength;
  const reductionGain = policy.num("intensity_reduction_gain");
  const newIntensity = clamp(
    intensity * (1 - reductionFactor * reductionGain),
    policy.num("intensity_min"),
    policy.num("intensity_max"),
  );

  ir.lighting.keyLight.intensity.value = round4(newIntensity);

  return {
    ir,
    trace: {
      opId: "OP_RESTRICT_ACCENT_LUMINANCE",
      parameters: { accentStrength, reductionFactor, oldIntensity: intensity, newIntensity, accentLimit },
      rationale: `Accent luminance strength=${fixed3(accentStrength)} exceeds limit. Restricting key light intensity by -${fixed1(reductionFactor * reductionGain * 100)}%.`,
      provenanceRef: "ir:color:temperatureBias + ir:lighting:intensity",
      applied: true,
    },
  };
}

// ===========================================================================
// 算子注册表
// ===========================================================================

export const DESIGN_OPERATIONS: Record<DesignOperationId, DesignOperation> = {
  OP_ENCLOSE_BREATHING_FIELD: opEncloseBreathingField,
  OP_ALIGN_GUEST_HOST_TENSION: opAlignGuestHostTension,
  OP_PARTITION_POISSON_CLUSTER: opPartitionPoissonCluster,
  OP_CALIBRATE_AXIAL_ORDER: opCalibrateAxialOrder,
  OP_LAYER_DEPTH_RECESSION: opLayerDepthRecession,
  OP_INJECT_ATMOSPHERIC_VOID: opInjectAtmosphericVoid,
  OP_SHIFT_HORIZON_PROPORTION: opShiftHorizonProportion,
  OP_FRAME_SECONDARY_OCCLUSION: opFrameSecondaryOcclusion,
  OP_APPLY_TIME_PATINA: opApplyTimePatina,
  OP_DAMPEN_SPECULAR_HARSHNESS: opDampenSpecularHarshness,
  OP_ORCHESTRATE_MATERIAL_CONTRAST: opOrchestrateMaterialContrast,
  OP_WEATHER_SURFACE_ENTROPY: opWeatherSurfaceEntropy,
  OP_HARMONIZE_SKY_LUMINANCE: opHarmonizeSkyLuminance,
  OP_COOL_SHADOW_CHROMATICITY: opCoolShadowChromaticity,
  OP_FILTER_MIST_SCATTER: opFilterMistScatter,
  OP_RESTRICT_ACCENT_LUMINANCE: opRestrictAccentLuminance,
};

/**
 * 按顺序执行全部 16 个算子，返回累积变换结果和所有 trace。
 * 每个算子接收前一个算子的输出作为输入，形成确定性变换链。
 */
export function applyAllOperations(ctx: DesignOperationContext): {
  ir: RawDesignIR;
  traces: OperationTrace[];
} {
  let currentIR = cloneIR(ctx.ir);
  const traces: OperationTrace[] = [];

  for (const opId of Object.keys(DESIGN_OPERATIONS) as DesignOperationId[]) {
    const op = DESIGN_OPERATIONS[opId];
    const result = op({ ...ctx, ir: currentIR });
    currentIR = result.ir;
    traces.push(result.trace);
  }

  return { ir: currentIR, traces };
}
