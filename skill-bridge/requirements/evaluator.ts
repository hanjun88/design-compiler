import type { DecisionRequirement } from "../decision-pack";

/**
 * Decisions read by chinese-aesthetic/evaluator/** (machine + semantic evaluators) and by the
 * human-audit ledger (chinese-aesthetic/scene-pack/evidence/human-audit-ledger.ts). Names only,
 * never values. Subjects are the CAS-EV rules of the skill's registry (one per machine assertion /
 * semantic dimension).
 */
export const EVALUATOR_REQUIREMENTS: readonly DecisionRequirement[] = [
  // Void-ratio plausibility is not an evaluator decision: the evaluators judge against the context's
  // effective band, the human-audit ledger records the period band as its ideal range (ADR-0001).
  { kind: "PARAMETER_BAND", subject: "scene.composition.negativeSpaceRatio" },
  // The human-audit ledger's composition-order entry is judged against the period's axial-symmetry band.
  { kind: "PARAMETER_BAND", subject: "scene.composition.axialSymmetry" },

  // ---- machine assertions ----
  {
    kind: "EVALUATION_ASSERTION",
    subject: "EVAL_MACHINE_FOCAL_HIERARCHY",
    params: ["max_focal_center_offset", "min_dominance_separation", "min_dominant_area_ratio", "max_dominant_area_ratio", "min_luminance_peaks_for_tiers"],
  },
  {
    kind: "EVALUATION_ASSERTION",
    subject: "EVAL_MACHINE_QIYUN_CONTINUITY",
    params: ["min_motion_continuity", "min_optical_flow_coherence"],
  },
  {
    kind: "EVALUATION_ASSERTION",
    subject: "EVAL_MACHINE_SPATIAL_DEPTH",
    params: ["min_depth_layer_count", "min_depth_layer_count_inconclusive"],
  },
  {
    kind: "EVALUATION_ASSERTION",
    subject: "EVAL_MACHINE_COLOR_RELATIONSHIP",
    params: ["min_contrast_ratio"],
    flags: ["require_distinct_palette"],
  },

  // ---- semantic dimensions ----
  {
    kind: "EVALUATION_ASSERTION",
    subject: "EVAL_SEMANTIC_BINZHU_YIRANG",
    params: ["max_focal_center_offset", "min_dominance_separation", "focal_clear_weight", "separation_clear_weight", "pass_evidence_strength", "inconclusive_evidence_strength"],
  },
  {
    kind: "EVALUATION_ASSERTION",
    subject: "EVAL_SEMANTIC_JIBAI_DANGHEI",
    params: ["min_empty_region_continuity"],
  },
  {
    kind: "EVALUATION_ASSERTION",
    subject: "EVAL_SEMANTIC_XUSHI_XIANGSHENG",
    params: ["min_void_presence", "min_depth_layer_count", "min_atmospheric_depth"],
  },
  {
    kind: "EVALUATION_ASSERTION",
    subject: "EVAL_SEMANTIC_QIYUN_LIANGGUAN",
    params: ["min_motion_continuity", "min_optical_flow_coherence", "min_luminance_continuity", "pass_evidence_count", "inconclusive_evidence_count"],
  },
  {
    kind: "EVALUATION_ASSERTION",
    subject: "EVAL_SEMANTIC_HANXU_YULIUBAI",
    params: ["min_void_presence", "max_accent_isolation", "min_contrast_ratio", "max_contrast_ratio"],
  },
  {
    kind: "EVALUATION_ASSERTION",
    subject: "EVAL_SEMANTIC_CENGCI_YUANJIN",
    params: ["min_depth_layer_count", "min_layer_separation", "min_atmospheric_depth"],
  },
  {
    kind: "EVALUATION_ASSERTION",
    subject: "EVAL_SEMANTIC_XINGSHEN_GUANXI",
    params: ["max_focal_center_offset", "min_micro_detail_distribution"],
  },
  {
    kind: "EVALUATION_ASSERTION",
    subject: "EVAL_SEMANTIC_SHIJIAN_DONGSHI",
    params: ["min_motion_continuity", "min_camera_motion_smoothness", "min_optical_flow_coherence"],
  },
];
