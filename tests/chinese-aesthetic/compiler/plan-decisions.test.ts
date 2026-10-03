/**
 * 3.4-B / 3.4-D: 计划发射与冲突解析的每个美学数值都来自 AestheticConstraintSheet。
 *
 * 做法：
 * - 把 sheet 里所有 PLAN_* 决策的数值改写成互不相同的合成数值（再重新封印哈希），
 *   然后逐个算子核对 deriveOperationParameters 的输出——代码里只要残留任何一个常数，
 *   或把两个决策的键读串了，这里就会暴露（只用真实 sheet 对照，残留常数恰好等于真实值时是发现不了的）；
 * - 真实 sheet 上核对：负空间钳制边界等于语境的有效区间、编译结果落在区间内、清单与实际读取互相覆盖；
 * - sheet 缺少决策 / 时代不一致 / 没有 pack 时直接失败，不回退、不包装成普通编译失败。
 */

import {
  compileAestheticExecutionPlan,
  deriveOperationParameters,
  primaryTargetKey,
  conflictPriority,
  CONFLICT_PRIORITY,
  resolveConflict,
  getPeriodConstraints,
} from "../../../chinese-aesthetic/compiler";
import type { AestheticIntentExtension, AestheticPrinciple } from "../../../chinese-aesthetic/intent/types";
import type { AestheticNodeType, AestheticRelationType, AestheticRelationshipGraph } from "../../../chinese-aesthetic/graph/types";
import type { AestheticPeriod, DesignOperationId, OperationCategory } from "../../../chinese-aesthetic/operations/types";
import { OPERATION_CATEGORIES } from "../../../chinese-aesthetic/operations/types";
import { withDecisionPack } from "../../../skill-bridge/active-pack";
import { DecisionContextMismatchError, DecisionPack, MissingDecisionError } from "../../../skill-bridge/decision-pack";
import { SheetRejectedError } from "../../../skill-bridge/errors";
import { validateSheet } from "../../../skill-bridge/sheet-validator";
import { REQUIRED_DECISIONS } from "../../../skill-bridge/requirements";
import { PERIOD_BAND_REQUIREMENTS } from "../../../skill-bridge/requirements/period-bands";
import { PLAN_REQUIREMENTS } from "../../../skill-bridge/requirements/plan";
import type { AestheticConstraintSheet } from "../../../contracts/aesthetic-constraint-sheet/aesthetic-constraint-sheet.types";
import { mutate } from "../../skill-bridge/helpers/sheet-tools";
import { DEFAULT_CONTEXT_BY_PERIOD, GOLDEN_CONTEXTS, defaultPackFor, loadSheetJson, packFor, strictBinding } from "../../support/skill-packs";

const PERIODS: AestheticPeriod[] = ["TANG", "SONG", "MING"];
const OPERATIONS = Object.keys(OPERATION_CATEGORIES) as DesignOperationId[];
const NEGATIVE_SPACE = "scene.composition.negativeSpaceRatio";
const categories = [...new Set(Object.values(OPERATION_CATEGORIES))] as OperationCategory[];

// ---------------------------------------------------------------------------
// 夹具：图 / 意图 / 合成 sheet
// ---------------------------------------------------------------------------

interface GraphSpec {
  energies: Partial<Record<AestheticNodeType, number>>;
  magnitudes: Partial<Record<AestheticRelationType, number>>;
}

/** 只含给定节点与关系的图（证据输入，不是美学判断）。 */
function makeGraph(spec: GraphSpec): AestheticRelationshipGraph {
  return {
    graphId: "g:plan-decisions",
    evidenceId: "e:plan-decisions",
    generatedAt: "2026-09-16T00:00:00Z",
    graphHash: "fnv1a:plandecisions",
    nodes: (Object.entries(spec.energies) as Array<[AestheticNodeType, number]>).map(([type, energy]) => ({
      id: `node:${type.toLowerCase()}`, type, boundingRegion: null, energy, evidenceRefs: ["fixture"], confidence: 0.9,
    })),
    relations: (Object.entries(spec.magnitudes) as Array<[AestheticRelationType, number]>).map(([relationType, magnitude]) => ({
      sourceId: "node:a", targetId: "node:b", relationType, magnitude, polarity: "MUTUAL" as const, derivedFrom: ["fixture"], confidence: 0.9,
    })),
    unmeasuredRelations: [],
    derivationPipeline: [],
    topologyAudit: { status: "PASS", noIsolatedNodes: true, polarAlignment: true, boundedEnergy: true, purityPenetration: true, violations: [] },
  };
}

