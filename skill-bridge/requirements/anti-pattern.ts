import type { DecisionRequirement } from "../decision-pack";

/**
 * What the five threshold-driven anti-pattern gates (chinese-aesthetic/anti-pattern/gates, ANTI-01..05)
 * read from the sheet: one ANTI_PATTERN_THRESHOLD decision per gate. Names only, never values.
 * ANTI-06 (fake evidence) is an evidence-integrity check and reads no aesthetic decision.
 */
export const ANTI_PATTERN_REQUIREMENTS: readonly DecisionRequirement[] = [
  {
    kind: "ANTI_PATTERN_THRESHOLD",
    subject: "symbolic-stacking",
    params: [
      "many_nodes_min",
      "low_average_degree_below",
      "convergence_in_degree_min",
      "isolated_nodes_min",
      "reject_severe_signals_min",
      "flag_severe_signals_min",
      "confidence_reject",
      "confidence_flag",
      "confidence_allow",
    ],
  },
  {
    kind: "ANTI_PATTERN_THRESHOLD",
    subject: "unphysical-glow",
    params: [
      "micro_surface_variance_below",
      "specular_sharpness_above",
      "specular_highlight_ratio_above",
      "surface_variation_below",
      "confidence_reject",
      "confidence_flag",
      "confidence_allow",
    ],
  },
  {
    kind: "ANTI_PATTERN_THRESHOLD",
    subject: "dead-void",
    params: [
      "candidate_void_ratio_above",
      "dominant_void_region_ratio_above",
      "laplacian_variance_below",
      "block_luminance_gradient_below",
      "luminance_std_below",
      "confidence_reject",
      "confidence_flag_no_depth",
      "confidence_flag",
      "confidence_allow",
    ],
  },
  {
    kind: "ANTI_PATTERN_THRESHOLD",
    subject: "conflicted-hierarchy",
    params: [
      "close_energy_diff_ratio_below",
      "confidence_reject",
      "confidence_flag",
      "confidence_allow_no_subject",
      "confidence_allow",
    ],
  },
  {
    kind: "ANTI_PATTERN_THRESHOLD",
    subject: "toxic-saturation",
    params: [
      "dominant_color_ratio_above",
      "contrast_ratio_above",
      "luminance_std_below",
      "temperature_bias_abs_above",
      "confidence_reject",
      "confidence_flag",
      "confidence_allow_paradigm",
      "confidence_allow",
    ],
    lists: ["high_saturation_paradigms"],
  },
];
