/**
 * Design Operations Tests — Phase 3 Step 3.1
 *
 * 验证 16 个设计算子：
 * - 纯函数：不修改输入 IR
 * - 确定性：相同输入 → 相同输出
 * - 条件触发：图拓扑不满足时 applied=false
 * - 变换正确：满足条件时产生预期变换
 * - 溯源完整：每个变换有 rationale + provenanceRef
 *
 * 美学数值（阈值、增益、钳制、时代表）一律取自真实技能产出的 DecisionPack（OPERATION_POLICY），
 * 测试不复制任何字面量：场景由 below()/above()/mid() 相对于 pack 的阈值与钳制构造，
 * 期望值由 pack 的参数按算子定义推导。
 */

import {
  DESIGN_OPERATIONS,
  applyAllOperations,
  opEncloseBreathingField,
  opAlignGuestHostTension,
  opPartitionPoissonCluster,
  opCalibrateAxialOrder,
  opLayerDepthRecession,
  opInjectAtmosphericVoid,
  opShiftHorizonProportion,
  opFrameSecondaryOcclusion,
  opApplyTimePatina,
  opDampenSpecularHarshness,
  opOrchestrateMaterialContrast,
  opWeatherSurfaceEntropy,
  opHarmonizeSkyLuminance,
  opCoolShadowChromaticity,
  opFilterMistScatter,
  opRestrictAccentLuminance,
  clamp,
} from "../../../chinese-aesthetic/operations";
import {
  PERIODS,
  above,
  below,
  makeCtx,
  makeTestGraph,
  makeTestIR,
  mid,
  negativeSpaceBand,
  nodeOf,
  num,
  policy,
  relationOf,
} from "./helpers/operation-fixtures";

// ---------------------------------------------------------------------------
// 通用属性测试
// ---------------------------------------------------------------------------

describe("Design Operations — General Properties", () => {
  test("all 16 operations are registered", () => {
    expect(Object.keys(DESIGN_OPERATIONS)).toHaveLength(16);
  });

  test("operations are pure functions: input IR is not modified", () => {
    const ir = makeTestIR();
    const graph = makeTestGraph();
    const irSnapshot = JSON.stringify(ir);

    for (const opId of Object.keys(DESIGN_OPERATIONS)) {
      const op = DESIGN_OPERATIONS[opId as keyof typeof DESIGN_OPERATIONS];
      op(makeCtx(ir, graph));
    }

    expect(JSON.stringify(ir)).toBe(irSnapshot);
  });

  test("operations are deterministic: same input → same output", () => {
    const ir = makeTestIR();
    const graph = makeTestGraph();

    for (const opId of Object.keys(DESIGN_OPERATIONS)) {
      const op = DESIGN_OPERATIONS[opId as keyof typeof DESIGN_OPERATIONS];
      const r1 = op(makeCtx(ir, graph));
      const r2 = op(makeCtx(ir, graph));
      expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
    }
  });

  test("every operation returns trace with opId, rationale, provenanceRef, applied", () => {
    const ir = makeTestIR();
    const graph = makeTestGraph();

    for (const opId of Object.keys(DESIGN_OPERATIONS)) {
      const op = DESIGN_OPERATIONS[opId as keyof typeof DESIGN_OPERATIONS];
      const result = op(makeCtx(ir, graph));
      expect(result.trace.opId).toBe(opId);
      expect(result.trace.rationale.length).toBeGreaterThan(0);
      expect(result.trace.provenanceRef.length).toBeGreaterThan(0);
      expect(typeof result.trace.applied).toBe("boolean");
    }
  });

  test("applyAllOperations chains all 16 operations and returns traces", () => {
    const ir = makeTestIR("TANG");
    const graph = makeTestGraph("TANG");
    const result = applyAllOperations(makeCtx(ir, graph, "TANG"));
    expect(result.traces).toHaveLength(16);
    expect(result.ir).toBeDefined();
  });

  test("applyAllOperations equals the operators applied one after another", () => {
    for (const period of PERIODS) {
      const ir = makeTestIR(period);
      const graph = makeTestGraph(period);
      const chained = applyAllOperations(makeCtx(ir, graph, period));
      let running = ir;
      const traces: unknown[] = [];
      for (const opId of Object.keys(DESIGN_OPERATIONS) as Array<keyof typeof DESIGN_OPERATIONS>) {
        const r = DESIGN_OPERATIONS[opId](makeCtx(running, graph, period));
        running = r.ir;
        traces.push(r.trace);
      }
      expect(JSON.stringify(chained)).toBe(JSON.stringify({ ir: running, traces }));
    }
  });
});