const FULL_GRAPH = makeGraph({
  energies: { VOID: 0.2, SUBJECT: 0.45, BOUNDARY: 0.9, LIGHT: 0.35, MATERIAL: 0.55 },
  magnitudes: { SOLID_VOID: 0.3, HOST_GUEST: 0.6, DENSE_SPARSE: 0.9 },
});
const EMPTY_GRAPH = makeGraph({ energies: {}, magnitudes: {} });

const ALL_PRINCIPLES: AestheticPrinciple[] = [
  "COUNT_WHITE_AS_BLACK", "VOID_SOLID_INTERPLAY", "GUEST_HOST_COMITY", "POSITION_MANAGEMENT",
  "SCALE_PROPORTION", "MATERIAL_PATINA", "LIGHT_TEMPORALITY", "QI_YUN_CONTINUITY",
];
const ALL_RELATION_TYPES = ["SOLID_VOID", "HOST_GUEST", "CENTER_EDGE", "DENSE_SPARSE", "NEAR_FAR", "HIGH_LOW", "HEAVY_LIGHT", "MOVE_STILL"];

/** 激活全部原则与关系的意图：选择器能选中的算子全部入选。 */
function makeIntent(period: AestheticPeriod): AestheticIntentExtension {
  return {
    system: "chinese-aesthetic@1.0.0",
    period,
    principles: ALL_PRINCIPLES,
    activeRelationships: ALL_RELATION_TYPES.map((relationType, i) => ({ relationType, sourceId: `node:s${i}`, targetId: `node:t${i}`, magnitude: 0.5 })),
    appliedOperations: [],
    antiPatternConformance: { gateReportRef: "fnv1a:gate", allAllowed: true },
    provenance: { evidenceHash: "sha256:ev", graphHash: "fnv1a:plandecisions", intentHash: "fnv1a:intent" },
  };
}

const compile = (period: AestheticPeriod, graph: AestheticRelationshipGraph = FULL_GRAPH) =>
  compileAestheticExecutionPlan({ intent: makeIntent(period), graph, compiledAt: "2026-09-16T00:00:00Z" });

/** 由真实 sheet 改写而来的 DecisionPack（改写后重新封印，并按清单校验）。 */
function packFrom(period: AestheticPeriod, tweak: (sheet: AestheticConstraintSheet) => void, requirements: typeof REQUIRED_DECISIONS = REQUIRED_DECISIONS): DecisionPack {
  const sheet = mutate(loadSheetJson(DEFAULT_CONTEXT_BY_PERIOD[period]), tweak);
  return DecisionPack.from(validateSheet(sheet, { allowDirty: !strictBinding() }), requirements);
}

const freshPack = (period: AestheticPeriod) => packFrom(period, () => undefined);

const SYNTHETIC_STRING = "synthetic-distribution";
const SYNTHETIC_NEGATIVE_SPACE = { min: 0.21, max: 0.77 };

/** 所有 PLAN_* 决策的数值改成互不相同的合成数值（负空间边界另给一对有序的值）。 */
function syntheticPlanPack(period: AestheticPeriod): DecisionPack {
  return packFrom(period, (sheet) => {
    let n = 0;
    for (const c of sheet.constraints) {
      if (c.kind !== "OPERATION_POLICY" || !c.payload.subject.startsWith("PLAN_")) continue;
      for (const key of Object.keys(c.payload.params)) c.payload.params[key] = Number((0.017 + 0.0113 * n++).toFixed(4));
      for (const key of Object.keys(c.payload.enums ?? {})) c.payload.enums![key] = SYNTHETIC_STRING;
      if (c.payload.subject === "PLAN_OP_ENCLOSE_BREATHING_FIELD") {
        c.payload.params.negative_space_min = SYNTHETIC_NEGATIVE_SPACE.min;
        c.payload.params.negative_space_max = SYNTHETIC_NEGATIVE_SPACE.max;
      }
    }
  });
}

