import type { DecisionRequirement } from "../decision-pack";

/**
 * Decisions the aesthetic plan compiler reads (chinese-aesthetic/compiler: plan-emitter.ts,
 * conflict-resolver.ts). Skill family CAS-OT; one OPERATION_POLICY per design operator
 * (subject PLAN_<operator id>), plus the neutral graph readings and the conflict tolerance.
 *
 * The conflict priority order (PRIORITY_ORDER) is declared once, in governance.ts. The period bands
 * the plan clamps against are declared in period-bands.ts.
 */
export const PLAN_REQUIREMENTS: readonly DecisionRequirement[] = [
  {
    kind: "OPERATION_POLICY",
    subject: "PLAN_GRAPH_FALLBACKS",
    params: [
      "void_energy",
      "subject_energy",
      "boundary_energy",
      "light_energy",
      "material_energy",
      "solid_void_magnitude",
      "host_guest_magnitude",
      "dense_sparse_magnitude",
    ],
  },
  {
    kind: "OPERATION_POLICY",
    subject: "PLAN_CONFLICT_TOLERANCE",
    params: ["intersection_relative_tolerance", "intersection_absolute_tolerance"],
  },
  // composition
  {
    kind: "OPERATION_POLICY",
    subject: "PLAN_OP_ENCLOSE_BREATHING_FIELD",
    params: ["negative_space_lift", "negative_space_min", "negative_space_max", "aggregation_base", "transition_softness"],
  },
  { kind: "OPERATION_POLICY", subject: "PLAN_OP_ALIGN_GUEST_HOST_TENSION", params: ["focal_offset_base", "focal_offset_gain"] },
  { kind: "OPERATION_POLICY", subject: "PLAN_OP_PARTITION_POISSON_CLUSTER", params: ["min_distance_base", "min_distance_gain", "iterations"] },
  { kind: "OPERATION_POLICY", subject: "PLAN_OP_CALIBRATE_AXIAL_ORDER", params: ["axis_tolerance"] },
  // spatial
  { kind: "OPERATION_POLICY", subject: "PLAN_OP_LAYER_DEPTH_RECESSION", params: ["target_depth_layers", "recession_rate", "haze_start"] },
  { kind: "OPERATION_POLICY", subject: "PLAN_OP_INJECT_ATMOSPHERIC_VOID", params: ["density_gain", "falloff_exponent"] },
  { kind: "OPERATION_POLICY", subject: "PLAN_OP_SHIFT_HORIZON_PROPORTION", params: ["target_horizon_position", "transition_band"] },
  { kind: "OPERATION_POLICY", subject: "PLAN_OP_FRAME_SECONDARY_OCCLUSION", params: ["target_occlusion_ratio", "occlusion_softness"] },
  // material
  { kind: "OPERATION_POLICY", subject: "PLAN_OP_APPLY_TIME_PATINA", params: ["patina_gain"], enums: ["patina_distribution"] },
  { kind: "OPERATION_POLICY", subject: "PLAN_OP_DAMPEN_SPECULAR_HARSHNESS", params: ["target_specular_sharpness", "dampening_factor"] },
  { kind: "OPERATION_POLICY", subject: "PLAN_OP_ORCHESTRATE_MATERIAL_CONTRAST", params: ["target_contrast_ratio", "contrast_balance"] },
  { kind: "OPERATION_POLICY", subject: "PLAN_OP_WEATHER_SURFACE_ENTROPY", params: ["entropy_gain", "entropy_scale"] },
  // lighting
  { kind: "OPERATION_POLICY", subject: "PLAN_OP_HARMONIZE_SKY_LUMINANCE", params: ["luminance_gain", "harmonization_factor"] },
  { kind: "OPERATION_POLICY", subject: "PLAN_OP_COOL_SHADOW_CHROMATICITY", params: ["target_shadow_temperature", "cooling_strength"] },
  { kind: "OPERATION_POLICY", subject: "PLAN_OP_FILTER_MIST_SCATTER", params: ["density_gain", "scatter_anisotropy"] },
  { kind: "OPERATION_POLICY", subject: "PLAN_OP_RESTRICT_ACCENT_LUMINANCE", params: ["target_accent_luminance", "restriction_threshold"] },
];
