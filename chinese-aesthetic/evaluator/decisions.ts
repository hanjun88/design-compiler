/**
 * The evaluators' only door to aesthetic decisions.
 *
 * Every threshold the machine evaluator, the semantic evaluator and the human-audit ledger judge
 * against is a decision of the chinese-aesthetic-skill, delivered as an AestheticConstraintSheet and
 * read through the DecisionPack (family CAS-EV in the skill's rule registry, plus the period bands
 * of CAS-VS). Nothing under chinese-aesthetic/evaluator declares an aesthetic number: a missing
 * decision throws (no silent default) and a pack of the wrong period is a hard error.
 */
import { requireDecisionPack } from "../../skill-bridge/active-pack";
import { MissingDecisionError, type AestheticPeriodId, type DecisionPack, type PolicyView } from "../../skill-bridge/decision-pack";

/** EVALUATION_ASSERTION subjects of the skill's CAS-EV family (one per machine assertion / semantic dimension). */
export const EVAL_SUBJECT = {
  focalHierarchy: "EVAL_MACHINE_FOCAL_HIERARCHY",
  qiyunContinuity: "EVAL_MACHINE_QIYUN_CONTINUITY",
  spatialDepth: "EVAL_MACHINE_SPATIAL_DEPTH",
  colorRelationship: "EVAL_MACHINE_COLOR_RELATIONSHIP",
  binzhuYirang: "EVAL_SEMANTIC_BINZHU_YIRANG",
  jibaiDanghei: "EVAL_SEMANTIC_JIBAI_DANGHEI",
  xushiXiangsheng: "EVAL_SEMANTIC_XUSHI_XIANGSHENG",
  qiyunLiangguan: "EVAL_SEMANTIC_QIYUN_LIANGGUAN",
  hanxuYuliubai: "EVAL_SEMANTIC_HANXU_YULIUBAI",
  cengciYuanjin: "EVAL_SEMANTIC_CENGCI_YUANJIN",
  xingshenGuanxi: "EVAL_SEMANTIC_XINGSHEN_GUANXI",
  shijianDongshi: "EVAL_SEMANTIC_SHIJIAN_DONGSHI",
} as const;

/**
 * The scene parameter every void-ratio (留白) judgement is expressed in: the Core IR value
 * /composition/negativeSpaceRatio, i.e. the designed-void share of the frame (ADR-0001).
 */
export const NEGATIVE_SPACE_PARAMETER = "scene.composition.negativeSpaceRatio";

const PERIODS: readonly AestheticPeriodId[] = ["TANG", "SONG", "MING"];

/** The period a declared paradigm names; undefined when it names none (the active pack then decides). */
export function periodOfParadigm(paradigm: string | undefined): AestheticPeriodId | undefined {
  return PERIODS.find((p) => p === paradigm);
}

/**
 * The active DecisionPack for a decision that depends on the period. When the declared paradigm is
 * one of the sheet periods the pack must be of that period (DecisionContextMismatchError otherwise,
 * never a fallback); any other paradigm leaves the choice to the active pack.
 */
export function decisionPackFor(paradigm?: string): DecisionPack {
  return requireDecisionPack(periodOfParadigm(paradigm));
}

/** The EVALUATION_ASSERTION decision of one subject (reading a missing key throws). */
export function evaluationPolicy(pack: DecisionPack, subject: string): PolicyView {
  return pack.policy("EVALUATION_ASSERTION", subject);
}

/** A closed interval [min, max] on a ratio. */
export interface ClosedBand {
  readonly min: number;
  readonly max: number;
}

/**
 * The effective void-ratio band of the context: the intersection of the period band, the physical
 * range and any hard floor (ADR-0001). This replaces every private bound an evaluator used to carry.
 */
export function negativeSpaceBand(pack: DecisionPack): ClosedBand {
  const band = pack.effectiveBand(NEGATIVE_SPACE_PARAMETER);
  if (!band) throw new MissingDecisionError(`PARAMETER_BAND ${NEGATIVE_SPACE_PARAMETER}`);
  return { min: band.min, max: band.max };
}