// ---------------------------------------------------------------------------
// 期望：算子参数的结构（键 → 输出名 / 公式），数值一律从 pack 读取
// ---------------------------------------------------------------------------

interface Readings {
  void: number; subject: number; boundary: number; light: number; material: number;
  solidVoid: number; hostGuest: number; denseSparse: number;
}

const r4 = (x: number): number => Number(x.toFixed(4));

function expectedParameters(op: DesignOperationId, pack: DecisionPack, g: Readings): Record<string, number | string> {
  const policy = pack.policy("OPERATION_POLICY", `PLAN_${op}`);
  const P = (key: string) => policy.num(key);
  switch (op) {
    case "OP_ENCLOSE_BREATHING_FIELD":
      return {
        targetNegativeSpace: r4(Math.min(P("negative_space_max"), Math.max(P("negative_space_min"), g.void + P("negative_space_lift")))),
        aggregationWeight: r4(P("aggregation_base") + g.solidVoid),
        transitionSoftness: P("transition_softness"),
      };
    case "OP_ALIGN_GUEST_HOST_TENSION":
      return { targetFocalOffset: r4(P("focal_offset_base") + g.hostGuest * P("focal_offset_gain")), hostWeight: r4(g.subject), guestWeight: r4(1 - g.subject) };
    case "OP_PARTITION_POISSON_CLUSTER":
      return { targetClusterDensity: r4(g.denseSparse), minDistance: r4(P("min_distance_base") + (1 - g.denseSparse) * P("min_distance_gain")), iterations: P("iterations") };
    case "OP_CALIBRATE_AXIAL_ORDER":
      return { targetAxialSymmetry: r4(g.boundary), axisTolerance: P("axis_tolerance") };
    case "OP_LAYER_DEPTH_RECESSION":
      return { targetDepthLayers: P("target_depth_layers"), recessionRate: P("recession_rate"), hazeStart: P("haze_start") };
    case "OP_INJECT_ATMOSPHERIC_VOID":
      return { targetAtmosphericDensity: r4(g.void * P("density_gain")), falloffExponent: P("falloff_exponent") };
    case "OP_SHIFT_HORIZON_PROPORTION":
      return { targetHorizonPosition: P("target_horizon_position"), transitionBand: P("transition_band") };
    case "OP_FRAME_SECONDARY_OCCLUSION":
      return { targetOcclusionRatio: P("target_occlusion_ratio"), occlusionSoftness: P("occlusion_softness") };
    case "OP_APPLY_TIME_PATINA":
      return { targetPatinaLevel: r4(g.material * P("patina_gain")), patinaDistribution: policy.str("patina_distribution") };
    case "OP_DAMPEN_SPECULAR_HARSHNESS":
      return { targetSpecularSharpness: P("target_specular_sharpness"), dampeningFactor: P("dampening_factor") };
    case "OP_ORCHESTRATE_MATERIAL_CONTRAST":
      return { targetContrastRatio: P("target_contrast_ratio"), contrastBalance: P("contrast_balance") };
    case "OP_WEATHER_SURFACE_ENTROPY":
      return { targetSurfaceEntropy: r4(g.material * P("entropy_gain")), entropyScale: P("entropy_scale") };
    case "OP_HARMONIZE_SKY_LUMINANCE":
      return { targetSkyLuminance: r4(g.light * P("luminance_gain")), harmonizationFactor: P("harmonization_factor") };
    case "OP_COOL_SHADOW_CHROMATICITY":
      return { targetShadowTemperature: P("target_shadow_temperature"), coolingStrength: P("cooling_strength") };
    case "OP_FILTER_MIST_SCATTER":
      return { targetMistDensity: r4(g.void * P("density_gain")), scatterAnisotropy: P("scatter_anisotropy") };
    case "OP_RESTRICT_ACCENT_LUMINANCE":
      return { targetAccentLuminance: P("target_accent_luminance"), restrictionThreshold: P("restriction_threshold") };
  }
}

