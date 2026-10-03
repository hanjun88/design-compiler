/**
 * The compiler's single entry for an aesthetic compilation.
 *
 *   skill sheet (raw JSON) -> validateSheet (schema + semantic invariants + version binding, fail closed)
 *     -> DecisionPack (+ requirements manifest) -> sheetToCangjieIR(brief) -> normalizeIntent
 *     -> PipelineRunner [G1 -> RFC 6902 patches from the sheet's grammar rules -> G3] -> ProvenanceLedger
 *
 * Every aesthetic number on this path comes from the sheet; the ledger names, for every patch and every
 * decision read, the rule / decision / sources and the skill commit they trace back to.
 */
import { PipelineRunner, type PipelineOutput } from "../compiler-core/pipeline-runner";
import type { G1Policy } from "../compiler-core/data-gate";
import type { HostCapabilities } from "../compiler-core/capability-negotiator";
import type { TierMappingConfig } from "../compiler-core/tier-mapping-types";
import { normalizeIntent } from "../compiler-intent/intent-normalizer";
import type { CangjieRawDesignIR, NormalizationResult } from "../compiler-intent/types";
import { withDecisionPack } from "./active-pack";
import { DecisionPack } from "./decision-pack";
import { buildLedger, type ProvenanceLedger } from "./provenance-ledger";
import { REQUIRED_DECISIONS } from "./requirements";
import { sheetToCangjieIR, type SeededParameter } from "./sheet-to-ir";
import { validateSheet, type ValidateOptions } from "./sheet-validator";

export interface CompileWithSheetInput {
  /** The sheet exactly as the skill emitted it. */
  sheet: unknown;
  /** The design under compilation (content decisions; aesthetic parameters it omits are seeded from the sheet). */
  brief: CangjieRawDesignIR;
  validation?: ValidateOptions;
  g1Policy: G1Policy;
  tierConfig: TierMappingConfig;
  hostCapabilities: HostCapabilities;
  testCaseId: string;
  /** Deterministic capture/compile time of the normalisation and the patch stage (never new Date()). */
  capturedAt: string;
}

export interface CompileWithSheetResult {
  pack: DecisionPack;
  seeded: SeededParameter[];
  normalization: NormalizationResult;
  /** Present when normalisation passed; SUCCESS or the terminal halt of G1 / G3. */
  pipeline?: PipelineOutput;
  /** Present on SUCCESS. */
  ledger?: ProvenanceLedger;
}

export function compileWithSheet(input: CompileWithSheetInput): CompileWithSheetResult {
  const validated = validateSheet(input.sheet, input.validation);
  const pack = DecisionPack.from(validated, REQUIRED_DECISIONS);
  const { ir, seeded } = sheetToCangjieIR(pack, input.brief);
  const normalization = normalizeIntent(ir as CangjieRawDesignIR, { capturedAt: input.capturedAt });
  if (normalization.status !== "PASS") return { pack, seeded, normalization };

  const pipeline = withDecisionPack(pack, () =>
    new PipelineRunner({ g1Policy: input.g1Policy, grammar: pack.grammarRulePack(), tierConfig: input.tierConfig, compiledAt: input.capturedAt }).execute(
      normalization.coreIR,
      input.hostCapabilities,
      input.testCaseId,
    ),
  );
  if (pipeline.status !== "SUCCESS") return { pack, seeded, normalization, pipeline };
  const ledger = buildLedger({ pack, chain: pipeline.hashChain, patches: pipeline.validatedIR.patches });
  return { pack, seeded, normalization, pipeline, ledger };
}
