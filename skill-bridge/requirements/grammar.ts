import type { DecisionRequirement } from "../decision-pack";

/** Vocabulary the design grammar tables are keyed by (names only, never values). */
const PRINCIPLE_KEYS = ["count_white_as_black", "void_solid_interplay", "guest_host_comity", "position_management", "scale_proportion", "material_patina", "light_temporality", "qi_yun_continuity"] as const;
const RELATION_KEYS = ["solid_void", "host_guest", "center_edge", "dense_sparse", "near_far", "high_low", "heavy_light", "move_still"] as const;

export const GRAMMAR_REQUIREMENTS: readonly DecisionRequirement[] = [
  { kind: "OPERATION_POLICY", subject: "PERIOD_PRINCIPLES", lists: ["principles"] },
  { kind: "OPERATION_POLICY", subject: "PRINCIPLE_OPERATIONS", lists: PRINCIPLE_KEYS },
  { kind: "OPERATION_POLICY", subject: "RELATION_OPERATIONS", lists: RELATION_KEYS },
];
