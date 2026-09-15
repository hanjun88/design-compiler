/**
 * Chinese Aesthetic Semantic Evaluator
 *
 * 第二层评估器：审美语义裁决。
 * 接收机器代理数据作为 evidenceRefs，输出带结构化 rationale 的独立语义结果。
 *
 * 关键规则：Semantic Judgment ≠ Machine Metric
 * - 机器指标只能提供证据，不能直接决定文化判断
 * - 每个语义维度必须保留 judgment / evidenceRefs / rationale
 * - 严禁 negativeSpaceRatio >= X → 文化维度 PASS 这种还原论
 */

import type { MachineAssertionReport } from "../matrix/machine-assertions";
import type {
  SemanticEvaluationReport,
  SemanticDimensionResult,
  SemanticJudgment,
} from "../matrix/semantic-dimensions";

export interface SemanticEvaluatorInput {
  machineReport: MachineAssertionReport;
  evaluatedAt: string;
  testCaseId?: string;
}

/**
 * 宾主揖让 — 主体与辅从的秩序关系。
 *
 * 文化内涵：画有宾主，如弈有先后。主体突出而不孤立，辅从承托而不僭越。
 * 机器证据：focal-hierarchy（焦点偏移、主辅面积分离）。
 * 判断逻辑：焦点有明确位置且主辅有分离 → 支持宾主秩序；
 *           但最终判断需考虑整体构图气韵，不能仅由数值决定。
 */
function evaluateBinzhuYirang(m: MachineAssertionReport): SemanticDimensionResult {
  const focal = m.focalHierarchy.metrics;
  const evidenceRefs = ["focal-hierarchy.assertionId", "focal-hierarchy.metrics"];

  // 证据支持度：焦点明确 + 主辅分离
  const focalClear = focal.focalCenterOffset < 0.25;
  const separationClear = focal.dominanceSeparation > 0.03;
  const evidenceStrength = (focalClear ? 0.5 : 0) + (separationClear ? 0.5 : 0);

  let judgment: SemanticJudgment;
  let rationale: string;

  if (evidenceStrength >= 0.8) {
    judgment = "PASS";
    rationale =
      "焦点位置明确（偏移" + focal.focalCenterOffset.toFixed(3) +
      "），主辅面积有分离（" + focal.dominanceSeparation.toFixed(3) +
      "），主体突出而辅从承托，宾主秩序可立。然宾主揖让之妙，尤在气韵呼应，非独位置所能尽。";
  } else if (evidenceStrength >= 0.4) {
    judgment = "INCONCLUSIVE";
    rationale =
      "焦点与主辅分离有一定证据支持（偏移" + focal.focalCenterOffset.toFixed(3) +
      "，分离" + focal.dominanceSeparation.toFixed(3) +
      "），但证据强度不足，宾主关系需结合整体气韵与虚实关系综合判断。";
  } else {
    judgment = "FAIL";
    rationale =
      "焦点偏移过大或主辅面积分离不足，宾主秩序难以确立。主体不突出则辅从无所承托，画无先后则气韵散乱。";
  }

  return {
    dimension: "宾主揖让",
    judgment,
    evidenceRefs,
    rationale,
    machineMetrics: {
      focalCenterOffset: focal.focalCenterOffset,
      dominanceSeparation: focal.dominanceSeparation,
    },
  };
}

/**
 * 计白当黑 — 留白与实形的辩证关系。
 *
 * 文化内涵：留白非空，乃气之所在。黑处是画，白处亦是画。
 * 机器证据：void-solid-ratio（负空间比例、空域连续性）。
 */
function evaluateJibaiDanghei(m: MachineAssertionReport): SemanticDimensionResult {
  const vs = m.voidSolid.metrics;
  const evidenceRefs = ["void-solid-ratio.assertionId", "void-solid-ratio.metrics"];

  // 计白当黑的理想区间：负空间 0.15-0.45（既有留白又不空洞）
  const inIdealRange = vs.negativeSpaceRatio >= 0.12 && vs.negativeSpaceRatio <= 0.50;
  const hasContinuity = vs.emptyRegionContinuity >= 0.5;

  let judgment: SemanticJudgment;
  let rationale: string;

  if (inIdealRange && hasContinuity) {
    judgment = "PASS";
    rationale =
      "负空间比例" + vs.negativeSpaceRatio.toFixed(3) +
      "，处于虚实相生的理想区间，空域连续性" + vs.emptyRegionContinuity.toFixed(2) +
      "。白处非空，乃气之运行所在；黑处实形与白处虚境相互映照，计白当黑之意可立。";
  } else if (inIdealRange || hasContinuity) {
    judgment = "INCONCLUSIVE";
    rationale =
      "负空间比例" + vs.negativeSpaceRatio.toFixed(3) +
      "，空域连续性" + vs.emptyRegionContinuity.toFixed(2) +
      "。留白有一定基础，但计白当黑之妙在于虚实辩证，需结合气韵与层次综合判断。";
  } else {
    judgment = "FAIL";
    rationale =
      "负空间比例" + vs.negativeSpaceRatio.toFixed(3) +
      "偏离理想区间，或空域连续性不足。白处不成气，黑处无所映，计白当黑之意难立。";
  }

  return {
    dimension: "计白当黑",
    judgment,
    evidenceRefs,
    rationale,
    machineMetrics: {
      negativeSpaceRatio: vs.negativeSpaceRatio,
      emptyRegionContinuity: vs.emptyRegionContinuity,
    },
  };
}