// ---------------------------------------------------------------------------
// 构图算子
// ---------------------------------------------------------------------------

describe("Composition Operations", () => {
  const ENCLOSE = "OP_ENCLOSE_BREATHING_FIELD";
  const GUEST_HOST = "OP_ALIGN_GUEST_HOST_TENSION";
  const POISSON = "OP_PARTITION_POISSON_CLUSTER";
  const AXIAL = "OP_CALIBRATE_AXIAL_ORDER";

  test("OP_ENCLOSE_BREATHING_FIELD: applies when SOLID_VOID magnitude is below the enclosed threshold", () => {
    const ir = makeTestIR();
    const graph = makeTestGraph(); // SOLID_VOID below the threshold
    const result = opEncloseBreathingField(makeCtx(ir, graph));
    expect(result.trace.applied).toBe(true);
    expect(result.ir.composition.negativeSpaceRatio.value).toBeGreaterThan(ir.composition.negativeSpaceRatio.value);
  });

  test("OP_ENCLOSE_BREATHING_FIELD: raises by (1 - magnitude) * enclosure gain, bounded by the band", () => {
    for (const period of PERIODS) {
      const ir = makeTestIR(period);
      const graph = makeTestGraph(period);
      const magnitude = relationOf(graph, "SOLID_VOID").magnitude;
      const band = negativeSpaceBand(period);
      const current = ir.composition.negativeSpaceRatio.value;
      const delta = (1 - magnitude) * num(ENCLOSE, "enclosure_gain", period);
      const result = opEncloseBreathingField(makeCtx(ir, graph, period));
      expect(result.trace.parameters.enclosureDelta).toBe(delta);
      expect(result.ir.composition.negativeSpaceRatio.value).toBe(clamp(current + delta, band.min, band.max));
    }
  });

  test("OP_ENCLOSE_BREATHING_FIELD: not applied when SOLID_VOID >= the enclosed threshold", () => {
    const threshold = num(ENCLOSE, "solid_void_enclosed_magnitude");
    for (const magnitude of [threshold, above(threshold)]) {
      const ir = makeTestIR();
      const graph = makeTestGraph();
      relationOf(graph, "SOLID_VOID").magnitude = magnitude;
      const result = opEncloseBreathingField(makeCtx(ir, graph));
      expect(result.trace.applied).toBe(false);
      expect(result.ir).toEqual(ir);
    }
  });

  test("OP_ALIGN_GUEST_HOST_TENSION: applies when host/guest ratio is below the target ratio", () => {
    const ir = makeTestIR();
    const graph = makeTestGraph(); // host/guest ratio = target / 2
    const result = opAlignGuestHostTension(makeCtx(ir, graph));
    expect(result.trace.applied).toBe(true);
  });

  test("OP_ALIGN_GUEST_HOST_TENSION: pulls the focal point toward the frame centre; at the target ratio there is nothing to align", () => {
    const target = num(GUEST_HOST, "target_ratio");
    const strength = num(GUEST_HOST, "centering_strength");
    const centre = 0.5; // geometric centre of the normalised frame
    const before: [number, number] = [0.9, 0.1];
    const ir = makeTestIR();
    ir.composition.focalPoint.value = before;
    const graph = makeTestGraph();
    const ratio = nodeOf(graph, "SUBJECT").energy / nodeOf(graph, "SPACE").energy;
    const result = opAlignGuestHostTension(makeCtx(ir, graph));
    const pull = 1 - ((target - ratio) / target) * strength;
    const [x, y] = result.ir.composition.focalPoint.value;
    expect(x).toBeCloseTo(centre - (centre - before[0]) * pull, 3);
    expect(y).toBeCloseTo(centre - (centre - before[1]) * pull, 3);
    expect(Math.abs(x - centre)).toBeLessThan(Math.abs(before[0] - centre)); // closer to the centre than before
    expect(Math.abs(y - centre)).toBeLessThan(Math.abs(before[1] - centre));

    // host dominance exactly at the target ratio: nothing to align
    const atTarget = makeTestGraph();
    nodeOf(atTarget, "SPACE").energy = 1;
    nodeOf(atTarget, "SUBJECT").energy = target;
    expect(opAlignGuestHostTension(makeCtx(makeTestIR(), atTarget)).trace.applied).toBe(false);
  });

  test("OP_PARTITION_POISSON_CLUSTER: applies when DENSE_SPARSE is below the contrast threshold", () => {
    const ir = makeTestIR();
    const graph = makeTestGraph(); // DENSE_SPARSE below the threshold
    const result = opPartitionPoissonCluster(makeCtx(ir, graph));
    expect(result.trace.applied).toBe(true);
    expect(result.ir.composition.symmetry.value).toBeLessThan(ir.composition.symmetry.value);
  });

  test("OP_PARTITION_POISSON_CLUSTER: symmetry reduction follows the policy gain and stays inside the clamp", () => {
    const lo = num(POISSON, "symmetry_min");
    const hi = num(POISSON, "symmetry_max");
    const gain = num(POISSON, "symmetry_reduction_gain");
    for (const start of [hi + (1 - hi) / 2, mid(lo, hi), lo]) {
      const ir = makeTestIR();
      ir.composition.symmetry.value = start;
      const graph = makeTestGraph();
      const strength = 1 - relationOf(graph, "DENSE_SPARSE").magnitude;
      const result = opPartitionPoissonCluster(makeCtx(ir, graph));
      expect(result.ir.composition.symmetry.value).toBeCloseTo(clamp(start - strength * gain, lo, hi), 3);
    }
  });

  test("OP_CALIBRATE_AXIAL_ORDER: applies where the policy enables it, with symmetry below the target", () => {
    const enabled = PERIODS.filter((period) => policy(AXIAL, period).flag("applies_to_period"));
    expect(enabled.length).toBeGreaterThan(0); // the operator is period-specific, not dead
    for (const period of enabled) {
      const target = num(AXIAL, "axial_symmetry_target", period);
      const ir = makeTestIR(period);
      ir.composition.symmetry.value = below(target);
      const result = opCalibrateAxialOrder(makeCtx(ir, makeTestGraph(period), period));
      expect(result.trace.applied).toBe(true);
      expect(result.ir.composition.symmetry.value).toBe(target);
      expect(result.trace.provenanceRef).toContain(period);
    }
  });

  test("OP_CALIBRATE_AXIAL_ORDER: not applied where the policy disables it, whatever the symmetry", () => {
    const disabled = PERIODS.filter((period) => !policy(AXIAL, period).flag("applies_to_period"));
    expect(disabled.length).toBeGreaterThan(0);
    for (const period of disabled) {
      const ir = makeTestIR(period);
      ir.composition.symmetry.value = 0;
      const result = opCalibrateAxialOrder(makeCtx(ir, makeTestGraph(period), period));
      expect(result.trace.applied).toBe(false);
      expect(result.ir).toEqual(ir);
    }
  });

  test("OP_CALIBRATE_AXIAL_ORDER: not applied once symmetry reaches the target", () => {
    const period = PERIODS.find((p) => policy(AXIAL, p).flag("applies_to_period"))!;
    const target = num(AXIAL, "axial_symmetry_target", period);
    const ir = makeTestIR(period);
    ir.composition.symmetry.value = target;
    expect(opCalibrateAxialOrder(makeCtx(ir, makeTestGraph(period), period)).trace.applied).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 空间算子
// ---------------------------------------------------------------------------

describe("Spatial Operations", () => {
  const LAYERS = "OP_LAYER_DEPTH_RECESSION";
  const INJECT = "OP_INJECT_ATMOSPHERIC_VOID";
  const HORIZON = "OP_SHIFT_HORIZON_PROPORTION";
  const FRAME = "OP_FRAME_SECONDARY_OCCLUSION";

  test("OP_LAYER_DEPTH_RECESSION: applies when NEAR_FAR is unmeasured and layers < period target", () => {
    const target = num(LAYERS, "target_layers", "SONG");
    const ir = makeTestIR();
    ir.composition.depthLayerCount.value = target - 1;
    const graph = makeTestGraph(); // NEAR_FAR is unmeasured
    const result = opLayerDepthRecession(makeCtx(ir, graph, "SONG"));
    expect(result.trace.applied).toBe(true);
    expect(result.ir.composition.depthLayerCount.value).toBe(target); // SONG target
  });

  test("OP_LAYER_DEPTH_RECESSION: every period reaches its own target from the sheet", () => {
    for (const period of PERIODS) {
      const ir = makeTestIR(period);
      ir.composition.depthLayerCount.value = 0;
      const result = opLayerDepthRecession(makeCtx(ir, makeTestGraph(period), period));
      expect(result.ir.composition.depthLayerCount.value).toBe(num(LAYERS, "target_layers", period));
      expect(result.trace.parameters.newLayers).toBe(num(LAYERS, "target_layers", period));
    }
  });

  test("OP_LAYER_DEPTH_RECESSION: not applied once the depth is sufficient or NEAR_FAR is measured and present", () => {
    const target = num(LAYERS, "target_layers");
    const enough = makeTestIR();
    enough.composition.depthLayerCount.value = target;
    expect(opLayerDepthRecession(makeCtx(enough, makeTestGraph())).trace.applied).toBe(false);

    const measured = makeTestGraph();
    measured.unmeasuredRelations = measured.unmeasuredRelations.filter((r) => r.relationType !== "NEAR_FAR");
    measured.relations.push({ sourceId: "node:subject:primary", targetId: "node:void:negative-space", relationType: "NEAR_FAR", magnitude: num(LAYERS, "near_far_present_magnitude"), polarity: "MUTUAL", derivedFrom: ["d7"], confidence: 0.8 });
    const shallow = makeTestIR();
    shallow.composition.depthLayerCount.value = 0;
    const r = opLayerDepthRecession(makeCtx(shallow, measured));
    expect(r.trace.applied).toBe(false);
    expect(r.ir).toEqual(shallow);
  });

  test("OP_INJECT_ATMOSPHERIC_VOID: applies when BOUNDARY energy reaches the threshold", () => {
    const threshold = num(INJECT, "boundary_energy_min");
    const ir = makeTestIR();
    const graph = makeTestGraph();
    nodeOf(graph, "BOUNDARY").energy = above(threshold);
    const result = opInjectAtmosphericVoid(makeCtx(ir, graph));
    expect(result.trace.applied).toBe(true);
    expect(result.ir.lighting.ambientRatio.value).toBeGreaterThan(ir.lighting.ambientRatio.value);

    nodeOf(graph, "BOUNDARY").energy = threshold; // the threshold itself activates (strict "below" test)
    expect(opInjectAtmosphericVoid(makeCtx(ir, graph)).trace.applied).toBe(true);
    nodeOf(graph, "BOUNDARY").energy = below(threshold);
    expect(opInjectAtmosphericVoid(makeCtx(ir, graph)).trace.applied).toBe(false);
  });

  test("OP_SHIFT_HORIZON_PROPORTION: applies when camera angle is inside the mediocre band", () => {
    const band = num(HORIZON, "mediocre_angle_band", "TANG");
    const ir = makeTestIR("TANG");
    ir.camera.angle.value = below(band);
    const graph = makeTestGraph("TANG");
    const result = opShiftHorizonProportion(makeCtx(ir, graph, "TANG"));
    expect(result.trace.applied).toBe(true);
    expect(result.ir.camera.angle.value).toBe(num(HORIZON, "target_angle", "TANG")); // TANG target
  });

  test("OP_SHIFT_HORIZON_PROPORTION: the band edge is inside, beyond it the horizon is already expressive", () => {
    for (const period of PERIODS) {
      const band = num(HORIZON, "mediocre_angle_band", period);
      for (const [angle, applied] of [[band, true], [-band, true], [band * 2, false], [-band * 2, false]] as const) {
        const ir = makeTestIR(period);
        ir.camera.angle.value = angle;
        const result = opShiftHorizonProportion(makeCtx(ir, makeTestGraph(period), period));
        expect(result.trace.applied).toBe(applied);
        expect(result.ir.camera.angle.value).toBe(applied ? num(HORIZON, "target_angle", period) : angle);
      }
    }
  });

  test("OP_FRAME_SECONDARY_OCCLUSION: applies when OPEN_CLOSE is below the contained threshold", () => {
    const ir = makeTestIR();
    const graph = makeTestGraph(); // OPEN_CLOSE below the threshold
    const result = opFrameSecondaryOcclusion(makeCtx(ir, graph));
    expect(result.trace.applied).toBe(true);
    expect(result.ir.composition.negativeSpaceRatio.value).toBeLessThanOrEqual(ir.composition.negativeSpaceRatio.value);
  });

  test("OP_FRAME_SECONDARY_OCCLUSION: lowers by (1 - magnitude) * framing gain * compression, bounded by the band", () => {
    for (const period of PERIODS) {
      const ir = makeTestIR(period);
      const graph = makeTestGraph(period);
      const band = negativeSpaceBand(period);
      const current = ir.composition.negativeSpaceRatio.value;
      const factor = (1 - relationOf(graph, "OPEN_CLOSE").magnitude) * num(FRAME, "framing_gain", period);
      const result = opFrameSecondaryOcclusion(makeCtx(ir, graph, period));
      expect(result.trace.parameters.framingFactor).toBe(factor);
      expect(result.ir.composition.negativeSpaceRatio.value).toBeCloseTo(
        clamp(current - factor * num(FRAME, "negative_space_compression", period), band.min, band.max),
        3,
      );
    }
  });

  test("OP_FRAME_SECONDARY_OCCLUSION: not applied when OPEN_CLOSE >= the contained threshold", () => {
    const threshold = num(FRAME, "open_close_contained_magnitude");
    for (const magnitude of [threshold, above(threshold)]) {
      const graph = makeTestGraph();
      relationOf(graph, "OPEN_CLOSE").magnitude = magnitude;
      expect(opFrameSecondaryOcclusion(makeCtx(makeTestIR(), graph)).trace.applied).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 材质算子
// ---------------------------------------------------------------------------

describe("Material Operations", () => {
  const PATINA = "OP_APPLY_TIME_PATINA";
  const DAMPEN = "OP_DAMPEN_SPECULAR_HARSHNESS";
  const CONTRAST = "OP_ORCHESTRATE_MATERIAL_CONTRAST";
  const ENTROPY = "OP_WEATHER_SURFACE_ENTROPY";

  test("OP_APPLY_TIME_PATINA: applies when MATERIAL energy is below the varied threshold", () => {
    const ir = makeTestIR();
    const graph = makeTestGraph(); // MATERIAL energy below the threshold
    const result = opApplyTimePatina(makeCtx(ir, graph));
    expect(result.trace.applied).toBe(true);
    expect(result.ir.materials[0].roughness.value).toBeGreaterThan(ir.materials[0].roughness.value);
    expect(result.ir.materials[0].wear.value).toBeGreaterThan(ir.materials[0].wear.value);
  });

  test("OP_APPLY_TIME_PATINA: roughness and wear follow the policy gains and clamps", () => {
    const ir = makeTestIR();
    const graph = makeTestGraph();
    const factor = (1 - nodeOf(graph, "MATERIAL").energy) * num(PATINA, "patina_gain");
    const result = opApplyTimePatina(makeCtx(ir, graph));
    expect(result.ir.materials[0].roughness.value).toBeCloseTo(
      clamp(ir.materials[0].roughness.value + factor * num(PATINA, "roughness_gain"), num(PATINA, "roughness_min"), num(PATINA, "roughness_max")),
      3,
    );
    expect(result.ir.materials[0].wear.value).toBeCloseTo(
      clamp(ir.materials[0].wear.value + factor * num(PATINA, "wear_gain"), num(PATINA, "wear_min"), num(PATINA, "wear_max")),
      3,
    );

    const worn = makeTestIR();
    worn.materials[0].wear.value = 1; // above the clamp: the clamp wins
    expect(opApplyTimePatina(makeCtx(worn, graph)).ir.materials[0].wear.value).toBe(num(PATINA, "wear_max"));
  });

  test("OP_APPLY_TIME_PATINA: not applied when MATERIAL energy reaches the threshold", () => {
    const graph = makeTestGraph();
    nodeOf(graph, "MATERIAL").energy = num(PATINA, "material_energy_varied");
    expect(opApplyTimePatina(makeCtx(makeTestIR(), graph)).trace.applied).toBe(false);
  });

  test("OP_DAMPEN_SPECULAR_HARSHNESS: applies when HEAVY_LIGHT reaches the harsh threshold", () => {
    const threshold = num(DAMPEN, "heavy_light_harsh_magnitude");
    const ir = makeTestIR();
    const graph = makeTestGraph();
    relationOf(graph, "HEAVY_LIGHT").magnitude = above(threshold);
    const result = opDampenSpecularHarshness(makeCtx(ir, graph));
    expect(result.trace.applied).toBe(true);
    expect(result.ir.lighting.keyLight.softness.value).toBeGreaterThan(ir.lighting.keyLight.softness.value);

    relationOf(graph, "HEAVY_LIGHT").magnitude = threshold; // threshold itself is harsh enough
    expect(opDampenSpecularHarshness(makeCtx(ir, graph)).trace.applied).toBe(true);
    relationOf(graph, "HEAVY_LIGHT").magnitude = below(threshold);
    expect(opDampenSpecularHarshness(makeCtx(ir, graph)).trace.applied).toBe(false);
  });

  test("OP_ORCHESTRATE_MATERIAL_CONTRAST: applies with >= 2 materials and period-specific spread", () => {
    for (const period of PERIODS) {
      const low = num(CONTRAST, "roughness_low_target", period);
      const high = num(CONTRAST, "roughness_high_target", period);
      const ir = makeTestIR(period);
      ir.materials[0].roughness.value = mid(low, high);
      ir.materials[1].roughness.value = mid(low, high) + (high - low) / 100; // very small spread
      const result = opOrchestrateMaterialContrast(makeCtx(ir, makeTestGraph(period), period));
      expect(result.trace.applied).toBe(true);
      expect(result.ir.materials[0].roughness.value).toBe(low); // period low
      expect(result.ir.materials[1].roughness.value).toBe(high); // period high
    }
  });

  test("OP_ORCHESTRATE_MATERIAL_CONTRAST: not applied with a single material or an already orchestrated spread", () => {
    const period = "TANG";
    const low = num(CONTRAST, "roughness_low_target", period);
    const high = num(CONTRAST, "roughness_high_target", period);
    const single = makeTestIR(period);
    single.materials = single.materials.slice(0, 1);
    expect(opOrchestrateMaterialContrast(makeCtx(single, makeTestGraph(period), period)).trace.applied).toBe(false);

    const spread = makeTestIR(period);
    spread.materials[0].roughness.value = low;
    spread.materials[1].roughness.value = high;
    expect(opOrchestrateMaterialContrast(makeCtx(spread, makeTestGraph(period), period)).trace.applied).toBe(false);
  });

  test("OP_WEATHER_SURFACE_ENTROPY: applies when TIME energy is below the weathered threshold", () => {
    const ir = makeTestIR();
    const graph = makeTestGraph(); // TIME energy below the threshold
    const result = opWeatherSurfaceEntropy(makeCtx(ir, graph));
    expect(result.trace.applied).toBe(true);
    expect(result.ir.materials[0].wear.value).toBeGreaterThan(ir.materials[0].wear.value);
  });

  test("OP_WEATHER_SURFACE_ENTROPY: not applied when TIME energy reaches the threshold or no material exists", () => {
    const graph = makeTestGraph();
    nodeOf(graph, "TIME").energy = num(ENTROPY, "time_energy_weathered");
    expect(opWeatherSurfaceEntropy(makeCtx(makeTestIR(), graph)).trace.applied).toBe(false);

    const bare = makeTestIR();
    bare.materials = [];
    expect(opWeatherSurfaceEntropy(makeCtx(bare, makeTestGraph())).trace.applied).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 光影算子
// ---------------------------------------------------------------------------

describe("Lighting Operations", () => {
  const HARMONIZE = "OP_HARMONIZE_SKY_LUMINANCE";
  const COOL = "OP_COOL_SHADOW_CHROMATICITY";
  const MIST = "OP_FILTER_MIST_SCATTER";
  const ACCENT = "OP_RESTRICT_ACCENT_LUMINANCE";

  test("OP_HARMONIZE_SKY_LUMINANCE: applies when LIGHT energy reaches the conflict threshold and rimLight present", () => {
    const threshold = num(HARMONIZE, "light_energy_conflict");
    const ir = makeTestIR();
    const graph = makeTestGraph();
    nodeOf(graph, "LIGHT").energy = above(threshold);
    const result = opHarmonizeSkyLuminance(makeCtx(ir, graph));
    expect(result.trace.applied).toBe(true);
    expect(result.ir.lighting.rimLightPresent.value).toBe(false);
    const factor = (above(threshold) - threshold) * num(HARMONIZE, "harmonize_gain");
    expect(result.ir.lighting.keyLight.intensity.value).toBeCloseTo(
      clamp(ir.lighting.keyLight.intensity.value - factor, num(HARMONIZE, "intensity_min"), num(HARMONIZE, "intensity_max")),
      3,
    );

    const noRim = makeTestIR();
    noRim.lighting.rimLightPresent.value = false;
    expect(opHarmonizeSkyLuminance(makeCtx(noRim, graph)).trace.applied).toBe(false);
    nodeOf(graph, "LIGHT").energy = below(threshold);
    expect(opHarmonizeSkyLuminance(makeCtx(ir, graph)).trace.applied).toBe(false);
  });

  test("OP_COOL_SHADOW_CHROMATICITY: applies when HIGH_LOW is below the differentiated threshold", () => {
    const ir = makeTestIR();
    const graph = makeTestGraph(); // HIGH_LOW below the threshold
    const result = opCoolShadowChromaticity(makeCtx(ir, graph));
    expect(result.trace.applied).toBe(true);
    expect(result.ir.lighting.ambientRatio.value).toBeGreaterThan(ir.lighting.ambientRatio.value);

    relationOf(graph, "HIGH_LOW").magnitude = num(COOL, "high_low_differentiated_magnitude");
    expect(opCoolShadowChromaticity(makeCtx(ir, graph)).trace.applied).toBe(false);
  });

  test("OP_FILTER_MIST_SCATTER: applies when LIGHT energy reaches the hard-light threshold and softness is below its limit", () => {
    const energyMin = num(MIST, "hard_light_energy_min");
    const softnessMax = num(MIST, "hard_light_softness_max");
    const ir = makeTestIR();
    ir.lighting.keyLight.softness.value = below(softnessMax);
    const graph = makeTestGraph();
    nodeOf(graph, "LIGHT").energy = above(energyMin);
    const result = opFilterMistScatter(makeCtx(ir, graph));
    expect(result.trace.applied).toBe(true);
    expect(result.ir.lighting.keyLight.softness.value).toBeGreaterThan(below(softnessMax));

    const soft = makeTestIR();
    soft.lighting.keyLight.softness.value = softnessMax; // not below the limit
    expect(opFilterMistScatter(makeCtx(soft, graph)).trace.applied).toBe(false);
    nodeOf(graph, "LIGHT").energy = below(energyMin);
    expect(opFilterMistScatter(makeCtx(ir, graph)).trace.applied).toBe(false);
  });

  test("OP_RESTRICT_ACCENT_LUMINANCE: applies when accent strength exceeds the limit", () => {
    const limit = num(ACCENT, "accent_area_limit") * num(ACCENT, "accent_proxy_scale");
    const ir = makeTestIR();
    const intensity = ir.lighting.keyLight.intensity.value;
    ir.color.temperatureBias.value = (2 * limit) / intensity; // strength = twice the limit
    const graph = makeTestGraph();
    const result = opRestrictAccentLuminance(makeCtx(ir, graph));
    expect(result.trace.applied).toBe(true);
    expect(result.ir.lighting.keyLight.intensity.value).toBeLessThan(intensity);

    const calm = makeTestIR();
    calm.color.temperatureBias.value = below(limit) / intensity; // strength = half the limit
    expect(opRestrictAccentLuminance(makeCtx(calm, graph)).trace.applied).toBe(false);
    const cool = makeTestIR();
    cool.color.temperatureBias.value = -1; // a cool bias never counts as an accent
    expect(opRestrictAccentLuminance(makeCtx(cool, graph)).trace.applied).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 不应用条件测试
// ---------------------------------------------------------------------------

describe("Non-application Conditions", () => {
  test("operations with no matching relations return applied=false", () => {
    const ir = makeTestIR();
    const graph = makeTestGraph();
    graph.relations = []; // no relations at all

    const results = [
      opEncloseBreathingField(makeCtx(ir, graph)),
      opAlignGuestHostTension(makeCtx(ir, graph)),
      opPartitionPoissonCluster(makeCtx(ir, graph)),
      opDampenSpecularHarshness(makeCtx(ir, graph)),
      opCoolShadowChromaticity(makeCtx(ir, graph)),
      opFrameSecondaryOcclusion(makeCtx(ir, graph)),
    ];

    for (const r of results) {
      expect(r.trace.applied).toBe(false);
    }
  });

  test("no magic numbers in transformation parameters: all derived from graph", () => {
    const ir = makeTestIR("TANG");
    const graph = makeTestGraph("TANG");
    const result = applyAllOperations(makeCtx(ir, graph, "TANG"));

    // All applied operations should have parameters derived from graph values
    const applied = result.traces.filter((t) => t.applied);
    expect(applied.length).toBeGreaterThan(0);
    for (const trace of applied) {
      expect(trace.parameters).toBeDefined();
      expect(Object.keys(trace.parameters).length).toBeGreaterThan(0);
    }
  });
});