/** 图给出的读数；图里没有的节点 / 关系用 PLAN_GRAPH_FALLBACKS 的读数。 */
function readingsOf(spec: GraphSpec, pack: DecisionPack): Readings {
  const f = pack.policy("OPERATION_POLICY", "PLAN_GRAPH_FALLBACKS");
  return {
    void: spec.energies.VOID ?? f.num("void_energy"),
    subject: spec.energies.SUBJECT ?? f.num("subject_energy"),
    boundary: spec.energies.BOUNDARY ?? f.num("boundary_energy"),
    light: spec.energies.LIGHT ?? f.num("light_energy"),
    material: spec.energies.MATERIAL ?? f.num("material_energy"),
    solidVoid: spec.magnitudes.SOLID_VOID ?? f.num("solid_void_magnitude"),
    hostGuest: spec.magnitudes.HOST_GUEST ?? f.num("host_guest_magnitude"),
    denseSparse: spec.magnitudes.DENSE_SPARSE ?? f.num("dense_sparse_magnitude"),
  };
}

const FULL_SPEC: GraphSpec = { energies: { VOID: 0.2, SUBJECT: 0.45, BOUNDARY: 0.9, LIGHT: 0.35, MATERIAL: 0.55 }, magnitudes: { SOLID_VOID: 0.3, HOST_GUEST: 0.6, DENSE_SPARSE: 0.9 } };
const EMPTY_SPEC: GraphSpec = { energies: {}, magnitudes: {} };

// ---------------------------------------------------------------------------
// 算子参数
// ---------------------------------------------------------------------------

