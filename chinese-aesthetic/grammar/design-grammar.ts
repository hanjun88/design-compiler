/**
 * Design grammar as decided by the skill.
 *
 * Which principles are in force for a period, which operators a principle can drive and which
 * operators a relation edge can trigger are aesthetic knowledge. They are carried by the sheet
 * (OPERATION_POLICY subjects PERIOD_PRINCIPLES / PRINCIPLE_OPERATIONS / RELATION_OPERATIONS) and
 * read here; this module only validates the vocabulary the compiler can execute.
 */
import { requireDecisionPack } from "../../skill-bridge/active-pack";
import type { AestheticPrinciple } from "../intent/types";
import { OPERATION_CATEGORIES, type AestheticPeriod, type DesignOperationId } from "../operations/types";

/** Vocabulary of principles the intent contract can carry (a contract enumeration, not a decision). */
export const KNOWN_PRINCIPLES: readonly AestheticPrinciple[] = [
  "COUNT_WHITE_AS_BLACK",
  "VOID_SOLID_INTERPLAY",
  "GUEST_HOST_COMITY",
  "POSITION_MANAGEMENT",
  "SCALE_PROPORTION",
  "MATERIAL_PATINA",
  "LIGHT_TEMPORALITY",
  "QI_YUN_CONTINUITY",
];

export class DesignGrammarError extends Error {
  constructor(message: string) {
    super(`design grammar from the aesthetic sheet: ${message}`);
    this.name = "DesignGrammarError";
  }
}

const isOperation = (id: string): id is DesignOperationId => id in OPERATION_CATEGORIES;
const isPrinciple = (id: string): id is AestheticPrinciple => (KNOWN_PRINCIPLES as readonly string[]).includes(id);

/** Principles in force for `period`, in the sheet's order. */
export function principlesFor(period: AestheticPeriod): AestheticPrinciple[] {
  const list = requireDecisionPack(period).policy("OPERATION_POLICY", "PERIOD_PRINCIPLES").list("principles");
  const bad = list.filter((p) => !isPrinciple(p));
  if (bad.length) throw new DesignGrammarError(`PERIOD_PRINCIPLES names principles this compiler cannot execute: ${bad.join(", ")}`);
  return [...list] as AestheticPrinciple[];
}

function operationTable(subject: "PRINCIPLE_OPERATIONS" | "RELATION_OPERATIONS", keys: readonly string[], period?: AestheticPeriod): Record<string, DesignOperationId[]> {
  const policy = requireDecisionPack(period).policy("OPERATION_POLICY", subject);
  const out: Record<string, DesignOperationId[]> = {};
  for (const key of keys) {
    const ops = policy.list(key.toLowerCase());
    const bad = ops.filter((o) => !isOperation(o));
    if (bad.length) throw new DesignGrammarError(`${subject}.${key} names operators this compiler does not have: ${bad.join(", ")}`);
    out[key] = [...ops] as DesignOperationId[];
  }
  return out;
}

/** principle -> operators it can drive. */
export const principleOperations = (period?: AestheticPeriod): Record<AestheticPrinciple, DesignOperationId[]> =>
  operationTable("PRINCIPLE_OPERATIONS", KNOWN_PRINCIPLES, period) as Record<AestheticPrinciple, DesignOperationId[]>;

/** Relation types the graph can produce (a contract enumeration, not a decision). */
export const KNOWN_RELATIONS = ["SOLID_VOID", "HOST_GUEST", "CENTER_EDGE", "DENSE_SPARSE", "NEAR_FAR", "HIGH_LOW", "HEAVY_LIGHT", "MOVE_STILL"] as const;

/** relation type -> operators it can trigger. */
export const relationOperations = (period?: AestheticPeriod): Record<string, DesignOperationId[]> =>
  operationTable("RELATION_OPERATIONS", KNOWN_RELATIONS, period);
