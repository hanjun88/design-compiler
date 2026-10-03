/**
 * What the design operators (chinese-aesthetic/operations) and the SOLID_VOID graph deriver read from
 * the AestheticConstraintSheet: OPERATION_POLICY decisions, by operator id, with the keys each one
 * reads. Names only, never values. The record is exhaustive over DesignOperationId, so adding an
 * operator without declaring its policy keys is a compile error.
 */
import type { DecisionRequirement } from "../decision-pack";
import type { DesignOperationId } from "../../chinese-aesthetic/operations/types";

interface PolicyKeys {
  readonly params: readonly string[];
  readonly flags?: readonly string[];
}

const OPERATOR_POLICY_KEYS: Record<DesignOperationId, PolicyKeys> = {
  OP_ENCLOSE_BREATHING_FIELD: {
    params: ["solid_void_enclosed_magnitude", "enclosure_gain", "negative_space_min", "negative_space_max"],
  },
  OP_ALIGN_GUEST_HOST_TENSION: {
    params: ["target_ratio", "centering_strength"],
  },
  OP_PARTITION_POISSON_CLUSTER: {
    params: ["dense_sparse_contrast_magnitude", "symmetry_reduction_gain", "symmetry_min", "symmetry_max"],
  },
  OP_CALIBRATE_AXIAL_ORDER: {
    params: ["axial_symmetry_target"],
    flags: ["applies_to_period"],
  },
  OP_LAYER_DEPTH_RECESSION: {
    params: ["target_layers", "near_far_present_magnitude"],
  },
  OP_INJECT_ATMOSPHERIC_VOID: {
    params: ["boundary_energy_min", "ambient_gain", "ambient_min", "ambient_max"],
  },
  OP_SHIFT_HORIZON_PROPORTION: {
    params: ["target_angle", "mediocre_angle_band"],
  },
  OP_FRAME_SECONDARY_OCCLUSION: {
    params: ["open_close_contained_magnitude", "framing_gain", "negative_space_compression", "negative_space_min", "negative_space_max"],
  },
  OP_APPLY_TIME_PATINA: {
    params: ["material_energy_varied", "patina_gain", "roughness_gain", "roughness_min", "roughness_max", "wear_gain", "wear_min", "wear_max"],
  },
  OP_DAMPEN_SPECULAR_HARSHNESS: {
    params: ["heavy_light_harsh_magnitude", "dampen_gain", "softness_min", "softness_max"],
  },
  OP_ORCHESTRATE_MATERIAL_CONTRAST: {
    params: ["roughness_low_target", "roughness_high_target", "spread_satisfied_fraction"],
  },
  OP_WEATHER_SURFACE_ENTROPY: {
    params: ["time_energy_weathered", "entropy_gain", "wear_min", "wear_max"],
  },
  OP_HARMONIZE_SKY_LUMINANCE: {
    params: ["light_energy_conflict", "harmonize_gain", "intensity_min", "intensity_max"],
  },
  OP_COOL_SHADOW_CHROMATICITY: {
    params: ["high_low_differentiated_magnitude", "shadow_gain", "ambient_min", "ambient_max"],
  },
  OP_FILTER_MIST_SCATTER: {
    params: ["hard_light_energy_min", "hard_light_softness_max", "scatter_gain", "softness_min", "softness_max", "ambient_scatter_fraction", "ambient_min", "ambient_max"],
  },
  OP_RESTRICT_ACCENT_LUMINANCE: {
    params: ["accent_area_limit", "accent_proxy_scale", "intensity_reduction_gain", "intensity_min", "intensity_max"],
  },
};

export const OPERATION_REQUIREMENTS: readonly DecisionRequirement[] = [
  ...(Object.entries(OPERATOR_POLICY_KEYS) as Array<[DesignOperationId, PolicyKeys]>).map(
    ([subject, keys]): DecisionRequirement => ({
      kind: "OPERATION_POLICY",
      subject,
      params: keys.params,
      ...(keys.flags ? { flags: keys.flags } : {}),
    }),
  ),
  // chinese-aesthetic/graph/derivers/solid-void.ts: interpretation parameters of the SOLID_VOID relation
  {
    kind: "OPERATION_POLICY",
    subject: "GRAPH_SOLID_VOID",
    params: ["optimal_ratio", "ratio_spread", "component_limit", "integrity_weight"],
  },
];
