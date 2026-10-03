/**
 * Sheet -> RawDesignIR.
 *
 * The compiler turns a design BRIEF (a CangjieRawDesignIR: the content decisions of one design —
 * shot, focal point, subject colours, authored parameter values) plus the skill's validated
 * AestheticConstraintSheet into the IR the Core pipeline consumes:
 *   - every aesthetic parameter the brief leaves out is seeded from the sheet's DESIGN_DEFAULT
 *     decision for its Core IR pointer (value, confidence and provenance come from the sheet);
 *   - the IR is stamped with the sheet identity (grammarVersion), which the semantic input hash covers,
 *     so the hash chain of every compilation is bound to the exact sheet that governed it;
 *   - parameters the brief does supply are never overwritten: the grammar rules of the same sheet
 *     judge and, where needed, repair them through RFC 6902 patches.
 * No aesthetic number is defined here.
 */
import type { CangjieEstimatedParameter, CangjieRawDesignIR } from "../compiler-intent/types";
import type { DecisionPack } from "./decision-pack";

export interface SeededParameter {
  path: string;
  paramId: string;
  decision_id: string;
  rule_id: string;
  value: number;
}

export interface SheetIRResult {
  ir: CangjieRawDesignIR;
  seeded: SeededParameter[];
}

const paramIdOf = (pointer: string): string =>
  pointer.replace(/^\//, "").replace(/\/(\d+)\//, "-$1-").replace(/\//g, "-").replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

/** Stable grammar-version string carried by the IR: skill version + the sheet content hash prefix. */
export function sheetGrammarVersion(pack: DecisionPack): string {
  return `chinese-aesthetic-skill@${pack.provenance.skill_version}+sheet.${pack.sheetHash.slice(0, 12)}`;
}

export function sheetToCangjieIR(pack: DecisionPack, brief: CangjieRawDesignIR): SheetIRResult {
  const ir = JSON.parse(JSON.stringify(brief)) as CangjieRawDesignIR;
  const present = new Set(ir.parameters.map((p) => p.path));
  const seeded: SeededParameter[] = [];

  for (const band of pack.allBands()) {
    if (band.semantics !== "DESIGN_DEFAULT" || band.target === undefined || !band.ir_pointer) continue;
    if (present.has(band.ir_pointer)) continue; // the brief decides; the grammar judges
    const param: CangjieEstimatedParameter = {
      paramId: paramIdOf(band.ir_pointer),
      path: band.ir_pointer,
      value: band.target,
      unit: band.unit,
      confidence: band.confidence,
      source: { type: "derived", ref: band.decision_id },
      calibration: { method: "uncalibrated", status: "EXPERIMENTAL" },
    };
    ir.parameters.push(param);
    present.add(band.ir_pointer);
    seeded.push({ path: band.ir_pointer, paramId: param.paramId, decision_id: band.decision_id, rule_id: band.rule_id, value: band.target });
  }

  ir.grammarVersion = sheetGrammarVersion(pack);
  ir.metadata = {
    ...(ir.metadata ?? {}),
    aestheticSheet: { ...pack.provenance },
    seededFromSheet: seeded.map((s) => s.paramId),
  };
  return { ir, seeded };
}