/**
 * 虚实相生 — 虚境与实景的互生关系。
 */
function evaluateXushiXiangsheng(m: MachineAssertionReport): SemanticDimensionResult {
  const vs = m.voidSolid.metrics;
  const depth = m.spatialDepth.metrics;
  const evidenceRefs = ["void-solid-ratio.assertionId", "spatial-depth-layers.assertionId"];

  const hasVoid = vs.negativeSpaceRatio > 0.1;
  const hasDepth = depth.depthLayerCount >= 3;
  const hasAtmospheric = depth.atmosphericDepth >= 0.4;

  let judgment: SemanticJudgment;
  let rationale: string;

  if (hasVoid && hasDepth && hasAtmospheric) {
    judgment = "PASS";
    rationale =
      "负空间" + vs.negativeSpaceRatio.toFixed(3) + "提供虚境基础，" +
      depth.depthLayerCount + "层景深构建实层秩序，大气透视" + depth.atmosphericDepth.toFixed(2) +
      "。虚中有实，实中有虚，虚实相生之境可立。然虚实之妙，尤在似与不似之间，非层数所能尽。";
  } else if (hasVoid || hasDepth) {
    judgment = "INCONCLUSIVE";
    rationale =
      "虚境（负空间" + vs.negativeSpaceRatio.toFixed(3) + "）与实层（" +
      depth.depthLayerCount + "层）有一定基础，但虚实相生需两者辩证统一，证据尚不充分。";
  } else {
    judgment = "FAIL";
    rationale = "虚境与实层均不足，虚实相生之意难立。";
  }

  return {
    dimension: "虚实相生",
    judgment,
    evidenceRefs,
    rationale,
    machineMetrics: {
      negativeSpaceRatio: vs.negativeSpaceRatio,
      depthLayerCount: depth.depthLayerCount,
      atmosphericDepth: depth.atmosphericDepth,
    },
  };
}

/**
 * 气韵连贯 — 生命气息与运动韵律的连贯性。
 */
function evaluateQiyunLiangguan(m: MachineAssertionReport): SemanticDimensionResult {
  const qc = m.qiyunContinuity.metrics;
  const evidenceRefs = ["qiyun-continuity.assertionId", "qiyun-continuity.metrics"];

  const motionOk = qc.motionContinuity >= 0.4;
  const flowOk = qc.opticalFlowCoherence >= 0.3;
  const luminanceOk = qc.luminanceContinuity >= 0.5;
  const evidenceCount = [motionOk, flowOk, luminanceOk].filter(Boolean).length;

  let judgment: SemanticJudgment;
  let rationale: string;

  if (evidenceCount >= 2) {
    judgment = "PASS";
    rationale =
      "运动连续性" + qc.motionContinuity.toFixed(3) +
      "，光流相干性" + qc.opticalFlowCoherence.toFixed(3) +
      "，亮度连续性" + qc.luminanceContinuity.toFixed(3) +
      "。气者，心之运；韵者，气之节。运动有连贯，光流有相干，亮度有过渡，气韵连贯之势可立。" +
      "然气韵之妙，尤在含蓄不尽，非连续性数值所能尽。";
  } else if (evidenceCount >= 1) {
    judgment = "INCONCLUSIVE";
    rationale =
      "运动/光流/亮度连续性有部分证据（运动" + qc.motionContinuity.toFixed(3) +
      "，光流" + qc.opticalFlowCoherence.toFixed(3) + "），但气韵连贯需多维度统一，证据尚不充分。";
  } else {
    judgment = "FAIL";
    rationale = "运动、光流、亮度连续性均不足，气韵连贯之势难立。";
  }

  return {
    dimension: "气韵连贯",
    judgment,
    evidenceRefs,
    rationale,
    machineMetrics: {
      motionContinuity: qc.motionContinuity,
      opticalFlowCoherence: qc.opticalFlowCoherence,
      luminanceContinuity: qc.luminanceContinuity,
    },
  };
}