describe("deriveOperationParameters: 每个数值都来自 sheet 的 PLAN_* 决策", () => {
  test("16 个算子 × 3 个时代 × (完整图 / 空图)：输出与合成 sheet 的数值逐项一致", () => {
    for (const period of PERIODS) {
      const pack = syntheticPlanPack(period);
      withDecisionPack(pack, () => {
        for (const [graph, spec] of [[FULL_GRAPH, FULL_SPEC], [EMPTY_GRAPH, EMPTY_SPEC]] as const) {
          const readings = readingsOf(spec, pack);
          for (const op of OPERATIONS) {
            expect({ op, period, parameters: deriveOperationParameters(op, graph, period) }).toEqual({
              op, period, parameters: expectedParameters(op, pack, readings),
            });
          }
        }
      });
    }
  });

  test("合成数值互不相同：任何读串了键的实现都会被发现", () => {
    const pack = syntheticPlanPack("SONG");
    const values = PLAN_REQUIREMENTS.flatMap((r) =>
      (r.params ?? []).map((key) => pack.policy("OPERATION_POLICY", r.subject!).num(key)),
    ).filter((v) => v !== SYNTHETIC_NEGATIVE_SPACE.min && v !== SYNTHETIC_NEGATIVE_SPACE.max);
    expect(new Set(values).size).toBe(values.length);
  });

  test("OP_ENCLOSE_BREATHING_FIELD 的目标被钳在 sheet 给出的边界内（过低 → 下界，过高 → 上界，其间原样）", () => {
    const pack = syntheticPlanPack("SONG");
    const lift = pack.policy("OPERATION_POLICY", "PLAN_OP_ENCLOSE_BREATHING_FIELD").num("negative_space_lift");
    withDecisionPack(pack, () => {
      const target = (voidEnergy: number) =>
        deriveOperationParameters("OP_ENCLOSE_BREATHING_FIELD", makeGraph({ energies: { VOID: voidEnergy }, magnitudes: {} }), "SONG").targetNegativeSpace;
      expect(target(0)).toBe(SYNTHETIC_NEGATIVE_SPACE.min);
      expect(target(1)).toBe(SYNTHETIC_NEGATIVE_SPACE.max);
      const between = (SYNTHETIC_NEGATIVE_SPACE.min + SYNTHETIC_NEGATIVE_SPACE.max) / 2 - lift;
      expect(target(between)).toBe(r4(between + lift));
    });
  });

  test("真实 sheet：负空间钳制边界就是该语境的有效区间（时代区间 ∩ 物理区间 ∩ 硬下限）", () => {
    for (const ctx of Object.values(GOLDEN_CONTEXTS)) {
      const pack = packFor(ctx);
      const policy = pack.policy("OPERATION_POLICY", "PLAN_OP_ENCLOSE_BREATHING_FIELD");
      const effective = pack.effectiveBand(NEGATIVE_SPACE)!;
      expect(policy.num("negative_space_min")).toBe(effective.min);
      expect(policy.num("negative_space_max")).toBe(effective.max);
    }
  });

  test("真实 sheet：空图与完整图都能推导全部 16 个算子（没有缺失的键）", () => {
    for (const period of PERIODS) {
      for (const graph of [FULL_GRAPH, EMPTY_GRAPH]) {
        for (const op of OPERATIONS) {
          expect(Object.keys(deriveOperationParameters(op, graph, period)).length).toBeGreaterThan(0);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 编译
// ---------------------------------------------------------------------------

describe("compileAestheticExecutionPlan 在 sheet 的作用域内运行", () => {
  test("每个黄金语境：编译成功，负空间目标落在该语境的有效区间内，参数与 deriveOperationParameters 一致", () => {
    for (const ctx of Object.values(GOLDEN_CONTEXTS)) {
      const pack = packFor(ctx);
      const result = withDecisionPack(pack, () => compile(ctx.period));
      expect(result.success).toBe(true);
      const plan = result.plan!;
      const enclose = plan.operations.find((op) => op.operationId === "OP_ENCLOSE_BREATHING_FIELD")!;
      expect(enclose).toBeDefined();
      const effective = pack.effectiveBand(NEGATIVE_SPACE)!;
      const target = enclose.parameters.targetNegativeSpace as number;
      expect(target).toBeGreaterThanOrEqual(effective.min);
      expect(target).toBeLessThanOrEqual(effective.max);
      withDecisionPack(pack, () => {
        for (const op of plan.operations.filter((o) => !o.skippedReason && o.periodConstraintApplied === undefined)) {
          expect(op.parameters).toEqual(deriveOperationParameters(op.operationId, FULL_GRAPH, ctx.period));
        }
      });
    }
  });

  test("合成 sheet 的数值进入计划（计划摘要随 sheet 改变）", () => {
    const real = withDecisionPack(defaultPackFor("SONG"), () => compile("SONG"));
    const pack = syntheticPlanPack("SONG");
    const synthetic = withDecisionPack(pack, () => compile("SONG"));
    expect(synthetic.success).toBe(true);
    expect(synthetic.plan!.planDigest).not.toBe(real.plan!.planDigest);
    const enclose = synthetic.plan!.operations.find((op) => op.operationId === "OP_ENCLOSE_BREATHING_FIELD")!;
    // the operator's own bounds are synthetic here, so the period prior band (a PERIOD_BAND of the same sheet)
    // still applies on top of them: the plan's target is the operator's value clamped into that band
    const expected = expectedParameters("OP_ENCLOSE_BREATHING_FIELD", pack, readingsOf(FULL_SPEC, pack));
    const band = pack.periodBand(NEGATIVE_SPACE)!;
    const key = primaryTargetKey(expected)!;
    const proposed = expected[key] as number;
    expected[key] = Number(Math.min(band.max, Math.max(band.min, proposed)).toFixed(4)); // ssot-ok(NUMERIC_GUARD): plan precision
    expect(enclose.parameters).toEqual(expected);
    expect(Boolean(enclose.periodConstraintApplied)).toBe(expected[key] !== proposed);
  });

  test("时代与生效 sheet 不一致：抛出 DecisionContextMismatchError，不回退、不包装成失败结果", () => {
    withDecisionPack(defaultPackFor("TANG"), () => {
      expect(() => compile("SONG")).toThrow(DecisionContextMismatchError);
      expect(() => deriveOperationParameters("OP_ENCLOSE_BREATHING_FIELD", FULL_GRAPH, "SONG")).toThrow(DecisionContextMismatchError);
    });
  });

  test("没有任何 DecisionPack 在作用域内：抛出 NoDecisionPackError（不存在本地默认值）", () => {
    jest.isolateModules(() => {
      // 隔离的模块注册表里没有安装默认 pack（jest setupFiles 只装在主注册表）
      const { NoDecisionPackError } = require("../../../skill-bridge/active-pack");
      const emitter = require("../../../chinese-aesthetic/compiler/plan-emitter");
      const types = require("../../../chinese-aesthetic/compiler/types");
      expect(() => emitter.compileAestheticExecutionPlan({ intent: makeIntent("SONG"), graph: FULL_GRAPH, compiledAt: "2026-09-16T00:00:00Z" })).toThrow(NoDecisionPackError);
      expect(() => emitter.deriveOperationParameters("OP_ENCLOSE_BREATHING_FIELD", FULL_GRAPH, "SONG")).toThrow(NoDecisionPackError);
      expect(() => types.conflictPriority()).toThrow(NoDecisionPackError);
      expect(() => types.CONFLICT_PRIORITY.composition).toThrow(NoDecisionPackError);
    });
  });
});

describe("sheet 缺少编译器需要的决策：显式失败，不静默补默认值", () => {
  const withoutSubject = (subject: string) => (sheet: AestheticConstraintSheet) => {
    sheet.constraints = sheet.constraints.filter((c) => !(c.kind === "OPERATION_POLICY" && c.payload.subject === subject));
  };

  test("清单拒绝缺少 PLAN_* 决策或其中某个键的 sheet（构造 pack 时就失败）", () => {
    expect(() => packFrom("SONG", withoutSubject("PLAN_OP_LAYER_DEPTH_RECESSION"))).toThrow(/PLAN_OP_LAYER_DEPTH_RECESSION/);
    expect(() => packFrom("SONG", withoutSubject("PLAN_GRAPH_FALLBACKS"))).toThrow(/PLAN_GRAPH_FALLBACKS/);
    expect(() => packFrom("SONG", withoutSubject("PLAN_CONFLICT_TOLERANCE"))).toThrow(/PLAN_CONFLICT_TOLERANCE/);
    expect(() =>
      packFrom("SONG", (sheet) => {
        for (const c of sheet.constraints) if (c.kind === "OPERATION_POLICY" && c.payload.subject === "PLAN_OP_LAYER_DEPTH_RECESSION") delete c.payload.params.haze_start;
      }),
    ).toThrow(/haze_start/);
  });

  test("绕过清单直接读取：compile / derive 抛出 MissingDecisionError（SheetRejectedError），而不是返回 success=false", () => {
    const pack = packFrom("SONG", withoutSubject("PLAN_OP_LAYER_DEPTH_RECESSION"), []); // 不带清单构造
    withDecisionPack(pack, () => {
      expect(() => deriveOperationParameters("OP_LAYER_DEPTH_RECESSION", FULL_GRAPH, "SONG")).toThrow(MissingDecisionError);
      expect(() => compile("SONG")).toThrow(MissingDecisionError);
      expect(() => compile("SONG")).toThrow(SheetRejectedError);
    });
  });

  test("没有 PRIORITY_ORDER 的 sheet 无法确定冲突优先级：失败", () => {
    const pack = packFrom("SONG", (sheet) => { sheet.constraints = sheet.constraints.filter((c) => c.kind !== "PRIORITY_ORDER"); }, []);
    expect(() => conflictPriority(pack)).toThrow(MissingDecisionError);
  });
});

// ---------------------------------------------------------------------------
// 冲突优先级与冲突容差
// ---------------------------------------------------------------------------

describe("冲突优先级由 sheet 的 PRIORITY_ORDER 决定", () => {
  const withOrder = (order: string[]) => packFrom("SONG", (sheet) => {
    for (const c of sheet.constraints) if (c.kind === "PRIORITY_ORDER") c.payload.order = order as typeof c.payload.order;
  });
  const sheetOrder = (): OperationCategory[] =>
    defaultPackFor("SONG").priorityOrder().filter((r): r is OperationCategory => (categories as string[]).includes(r));

  test("秩是 n … 1 的排列，且与顺序一致；CONFLICT_PRIORITY 是同一份数据的即时视图", () => {
    const order = sheetOrder();
    const ranks = conflictPriority(defaultPackFor("SONG"));
    expect(Object.keys(ranks).sort()).toEqual([...categories].sort());
    expect(Object.values(ranks).sort()).toEqual(categories.map((_, i) => i + 1)); // 结构：秩为 1 … n
    order.forEach((category, index) => expect(ranks[category]).toBe(order.length - index));
    for (const category of categories) expect(CONFLICT_PRIORITY[category]).toBe(ranks[category]);
    expect(Object.keys(CONFLICT_PRIORITY).sort()).toEqual([...categories].sort());
  });

  test("顺序被反过来的 sheet：秩与仲裁结果都跟着反过来", () => {
    const reversed = [...sheetOrder()].reverse();
    const pack = withOrder(reversed);
    const ranks = conflictPriority(pack);
    reversed.forEach((category, index) => expect(ranks[category]).toBe(reversed.length - index));
    withDecisionPack(pack, () => {
      for (const category of categories) expect(CONFLICT_PRIORITY[category]).toBe(ranks[category]);
      const [first, last] = [sheetOrder()[0], sheetOrder()[categories.length - 1]];
      const opOf = (category: OperationCategory) => OPERATIONS.find((id) => OPERATION_CATEGORIES[id] === category)!;
      const proposal = (category: OperationCategory, value: number, seq: number) => ({
        seq, operationId: opOf(category), category, target: NEGATIVE_SPACE, parameters: { negativeSpaceRatio: value },
        provenance: { principleRef: "COUNT_WHITE_AS_BLACK" as const, relationRef: "a --[SOLID_VOID]--> b", operationId: opOf(category), parameterMutation: [], provenanceHash: "fnv1a:t" },
      });
      // 提议值相差很大（区间求交失败）→ 按优先级：此时原顺序里最靠后的分类胜出
      const resolution = resolveConflict(NEGATIVE_SPACE, [proposal(first, 0.1, 0), proposal(last, 0.9, 1)]);
      expect(resolution.resolutionStrategy).toBe("priority");
      expect(resolution.winnerOperationId).toBe(opOf(last));
    });
  });

  test("顺序里夹带非算子角色：不占秩，算子分类的相对顺序不变", () => {
    const order = sheetOrder();
    const ranks = conflictPriority(withOrder(["color", ...order, "governance"]));
    expect(ranks).toEqual(conflictPriority(defaultPackFor("SONG")));
  });

  test("顺序缺少某个算子分类：失败（MissingDecisionError）", () => {
    const pack = withOrder(sheetOrder().slice(0, 2));
    expect(() => conflictPriority(pack)).toThrow(MissingDecisionError);
  });
});

describe("冲突解析的区间求交容差来自 sheet 的 PLAN_CONFLICT_TOLERANCE", () => {
  const SYNTHETIC_TOLERANCE = { relative: 0.4, absolute: 0.2 }; // 合成数值，与 skill 里的真实容差不同
  const tolerantPack = () => packFrom("SONG", (sheet) => {
    for (const c of sheet.constraints) {
      if (c.kind === "OPERATION_POLICY" && c.payload.subject === "PLAN_CONFLICT_TOLERANCE") {
        c.payload.params.intersection_relative_tolerance = SYNTHETIC_TOLERANCE.relative;
        c.payload.params.intersection_absolute_tolerance = SYNTHETIC_TOLERANCE.absolute;
      }
    }
  });

  /** 区间求交的参照实现：每个提议 ± max(|v|·相对容差, 绝对容差)，有交集则取中点（4 位小数），否则 null。 */
  const merged = (values: number[], tolerance: { relative: number; absolute: number }): number | null => {
    const halfWidth = (v: number) => Math.max(Math.abs(v) * tolerance.relative, tolerance.absolute);
    const low = Math.max(...values.map((v) => v - halfWidth(v)));
    const high = Math.min(...values.map((v) => v + halfWidth(v)));
    return low <= high ? Number(((low + high) / 2).toFixed(4)) : null;
  };

  const proposals = (values: number[]) =>
    values.map((value, seq) => {
      const category = categories[seq % categories.length];
      const operationId = OPERATIONS.find((id) => OPERATION_CATEGORIES[id] === category)!;
      return {
        seq, operationId, category, target: NEGATIVE_SPACE, parameters: { negativeSpaceRatio: value },
        provenance: { principleRef: "COUNT_WHITE_AS_BLACK" as const, relationRef: "a --[SOLID_VOID]--> b", operationId, parameterMutation: [], provenanceHash: "fnv1a:t" },
      };
    });

  test("合并与否、合并值都跟着 sheet 的容差走（相对容差与绝对容差各有一对提议覆盖）", () => {
    const real = (() => {
      const policy = defaultPackFor("SONG").policy("OPERATION_POLICY", "PLAN_CONFLICT_TOLERANCE");
      return { relative: policy.num("intersection_relative_tolerance"), absolute: policy.num("intersection_absolute_tolerance") };
    })();
    const pairs = [[0.5, 0.9], [0, 0.15], [0.5, 2.0], [0.4, 0.45]];
    let differing = 0;
    for (const pair of pairs) {
      const expected = merged(pair, SYNTHETIC_TOLERANCE);
      if (expected !== merged(pair, real)) differing++;
      const resolution = withDecisionPack(tolerantPack(), () => resolveConflict(NEGATIVE_SPACE, proposals(pair)));
      expect({ pair, strategy: resolution.resolutionStrategy, value: expected === null ? undefined : resolution.resolvedValue }).toEqual({
        pair, strategy: expected === null ? "priority" : "intersection", value: expected === null ? undefined : expected,
      });
    }
    // 参照用的真实容差与合成容差对这几对提议给出不同结论：残留任何一个容差常数都会被发现
    expect(differing).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// 清单与实际读取互相覆盖
// ---------------------------------------------------------------------------

describe("需求清单与编译器的实际读取互相覆盖", () => {
  const declaredKeys = () =>
    new Map(PLAN_REQUIREMENTS.map((r) => [r.subject!, new Set([...(r.params ?? []), ...(r.flags ?? []), ...(r.enums ?? []), ...(r.vectors ?? [])])]));

  test("每个算子都有一条 PLAN_<算子 id> 需求；没有多余的需求项", () => {
    const subjects = PLAN_REQUIREMENTS.map((r) => r.subject!);
    for (const op of OPERATIONS) expect(subjects).toContain(`PLAN_${op}`);
    expect(subjects.filter((s) => s.startsWith("PLAN_OP_")).length).toBe(OPERATIONS.length);
    expect(new Set(subjects).size).toBe(subjects.length);
    for (const r of PLAN_REQUIREMENTS) expect(r.kind).toBe("OPERATION_POLICY");
  });

  test("运行全部编译路径后：读取到的每个 PLAN_* 键都已声明，声明的每个键都被读取过", () => {
    for (const period of PERIODS) {
      const pack = freshPack(period); // 新 pack：使用记录从零开始
      withDecisionPack(pack, () => {
        for (const graph of [FULL_GRAPH, EMPTY_GRAPH]) {
          for (const op of OPERATIONS) deriveOperationParameters(op, graph, period);
          expect(compile(period, graph).success).toBe(true);
        }
        // 冲突解析：区间求交与优先级仲裁两条路径
        const proposal = (category: OperationCategory, value: number, seq: number) => {
          const operationId = OPERATIONS.find((id) => OPERATION_CATEGORIES[id] === category)!;
          return { seq, operationId, category, target: NEGATIVE_SPACE, parameters: { negativeSpaceRatio: value }, provenance: { principleRef: "COUNT_WHITE_AS_BLACK" as const, relationRef: "a --[SOLID_VOID]--> b", operationId, parameterMutation: [], provenanceHash: "fnv1a:t" } };
        };
        resolveConflict(NEGATIVE_SPACE, [proposal(categories[0], 0.5, 0), proposal(categories[1], 0.5, 1)]);
        resolveConflict(NEGATIVE_SPACE, [proposal(categories[0], 0.1, 0), proposal(categories[1], 0.9, 1)]);
        getPeriodConstraints(period);
      });

      const declared = declaredKeys();
      const used = pack.usage().filter((u) => u.kind === "OPERATION_POLICY" && u.subject.startsWith("PLAN_"));
      for (const u of used) expect({ subject: u.subject, key: u.key, declared: declared.get(u.subject)?.has(u.key!) }).toMatchObject({ declared: true });
      for (const [subject, keys] of declared) {
        for (const key of keys) expect({ subject, key, read: used.some((u) => u.subject === subject && u.key === key) }).toMatchObject({ read: true });
      }
      // 冲突优先级（PRIORITY_ORDER 在 governance 清单里声明）与时代区间清单项
      expect(pack.usage().some((u) => u.kind === "PRIORITY_ORDER")).toBe(true);
      expect(REQUIRED_DECISIONS.some((r) => r.kind === "PRIORITY_ORDER")).toBe(true);
      for (const r of PERIOD_BAND_REQUIREMENTS) expect(pack.usage().some((u) => u.kind === "PARAMETER_BAND" && u.subject === r.subject)).toBe(true);
    }
  });
});
