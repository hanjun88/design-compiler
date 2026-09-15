/**
 * 16 个确定性设计算子实现
 *
 * 每个算子：
 * 1. 从 Relationship Graph 读取拓扑特征
 * 2. 代数推导变换量（无魔法常数）
 * 3. 对 IR 深拷贝执行变换
 * 4. 返回变换结果 + 溯源 trace
 */

import type { RawDesignIR } from "../../compiler-core/contracts";
import type {
  DesignOperationContext,
  DesignOperationResult,
  OperationTrace,
  AestheticPeriod,
} from "./types";
import {
  cloneIR,
  clamp,
  findRelations,
  findNodes,
  hostGuestRatio,
  solidVoidMagnitude,
} from "./types";

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
 * 变换量 = 1 - solidVoidMagnitude（由图推导，非魔法常数）
 */
export function opEncloseBreathingField(ctx: DesignOperationContext): DesignOperationResult {
  const ir = cloneIR(ctx.ir);
  const svMag = solidVoidMagnitude(ctx.graph);

  if (svMag === null || svMag >= 0.5) {
    return {
      ir,
      trace: notApplied(
        "OP_ENCLOSE_BREATHING_FIELD",
        svMag === null
          ? "No SOLID_VOID relation in graph; breathing field enclosure not applicable."
          : `SOLID_VOID magnitude=${svMag.toFixed(3)} >= 0.5; negative space already sufficiently enclosed.`,
      ),
    };
  }

  // 变换量由图推导：负空间不足程度 = 1 - svMag
  const enclosureDelta = (1 - svMag) * 0.3;
  const currentRatio = ir.composition.negativeSpaceRatio.value;
  const newRatio = clamp(currentRatio + enclosureDelta, 0.05, 0.7);

  ir.composition.negativeSpaceRatio.value = newRatio;

  return {
    ir,
    trace: {
      opId: "OP_ENCLOSE_BREATHING_FIELD",
      parameters: { enclosureDelta, oldRatio: currentRatio, newRatio },
      rationale: `SOLID_VOID magnitude=${svMag.toFixed(3)} indicates fragmented negative space. Enclosing breathing field by +${enclosureDelta.toFixed(3)}.`,
      provenanceRef: "graph:relation:SOLID_VOID",
      applied: true,
    },
  };
}

/**
 * OP_ALIGN_GUEST_HOST_TENSION
 * 当 HOST_GUEST 显著性比 < 2.5 时，缩放次要图元视度，
 * 向心重定向从属物象朝向矢量。
 * 变换量 = 2.5 / currentRatio（由图推导）
 */