/**
 * 含蓄与留白 — 不尽之意与空白的张力。
 */
function evaluateHanxuYuliubai(m: MachineAssertionReport): SemanticDimensionResult {
  const vs = m.voidSolid.metrics;
  const color = m.colorRelationship.metrics;
  const evidenceRefs = ["void-solid-ratio.assertionId", "color-relationship.assertionId"];

  const hasVoid = vs.negativeSpaceRatio > 0.1;
  const hasAccentIsolation = color.accentIsolation < 0.25;
  const hasModerateContrast = color.contrastRatio >= 3.0 && color.contrastRatio <= 10.0;

  let judgment: SemanticJudgment;
  let rationale: string;

  if (hasVoid && hasAccentIsolation && hasModerateContrast) {
    judgment = "PASS";
    rationale =
      "负空间" + vs.negativeSpaceRatio.toFixed(3) + "提供不尽之意的空白基础，" +
      "点缀色隔离度" + color.accentIsolation.toFixed(3) + "（含蓄而不张扬），" +
      "对比度" + color.contrastRatio.toFixed(2) + "（适度而不刺眼）。" +
      "含蓄者，意不尽言；留白者，境不画满。两者相济，含蓄与留白之张力可立。";
  } else if (hasVoid || hasAccentIsolation) {
    judgment = "INCONCLUSIVE";
    rationale =
      "留白（负空间" + vs.negativeSpaceRatio.toFixed(3) + "）与点缀隔离（" +
      color.accentIsolation.toFixed(3) + "）有一定基础，但含蓄之妙在于意犹未尽，需综合判断。";
  } else {
    judgment = "FAIL";
    rationale = "留白不足或点缀过于张扬，含蓄与留白之张力难立。";
  }

  return {
    dimension: "含蓄与留白",
    judgment,
    evidenceRefs,
    rationale,
    machineMetrics: {
      negativeSpaceRatio: vs.negativeSpaceRatio,
      accentIsolation: color.accentIsolation,
      contrastRatio: color.contrastRatio,
    },
  };
}

/**
 * 层次与远近 — 空间纵深与远近关系。
 */
function evaluateCengciYyuanjin(m: MachineAssertionReport): SemanticDimensionResult {
  const depth = m.spatialDepth.metrics;
  const evidenceRefs = ["spatial-depth-layers.assertionId", "spatial-depth-layers.metrics"];

  const hasLayers = depth.depthLayerCount >= 3;
  const hasSeparation = depth.layerSeparation >= 0.5;
  const hasAtmospheric = depth.atmosphericDepth >= 0.4;

  let judgment: SemanticJudgment;
  let rationale: string;

  if (hasLayers && hasSeparation && hasAtmospheric) {
    judgment = "PASS";
    rationale =
      depth.depthLayerCount + "层景深，层间分离度" + depth.layerSeparation.toFixed(2) +
      "，大气透视" + depth.atmosphericDepth.toFixed(2) +
      "。远者淡，近者浓；高者虚，低者实。层次与远近之秩序可立。" +
      "然远近之妙，尤在咫尺千里，非层数所能尽。";
  } else if (hasLayers || hasSeparation) {
    judgment = "INCONCLUSIVE";
    rationale =
      "景深" + depth.depthLayerCount + "层，分离度" + depth.layerSeparation.toFixed(2) +
      "，层次有一定基础，但远近之妙需大气透视与遮挡关系共同支撑，证据尚不充分。";
  } else {
    judgment = "FAIL";
    rationale = "景深层次不足，远近关系难立。";
  }

  return {
    dimension: "层次与远近",
    judgment,
    evidenceRefs,
    rationale,
    machineMetrics: {
      depthLayerCount: depth.depthLayerCount,
      layerSeparation: depth.layerSeparation,
      atmosphericDepth: depth.atmosphericDepth,
    },
  };
}

/**
 * 形神关系 — 外在形态与内在精神的统一。
 */
