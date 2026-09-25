import type {
  FidelityEvaluationResult,
  RawDesignIR,
  RuntimeExecutionPlan,
  RuntimeAssetInput,
  RenderTarget,
  ValidatedDesignIR,
} from "./contracts";
import { DataGate, type G1Policy } from "./data-gate";
import { HashPolicy } from "./hash-policy";
import { PatchEngine, type GrammarRulePack } from "./patch-engine";
import { CapabilityNegotiator, type HostCapabilities } from "./capability-negotiator";
import type { TierMappingConfig } from "./tier-mapping-types";

export type PipelineOutput =
  | {
      status: "SUCCESS";
      rawIR: RawDesignIR;
      validatedIR: ValidatedDesignIR;
      executionPlan: RuntimeExecutionPlan;
      hashChain: {
        inputHash: string;
        rawIRHash: string;
        validatedIRHash: string;
        executionPlanHash: string;
      };
      timing: {
        distillationExecutionMs: number;
        grammarExecutionMs: number;
        adapterExecutionMs: number;
      };
    }
  | {
      status: "TERMINAL_HALT";
      haltStage: "G1_DATA_GATE" | "G3_CAPABILITY_NEGOTIATOR";
      evaluation: FidelityEvaluationResult;
    };

export interface PipelineRunnerDependencies {
  g1Policy: G1Policy;
  grammar: GrammarRulePack;
  tierConfig: TierMappingConfig;
}

/**
 * Step 4 — deterministic orchestration boundary.
 * G1 blocks before grammar; G3 blocks before downstream execution-plan hashing.
 * Downstream hashes are assembled here and never written into their entities.
 */
export class PipelineRunner {
  private readonly dataGate: DataGate;
  private readonly patchEngine: PatchEngine;
  private readonly capabilityNegotiator: CapabilityNegotiator;

  constructor(dependencies: PipelineRunnerDependencies) {
    this.dataGate = new DataGate(dependencies.g1Policy);
    this.patchEngine = new PatchEngine(dependencies.grammar);
    this.capabilityNegotiator = new CapabilityNegotiator(dependencies.tierConfig);
  }

  public execute(
    rawIR: RawDesignIR,
    hostCaps: HostCapabilities,
    testCaseId: string,
    renderTarget: RenderTarget,
    assetRegistry: RuntimeAssetInput[] = [],
  ): PipelineOutput {
    const inputHash = rawIR.provenance.inputHash;

    const g1 = this.dataGate.execute(rawIR);
    if (g1.kind === "BLOCKED_DATA") {
      return { status: "TERMINAL_HALT", haltStage: "G1_DATA_GATE", evaluation: g1.evaluation };
    }

    const sanitizedRawIR = g1.rawIR;
    const grammarStart = Date.now();
    const validatedIR = this.patchEngine.compile(sanitizedRawIR);
    const grammarExecutionMs = Math.max(0, Date.now() - grammarStart);

    const adapterStart = Date.now();
    const g3 = this.capabilityNegotiator.negotiate(validatedIR, hostCaps, testCaseId, inputHash, renderTarget, assetRegistry);
    const adapterExecutionMs = Math.max(0, Date.now() - adapterStart);

    if (g3.kind === "BLOCKED_ENV") {
      return { status: "TERMINAL_HALT", haltStage: "G3_CAPABILITY_NEGOTIATOR", evaluation: g3.evaluation };
    }

    const validatedIRHash = HashPolicy.computeValidatedIRHash(validatedIR as unknown as Record<string, unknown>);
    const executionPlanHash = HashPolicy.computeExecutionPlanHash(g3.plan as unknown as Record<string, unknown>);

    return {
      status: "SUCCESS",
      rawIR: sanitizedRawIR,
      validatedIR,
      executionPlan: g3.plan,
      hashChain: {
        inputHash,
        rawIRHash: sanitizedRawIR.provenance.rawIRHash,
        validatedIRHash,
        executionPlanHash,
      },
      timing: {
        distillationExecutionMs: sanitizedRawIR.provenance.inferenceExecutionMs,
        grammarExecutionMs,
        adapterExecutionMs,
      },
    };
  }
}