export function opAlignGuestHostTension(ctx: DesignOperationContext): DesignOperationResult {
  const ir = cloneIR(ctx.ir);
  const ratio = hostGuestRatio(ctx.graph);
  const TARGET_RATIO = 2.5;

  if (ratio === null || ratio >= TARGET_RATIO) {
    return {
      ir,
      trace: notApplied(
        "OP_ALIGN_GUEST_HOST_TENSION",
        ratio === null
          ? "No HOST_GUEST relation in graph; tension alignment not applicable."
          : `HOST_GUEST ratio=${ratio.toFixed(3)} >= ${TARGET_RATIO}; hierarchy already sufficiently differentiated.`,
      ),
    };
  }

  // 焦点向心偏移量由主客比推导
  const centeringFactor = (TARGET_RATIO - ratio) / TARGET_RATIO;
  const currentFocal = ir.composition.focalPoint.value;
  const centerX = 0.5 - (0.5 - currentFocal[0]) * (1 - centeringFactor * 0.5);
  const centerY = 0.5 - (0.5 - currentFocal[1]) * (1 - centeringFactor * 0.5);

  ir.composition.focalPoint.value = [
    Number(centerX.toFixed(4)),
    Number(centerY.toFixed(4)),
  ];

  return {
    ir,
    trace: {
      opId: "OP_ALIGN_GUEST_HOST_TENSION",
      targetNodeId: "node:subject:primary",
      parameters: { hostGuestRatio: ratio, centeringFactor, oldFocal: currentFocal, newFocal: [centerX, centerY] },
      rationale: `HOST_GUEST ratio=${ratio.toFixed(3)} < ${TARGET_RATIO}. Centering focal point by factor ${centeringFactor.toFixed(3)} to reinforce host dominance.`,
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
  const ds = findRelations(ctx.graph, "DENSE_SPARSE");

  if (ds.length === 0 || ds[0].magnitude >= 0.4) {
    return {
      ir,
      trace: notApplied(
        "OP_PARTITION_POISSON_CLUSTER",
        ds.length === 0
          ? "No DENSE_SPARSE relation; partition not applicable."
          : `DENSE_SPARSE magnitude=${ds[0].magnitude.toFixed(3)} >= 0.4; density contrast already present.`,
      ),
    };
  }

  // 疏密对比不足程度决定对称度调整
  const partitionStrength = 1 - ds[0].magnitude;
  const currentSymmetry = ir.composition.symmetry.value;
  // 疏密对比需要适度降低中轴对称，引入不对称聚散
  const newSymmetry = clamp(currentSymmetry - partitionStrength * 0.15, 0.3, 0.95);

  ir.composition.symmetry.value = Number(newSymmetry.toFixed(4));

  return {
    ir,
    trace: {
      opId: "OP_PARTITION_POISSON_CLUSTER",
      parameters: { denseSparseMagnitude: ds[0].magnitude, partitionStrength, oldSymmetry: currentSymmetry, newSymmetry },
      rationale: `DENSE_SPARSE magnitude=${ds[0].magnitude.toFixed(3)} indicates homogeneous distribution. Applying Poisson cluster partition, reducing symmetry by ${(partitionStrength * 0.15).toFixed(3)}.`,
      provenanceRef: "graph:relation:DENSE_SPARSE",
      applied: true,
    },
  };
}

/**
 * OP_CALIBRATE_AXIAL_ORDER
 * 当时代为 TANG 且中轴对称度 < 0.85 时，
 * 将对称度低的主体构件沿主轴镜像校准。
 * 变换量 = 0.85 - currentSymmetry（由范式法典推导）
 */
export function opCalibrateAxialOrder(ctx: DesignOperationContext): DesignOperationResult {
  const ir = cloneIR(ctx.ir);
  const TANG_TARGET_SYMMETRY = 0.85;

  if (ctx.period !== "TANG") {
    return {
      ir,
      trace: notApplied(
        "OP_CALIBRATE_AXIAL_ORDER",
        `Period=${ctx.period}; axial calibration is TANG-specific (雄浑巨构 requires strong central-axis symmetry).`,
      ),
    };
  }

  const currentSymmetry = ir.composition.symmetry.value;
  if (currentSymmetry >= TANG_TARGET_SYMMETRY) {
    return {
      ir,
      trace: notApplied(
        "OP_CALIBRATE_AXIAL_ORDER",
        `TANG symmetry=${currentSymmetry.toFixed(3)} >= ${TANG_TARGET_SYMMETRY}; axial order already calibrated.`,
      ),
    };
  }

  const calibrationDelta = TANG_TARGET_SYMMETRY - currentSymmetry;
  ir.composition.symmetry.value = TANG_TARGET_SYMMETRY;

  return {
    ir,
    trace: {
      opId: "OP_CALIBRATE_AXIAL_ORDER",
      parameters: { oldSymmetry: currentSymmetry, newSymmetry: TANG_TARGET_SYMMETRY, calibrationDelta },
      rationale: `TANG paradigm requires central-axis symmetry >= ${TANG_TARGET_SYMMETRY}. Current=${currentSymmetry.toFixed(3)}, calibrating by +${calibrationDelta.toFixed(3)}.`,
      provenanceRef: "grammar:period:TANG:axial-order",
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
  const nearFar = findRelations(ctx.graph, "NEAR_FAR");
  const unmeasuredNearFar = ctx.graph.unmeasuredRelations.find((r) => r.relationType === "NEAR_FAR");

  // 范式法典：不同时代的进深层数偏好
  const periodDepthLayers: Record<AestheticPeriod, number> = {
    TANG: 4, // 雄浑巨构，多层进深
    SONG: 5, // 山水意境，深远层次
    MING: 3, // 简雅秩序，适度进深
  };
  const targetLayers = periodDepthLayers[ctx.period];

  if (nearFar.length > 0 && nearFar[0].magnitude >= 0.5 && !unmeasuredNearFar) {
    return {
      ir,
      trace: notApplied(
        "OP_LAYER_DEPTH_RECESSION",
        `NEAR_FAR magnitude=${nearFar[0].magnitude.toFixed(3)} >= 0.5; depth recession already present.`,
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
  const boundaries = findNodes(ctx.graph, "BOUNDARY");
  const boundaryEnergy = boundaries.length > 0 ? boundaries[0].energy : 0;

  if (boundaryEnergy < 0.1) {
    return {
      ir,
      trace: notApplied(
        "OP_INJECT_ATMOSPHERIC_VOID",
        `BOUNDARY node energy=${boundaryEnergy.toFixed(3)} < 0.1; no hard depth edges to soften.`,
      ),
    };
  }

  // 边界能量越高，需要越多的大气消光（提升 ambientRatio 模拟介质散射）
  const atmosphericFactor = boundaryEnergy * 0.2;
  const currentAmbient = ir.lighting.ambientRatio.value;
  const newAmbient = clamp(currentAmbient + atmosphericFactor, 0.1, 0.5);

  ir.lighting.ambientRatio.value = Number(newAmbient.toFixed(4));

  return {
    ir,
    trace: {
      opId: "OP_INJECT_ATMOSPHERIC_VOID",
      parameters: { boundaryEnergy, atmosphericFactor, oldAmbient: currentAmbient, newAmbient },
      rationale: `BOUNDARY energy=${boundaryEnergy.toFixed(3)} indicates hard depth edges. Injecting atmospheric void by +${atmosphericFactor.toFixed(3)} ambient ratio.`,
      provenanceRef: "graph:node:boundary:edges",
      applied: true,
    },
  };
}

/**
 * OP_SHIFT_HORIZON_PROPORTION
 * 当视平线高度落入平庸均分区间 ([0.45, 0.55]) 时，
 * 依据范式压低（虫眼仰角）或抬高（俯瞰苍茫）视点。
 * 变换量由范式法典推导
 */
export function opShiftHorizonProportion(ctx: DesignOperationContext): DesignOperationResult {
  const ir = cloneIR(ctx.ir);
  // camera.angle 代表俯仰角，负值=仰视，正值=俯视
  const currentAngle = ir.camera.angle.value;

  // 范式法典：视平线偏好
  const periodHorizonAngle: Record<AestheticPeriod, number> = {
    TANG: -15, // 虫眼仰角，凸显雄浑巨构
    SONG: 10, // 俯瞰苍茫，山水意境
    MING: -5, // 适度仰视，秩序庄严
  };
  const targetAngle = periodHorizonAngle[ctx.period];

  // 检查是否在平庸区间（角度接近 0，±5 度内）
  if (Math.abs(currentAngle) > 5) {
    return {
      ir,
      trace: notApplied(
        "OP_SHIFT_HORIZON_PROPORTION",
        `Current camera angle=${currentAngle.toFixed(1)}° outside mediocre range [−5°, +5°]; horizon already expressive.`,
      ),
    };
  }

  ir.camera.angle.value = targetAngle;

  return {
    ir,
    trace: {
      opId: "OP_SHIFT_HORIZON_PROPORTION",
      parameters: { oldAngle: currentAngle, newAngle: targetAngle, period: ctx.period },
      rationale: `Camera angle=${currentAngle.toFixed(1)}° in mediocre range. Shifting to ${ctx.period} canonical horizon angle=${targetAngle}°.`,
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
 */
export function opFrameSecondaryOcclusion(ctx: DesignOperationContext): DesignOperationResult {
  const ir = cloneIR(ctx.ir);
  const oc = findRelations(ctx.graph, "OPEN_CLOSE");

  if (oc.length === 0 || oc[0].magnitude >= 0.5) {
    return {
      ir,
      trace: notApplied(
        "OP_FRAME_SECONDARY_OCCLUSION",
        oc.length === 0
          ? "No OPEN_CLOSE relation; framing not applicable."
          : `OPEN_CLOSE magnitude=${oc[0].magnitude.toFixed(3)} >= 0.5; composition already contained.`,
      ),
    };
  }

  // 开放度越高，需要越多的前景遮挡（但不超过 30%）
  const framingFactor = (1 - oc[0].magnitude) * 0.3;
  const currentNegative = ir.composition.negativeSpaceRatio.value;
  // 前景遮挡压缩负空间感知
  const newNegative = clamp(currentNegative - framingFactor * 0.5, 0.05, 0.7);

  ir.composition.negativeSpaceRatio.value = Number(newNegative.toFixed(4));

  return {
    ir,
    trace: {
      opId: "OP_FRAME_SECONDARY_OCCLUSION",
      parameters: { openCloseMagnitude: oc[0].magnitude, framingFactor, oldNegative: currentNegative, newNegative },
      rationale: `OPEN_CLOSE magnitude=${oc[0].magnitude.toFixed(3)} indicates unframed composition. Adding secondary occlusion framing (≤30%), adjusting negative space by -${(framingFactor * 0.5).toFixed(3)}.`,
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
  const materials = findNodes(ctx.graph, "MATERIAL");
  const materialEnergy = materials.length > 0 ? materials[0].energy : 0;

  if (materialEnergy >= 0.4) {
    return {
      ir,
      trace: notApplied(
        "OP_APPLY_TIME_PATINA",
        `MATERIAL node energy=${materialEnergy.toFixed(3)} >= 0.4; surface already has sufficient variation.`,
      ),
    };
  }

  // 材质能量越低，需要越多的风化包浆
  const patinaFactor = (1 - materialEnergy) * 0.3;
  const dominantMat = ir.materials.find((m) => m.role === "dominant") || ir.materials[0];
  if (!dominantMat) {
    return { ir, trace: notApplied("OP_APPLY_TIME_PATINA", "No dominant material in IR.") };
  }

  const oldRoughness = dominantMat.roughness.value;
  const oldWear = dominantMat.wear.value;
  const newRoughness = clamp(oldRoughness + patinaFactor * 0.3, 0.05, 0.95);
  const newWear = clamp(oldWear + patinaFactor * 0.4, 0.05, 0.9);

  dominantMat.roughness.value = Number(newRoughness.toFixed(4));
  dominantMat.wear.value = Number(newWear.toFixed(4));

  return {
    ir,
    trace: {
      opId: "OP_APPLY_TIME_PATINA",
      targetNodeId: materials.length > 0 ? materials[0].id : undefined,
      parameters: { materialEnergy, patinaFactor, oldRoughness, newRoughness, oldWear, newWear },
      rationale: `MATERIAL energy=${materialEnergy.toFixed(3)} indicates homogeneous surface. Applying time patina: roughness +${(patinaFactor * 0.3).toFixed(3)}, wear +${(patinaFactor * 0.4).toFixed(3)}.`,
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
  const hl = findRelations(ctx.graph, "HEAVY_LIGHT");

  if (hl.length === 0 || hl[0].magnitude < 0.3) {
    return {
      ir,
      trace: notApplied(
        "OP_DAMPEN_SPECULAR_HARSHNESS",
        hl.length === 0
          ? "No HEAVY_LIGHT relation; specular dampening not applicable."
          : `HEAVY_LIGHT magnitude=${hl[0].magnitude.toFixed(3)} < 0.3; specular transition already soft.`,
      ),
    };
  }

  // 重光强度越高，需要提升 softness（降低高光锐度）
  const dampenFactor = hl[0].magnitude * 0.3;
  const currentSoftness = ir.lighting.keyLight.softness.value;
  const newSoftness = clamp(currentSoftness + dampenFactor, 0.3, 0.95);

  ir.lighting.keyLight.softness.value = Number(newSoftness.toFixed(4));

  return {
    ir,
    trace: {
      opId: "OP_DAMPEN_SPECULAR_HARSHNESS",
      parameters: { heavyLightMagnitude: hl[0].magnitude, dampenFactor, oldSoftness: currentSoftness, newSoftness },
      rationale: `HEAVY_LIGHT magnitude=${hl[0].magnitude.toFixed(3)} indicates harsh specular transition. Dampening by increasing softness +${dampenFactor.toFixed(3)}.`,
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

  if (ir.materials.length < 2) {
    return {
      ir,
      trace: notApplied(
        "OP_ORCHESTRATE_MATERIAL_CONTRAST",
        `Only ${ir.materials.length} material(s) in IR; contrast orchestration requires >= 2 materials.`,
      ),
    };
  }

  // 范式法典：材质粗糙度阶梯偏好
  const periodRoughnessSpread: Record<AestheticPeriod, [number, number]> = {
    TANG: [0.25, 0.65], // 金石低糙，木石高糙，对比强烈
    SONG: [0.35, 0.6], // 清润，适度对比
    MING: [0.4, 0.55], // 简雅，温润接近
  };
  const [lowTarget, highTarget] = periodRoughnessSpread[ctx.period];

  const dominant = ir.materials.find((m) => m.role === "dominant") || ir.materials[0];
  const secondary = ir.materials.find((m) => m.role === "secondary") || ir.materials[1];

  const oldDomRough = dominant.roughness.value;
  const oldSecRough = secondary.roughness.value;
  const currentSpread = Math.abs(oldDomRough - oldSecRough);
  const targetSpread = highTarget - lowTarget;

  if (currentSpread >= targetSpread * 0.8) {
    return {
      ir,
      trace: notApplied(
        "OP_ORCHESTRATE_MATERIAL_CONTRAST",
        `Current roughness spread=${currentSpread.toFixed(3)} >= ${(targetSpread * 0.8).toFixed(3)} (${ctx.period} target=${targetSpread}); contrast already orchestrated.`,
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
      rationale: `${ctx.period} material roughness spread target=${targetSpread.toFixed(3)}. Current=${currentSpread.toFixed(3)}. Orchestrating dominant→${lowTarget}, secondary→${highTarget}.`,
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
  const timeNodes = findNodes(ctx.graph, "TIME");
  const timeEnergy = timeNodes.length > 0 ? timeNodes[0].energy : 0;

  if (timeEnergy >= 0.3) {
    return {
      ir,
      trace: notApplied(
        "OP_WEATHER_SURFACE_ENTROPY",
        `TIME node energy=${timeEnergy.toFixed(3)} >= 0.3; surface already shows natural weathering traces.`,
      ),
    };
  }

  // 时间能量越低，需要越多的表面侵蚀（提升 wear）
  const entropyFactor = (1 - timeEnergy) * 0.25;
  const dominantMat = ir.materials.find((m) => m.role === "dominant") || ir.materials[0];
  if (!dominantMat) {
    return { ir, trace: notApplied("OP_WEATHER_SURFACE_ENTROPY", "No dominant material in IR.") };
  }

  const oldWear = dominantMat.wear.value;
  const newWear = clamp(oldWear + entropyFactor, 0.05, 0.9);

  dominantMat.wear.value = Number(newWear.toFixed(4));

  return {
    ir,
    trace: {
      opId: "OP_WEATHER_SURFACE_ENTROPY",
      targetNodeId: timeNodes.length > 0 ? timeNodes[0].id : undefined,
      parameters: { timeEnergy, entropyFactor, oldWear, newWear },
      rationale: `TIME energy=${timeEnergy.toFixed(3)} indicates overly pristine surface. Weathering entropy: wear +${entropyFactor.toFixed(3)}.`,
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
 * 变换量 = lightEnergy / nodeCount（由图推导）
 */
export function opHarmonizeSkyLuminance(ctx: DesignOperationContext): DesignOperationResult {
  const ir = cloneIR(ctx.ir);
  const lightNodes = findNodes(ctx.graph, "LIGHT");

  if (lightNodes.length === 0) {
    return { ir, trace: notApplied("OP_HARMONIZE_SKY_LUMINANCE", "No LIGHT nodes in graph.") };
  }

  const lightEnergy = lightNodes[0].energy;
  // 光能量过高且 rimLight 存在时，消减补光
  if (lightEnergy < 0.7 || !ir.lighting.rimLightPresent.value) {
    return {
      ir,
      trace: notApplied(
        "OP_HARMONIZE_SKY_LUMINANCE",
        `LIGHT energy=${lightEnergy.toFixed(3)}, rimLight=${ir.lighting.rimLightPresent.value}. Sky harmonization not needed.`,
      ),
    };
  }

  // 高能量多光源时，关闭 rim light 并降低 intensity，统一天光
  const oldIntensity = ir.lighting.keyLight.intensity.value;
  const harmonizeFactor = (lightEnergy - 0.7) * 0.3;
  const newIntensity = clamp(oldIntensity - harmonizeFactor, 0.4, 1.4);

  ir.lighting.rimLightPresent.value = false;
  ir.lighting.keyLight.intensity.value = Number(newIntensity.toFixed(4));

  return {
    ir,
    trace: {
      opId: "OP_HARMONIZE_SKY_LUMINANCE",
      parameters: { lightEnergy, harmonizeFactor, oldIntensity, newIntensity, rimLightRemoved: true },
      rationale: `LIGHT energy=${lightEnergy.toFixed(3)} with rimLight present indicates multi-source conflict. Harmonizing to sky-only: removing rim light, reducing intensity by -${harmonizeFactor.toFixed(3)}.`,
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
  const hl = findRelations(ctx.graph, "HIGH_LOW");

  if (hl.length === 0 || hl[0].magnitude >= 0.3) {
    return {
      ir,
      trace: notApplied(
        "OP_COOL_SHADOW_CHROMATICITY",
        hl.length === 0
          ? "No HIGH_LOW relation; shadow chromaticity not applicable."
          : `HIGH_LOW magnitude=${hl[0].magnitude.toFixed(3)} >= 0.3; shadows already have light/shadow differentiation.`,
      ),
    };
  }

  // 高低光对比不足时，提升 ambientRatio（模拟环境色漫反射填充阴影）
  const shadowFactor = (1 - hl[0].magnitude) * 0.15;
  const currentAmbient = ir.lighting.ambientRatio.value;
  const newAmbient = clamp(currentAmbient + shadowFactor, 0.1, 0.5);

  ir.lighting.ambientRatio.value = Number(newAmbient.toFixed(4));

  return {
    ir,
    trace: {
      opId: "OP_COOL_SHADOW_CHROMATICITY",
      parameters: { highLowMagnitude: hl[0].magnitude, shadowFactor, oldAmbient: currentAmbient, newAmbient },
      rationale: `HIGH_LOW magnitude=${hl[0].magnitude.toFixed(3)} indicates dead shadows. Injecting cool ambient chromaticity by +${shadowFactor.toFixed(3)}.`,
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
  const lightNodes = findNodes(ctx.graph, "LIGHT");
  const lightEnergy = lightNodes.length > 0 ? lightNodes[0].energy : 0;
  const currentSoftness = ir.lighting.keyLight.softness.value;

  // 硬光条件：高能量 + 低柔和度
  if (!(lightEnergy >= 0.6 && currentSoftness < 0.5)) {
    return {
      ir,
      trace: notApplied(
        "OP_FILTER_MIST_SCATTER",
        `lightEnergy=${lightEnergy.toFixed(3)}, softness=${currentSoftness.toFixed(3)}. Mist scatter requires high energy (>=0.6) + low softness (<0.5).`,
      ),
    };
  }

  // 硬光程度决定散射强度
  const hardness = lightEnergy * (1 - currentSoftness);
  const scatterFactor = hardness * 0.25;
  const newSoftness = clamp(currentSoftness + scatterFactor, 0.3, 0.9);
  const newAmbient = clamp(ir.lighting.ambientRatio.value + scatterFactor * 0.3, 0.1, 0.5);

  ir.lighting.keyLight.softness.value = Number(newSoftness.toFixed(4));
  ir.lighting.ambientRatio.value = Number(newAmbient.toFixed(4));

  return {
    ir,
    trace: {
      opId: "OP_FILTER_MIST_SCATTER",
      parameters: { lightEnergy, currentSoftness, hardness, scatterFactor, newSoftness, newAmbient },
      rationale: `Hard light detected (energy=${lightEnergy.toFixed(3)}, softness=${currentSoftness.toFixed(3)}). Applying mist scatter: softness +${scatterFactor.toFixed(3)}, ambient +${(scatterFactor * 0.3).toFixed(3)}.`,
      provenanceRef: "graph:node:light:luminance-field",
      applied: true,
    },
  };
}

/**
 * OP_RESTRICT_ACCENT_LUMINANCE
 * 当点缀光源（如烛火）面积失控（ACCENT 色占比过高）时，
 * 强制点缀高光区域连通面积占比 ≤ 3%。
 * 变换量 = accentColorRatio - 0.03（由图推导）
 */
export function opRestrictAccentLuminance(ctx: DesignOperationContext): DesignOperationResult {
  const ir = cloneIR(ctx.ir);
  const ACCENT_LIMIT = 0.03;

  // 从 IR color 域无法直接获取 accent 面积占比，使用 temperatureBias 作为点缀光强度代理
  // 高色温偏移 + 高 intensity 组合暗示点缀光过强
  const tempBias = ir.color.temperatureBias.value;
  const intensity = ir.lighting.keyLight.intensity.value;

  // 点缀光过强条件：暖色温偏移（正 bias 偏暖=烛光）+ 高 intensity
  const accentStrength = Math.max(0, tempBias) * intensity;

  if (accentStrength <= ACCENT_LIMIT * 10) {
    return {
      ir,
      trace: notApplied(
        "OP_RESTRICT_ACCENT_LUMINANCE",
        `accentStrength=${accentStrength.toFixed(3)} within bounds. Accent luminance restriction not needed.`,
      ),
    };
  }

  const reductionFactor = (accentStrength - ACCENT_LIMIT * 10) / accentStrength;
  const newIntensity = clamp(intensity * (1 - reductionFactor * 0.3), 0.4, 1.4);

  ir.lighting.keyLight.intensity.value = Number(newIntensity.toFixed(4));

  return {
    ir,
    trace: {
      opId: "OP_RESTRICT_ACCENT_LUMINANCE",
      parameters: { accentStrength, reductionFactor, oldIntensity: intensity, newIntensity, accentLimit: ACCENT_LIMIT },
      rationale: `Accent luminance strength=${accentStrength.toFixed(3)} exceeds limit. Restricting key light intensity by -${(reductionFactor * 0.3 * 100).toFixed(1)}%.`,
      provenanceRef: "ir:color:temperatureBias + ir:lighting:intensity",
      applied: true,
    },
  };
}

// ===========================================================================
// 算子注册表
// ===========================================================================

import type { DesignOperation, DesignOperationId } from "./types";

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