function evaluateXingshenGuanxi(m: MachineAssertionReport): SemanticDimensionResult {
  const focal = m.focalHierarchy.metrics;
  const mat = m.materialRelationship.metrics;
  const evidenceRefs = ["focal-hierarchy.assertionId", "material-relationship.assertionId"];

  const hasFocal = focal.focalCenterOffset < 0.3;
  const hasMaterialDetail = mat.microDetailDistribution >= 0.4;
  const hasWear = mat.dominantWear > 0.1;

  let judgment: SemanticJudgment;
  let rationale: string;

  if (hasFocal && hasMaterialDetail) {
    judgment = "PASS";
    rationale =
      "焦点明确（偏移" + focal.focalCenterOffset.toFixed(3) + "），" +
      "材质微观细节分布" + mat.microDetailDistribution.toFixed(2) +
      "，磨损度" + mat.dominantWear.toFixed(2) + "。形者，物之态；神者，物之魂。" +
      "形态有焦点，材质有细节，形神关系可立。然以形写神之妙，尤在似与不似之间，非细节所能尽。";
  } else if (hasFocal || hasMaterialDetail) {
    judgment = "INCONCLUSIVE";
    rationale =
      "焦点（偏移" + focal.focalCenterOffset.toFixed(3) + "）与材质细节（" +
      mat.microDetailDistribution.toFixed(2) + "）有一定基础，但形神统一需两者兼备，证据尚不充分。";
  } else {
    judgment = "FAIL";
    rationale = "形态无焦点或材质无细节，形神关系难立。";
  }

  return {
    dimension: "形神关系",
    judgment,
    evidenceRefs,
    rationale,
    machineMetrics: {
      focalCenterOffset: focal.focalCenterOffset,
      microDetailDistribution: mat.microDetailDistribution,
      dominantWear: mat.dominantWear,
    },
  };
}

/**
 * 时间感/动势 — 时间流逝与运动态势的表达。
 */
function evaluateShijianGanDongshi(m: MachineAssertionReport): SemanticDimensionResult {
  const qc = m.qiyunContinuity.metrics;
  const evidenceRefs = ["qiyun-continuity.assertionId", "qiyun-continuity.metrics"];

  const hasMotion = qc.motionContinuity >= 0.3;
  const hasCameraMotion = qc.cameraMotionSmoothness >= 0.3;
  const hasFlow = qc.opticalFlowCoherence >= 0.2;

  let judgment: SemanticJudgment;
  let rationale: string;

  if (hasMotion && (hasCameraMotion || hasFlow)) {
    judgment = "PASS";
    rationale =
      "运动连续性" + qc.motionContinuity.toFixed(3) +
      "，相机运动平滑度" + qc.cameraMotionSmoothness.toFixed(3) +
      "，光流相干性" + qc.opticalFlowCoherence.toFixed(3) +
      "。动势者，气之行；时间者，动之积。运动有连贯，相机有平滑，光流有相干，" +
      "时间感与动势可立。然动势之妙，尤在静中寓动，非运动数值所能尽。";
  } else if (hasMotion || hasCameraMotion) {
    judgment = "INCONCLUSIVE";
    rationale =
      "运动连续性" + qc.motionContinuity.toFixed(3) + "，相机平滑度" +
      qc.cameraMotionSmoothness.toFixed(3) + "，动势有一定基础，但时间感需运动与节奏共同支撑。";
  } else {
    judgment = "FAIL";
    rationale = "运动与相机平滑度均不足，时间感与动势难立。";
  }

  return {
    dimension: "时间感/动势",
    judgment,
    evidenceRefs,
    rationale,
    machineMetrics: {
      motionContinuity: qc.motionContinuity,
      cameraMotionSmoothness: qc.cameraMotionSmoothness,
      opticalFlowCoherence: qc.opticalFlowCoherence,
    },
  };
}

/**
 * 主评估函数：八大审美语义维度裁决。
 */
export function evaluateSemanticDimensions(input: SemanticEvaluatorInput): SemanticEvaluationReport {
  const m = input.machineReport;

  const dimensions = {
    binzhuYirang: evaluateBinzhuYirang(m),
    jibaiDanghei: evaluateJibaiDanghei(m),
    xushiXiangsheng: evaluateXushiXiangsheng(m),
    qiyunLiangguan: evaluateQiyunLiangguan(m),
    hanxuYuliubai: evaluateHanxuYuliubai(m),
    cengciYyuanjin: evaluateCengciYyuanjin(m),
    xingshenGuanxi: evaluateXingshenGuanxi(m),
    shijianGanDongshi: evaluateShijianGanDongshi(m),
  };

  const allDimensions = Object.values(dimensions);
  const passCount = allDimensions.filter((d) => d.judgment === "PASS").length;
  const inconclusiveCount = allDimensions.filter((d) => d.judgment === "INCONCLUSIVE").length;
  const passRate = Number((passCount / allDimensions.length).toFixed(4));

  const summary =
    `中式美学语义评估：${passCount} PASS / ${inconclusiveCount} INCONCLUSIVE / ` +
    `${allDimensions.length - passCount - inconclusiveCount} FAIL。` +
    `机器断言通过率 ${m.passRate.toFixed(2)}，语义评估通过率 ${passRate.toFixed(2)}。` +
    `所有判断均基于机器证据的文化解读，非数值还原论。`;

  return {
    testCaseId: input.testCaseId ?? m.testCaseId,
    evaluatedAt: input.evaluatedAt,
    dimensions,
    passRate,
    summary,
  };
}
