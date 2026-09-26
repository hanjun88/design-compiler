/**
 * aesthetic-pipeline-runner.ts
 *
 * End-to-end pipeline runner that wires the AestheticConstraintSheet through
 * the full DC compilation chain:
 *
 *   AestheticConstraintSheet
 *     → AestheticSheetAdapter (CAS contract A, DC-side independent impl)
 *     → normalizeIntent (compiler-intent: Cangjie IR → Core RawDesignIR)
 *     → PipelineRunner.execute (G1 Data Gate → G2 PatchEngine → G3 CapabilityNegotiator)
 *     → PipelineOutput (SUCCESS + hashChain / TERMINAL_HALT)
 *
 * This runner loads the real DC config files (g1-policy.json, grammar-rules.json,
 * tier-mapping.json) and constructs a real PipelineRunner instance — no mocks.
 *
 * Hard constraints:
 * - Does NOT modify any compiler-core/ files.
 * - Does NOT modify schemas/ JSON files.
 * - All timestamps are caller-supplied for deterministic hashing.
 *
 * @module aesthetic-integration/aesthetic-pipeline-runner
 */

import * as fs from "fs";
import * as path from "path";

import { PipelineRunner, type PipelineOutput } from "../compiler-core/pipeline-runner";
import type { G1Policy } from "../compiler-core/data-gate";
import type { GrammarRulePack } from "../compiler-core/patch-engine";
import type { HostCapabilities } from "../compiler-core/capability-negotiator";
import type { TierMappingConfig } from "../compiler-core/tier-mapping-types";
import type { FidelityEvaluationResult, RawDesignIR } from "../compiler-core/contracts";
import type { AestheticGateResult } from "../compiler-core/aesthetic-gate-types";
import { normalizeIntent } from "../compiler-intent/intent-normalizer";
import type { CangjieRawDesignIR, NormalizationResult } from "../compiler-intent/types";

import { AestheticGate, loadAntiClicheConfig } from "./anti-cliche-gate";
import {
  sheetToCangjieIR,
  type AestheticConstraintSheet,
  type AestheticSheetAdapterOptions,
  type AestheticSheetAdapterResult,
} from "./aesthetic-sheet-adapter";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for the aesthetic pipeline runner.
 */
export interface AestheticPipelineOptions {
  /**
   * Explicit deterministic timestamp (ISO 8601 date-time).
   * Must be supplied — the runner never calls new Date() on the semantic path.
   */
  capturedAt: string;
  /** Test case ID passed to the pipeline (appears in evaluation records). */
  testCaseId?: string;
  /** Distiller version stamped into the Cangjie IR. */
  distillerVersion?: string;
  /** Override the G1 confidence floor (default: read from config/g1-policy.json). */
  confidenceFloor?: number;
  /** Per-path confidence overrides forwarded to the adapter (for G1 tests). */
  confidenceOverrides?: Record<string, number>;
  /** Per-path calibration overrides forwarded to the adapter. */
  calibrationOverrides?: Record<string, "PRODUCTION" | "EXPERIMENTAL" | "DEPRECATED">;
  /** Inference execution time (ms) recorded in provenance. Defaults to 0. */
  inferenceExecutionMs?: number;
  /**
   * Toggle the G2.5 AestheticGate. Defaults to `true`. When `false` (or when
   * the loaded gate config itself has `enabled: false`), the post-G2 scene is
   * returned untouched and no G2.5 TERMINAL_HALT can occur.
   */
  aestheticGateEnabled?: boolean;
}

/**
 * G2.5 AestheticGate terminal halt.
 *
 * Returned in place of a `SUCCESS` PipelineOutput when the post-G2 scene graph
 * contains a P0 anti-cliche violation. The gate runs *after* the real
 * PipelineRunner reaches SUCCESS (G1→G2→G3 negotiated a plan), but a veto means
 * the execution plan must NOT be handed to the renderer — so no `executionPlan`
 * is exposed on this variant.
 *
 * This is NOT part of compiler-core `PipelineOutput` (which only knows G1/G3
 * halts); it is the aesthetic integration layer's own terminal variant.
 */
export interface AestheticGateTerminalHalt {
  status: "TERMINAL_HALT";
  haltStage: "G2.5_AESTHETIC_GATE";
  /** FAIL evaluation recording every vetoed ruleId/message in diagnostics. */
  evaluation: FidelityEvaluationResult;
  /** The structured gate result (passed=false, all violations). */
  aestheticGate: AestheticGateResult;
}

/**
 * The pipeline output after the G2.5 gate layer is wired in.
 *
 * - The ordinary compiler-core `PipelineOutput` (SUCCESS, or a G1/G3 halt), OR
 * - a G2.5 `AestheticGateTerminalHalt` produced by the aesthetic gate vetoing a
 *   post-G2 cliche design.
 */
export type AestheticPipelineOutput = PipelineOutput | AestheticGateTerminalHalt;

/**
 * Full result of running an aesthetic sheet through the pipeline.
 */
export interface AestheticPipelineResult {
  /** The pipeline output (SUCCESS, G1/G3 halt, or G2.5 AestheticGate halt) */
  pipeline: AestheticPipelineOutput;
  /** The Cangjie-layer IR produced by the adapter (pre-normalization) */
  cangjieIR: CangjieRawDesignIR;
  /** The normalization result from compiler-intent */
  normalization: NormalizationResult;
  /** The Core RawDesignIR after normalization (what G1 sees) */
  coreIR: RawDesignIR;
  /** The aesthetic score from the sheet (metadata only) */
  aestheticScore: number;
}

// ============================================================================
// Config loading helpers
// ============================================================================

const CONFIG_DIR = path.join(__dirname, "..", "config");

/** Load and parse the G1 data-gate policy JSON. */
function loadG1Policy(): G1Policy {
  const raw = fs.readFileSync(path.join(CONFIG_DIR, "g1-policy.json"), "utf8");
  return JSON.parse(raw) as G1Policy;
}

/** Load and parse the G2 grammar rule pack JSON. */
function loadGrammar(): GrammarRulePack {
  const raw = fs.readFileSync(path.join(CONFIG_DIR, "grammar-rules.json"), "utf8");
  return JSON.parse(raw) as GrammarRulePack;
}

/** Load and parse the G3 tier-mapping config JSON. */
function loadTierConfig(): TierMappingConfig {
  const raw = fs.readFileSync(path.join(CONFIG_DIR, "tier-mapping.json"), "utf8");
  return JSON.parse(raw) as TierMappingConfig;
}

/**
 * Assemble the G2.5 AestheticGate terminal halt.
 *
 * Mirrors the G1/G3 halt evaluation shape (ABI 1.0.0) but with `status="FAIL"`:
 * the design reached a negotiated execution plan, then the anti-cliche gate
 * refused it. The execution plan is deliberately NOT exposed (the veto means it
 * must never reach the renderer). `executedAt` is the caller-supplied
 * `capturedAt` — never `new Date()` on the semantic path.
 */
function buildG25TerminalHalt(
  success: Extract<PipelineOutput, { status: "SUCCESS" }>,
  gateResult: AestheticGateResult,
  opts: AestheticPipelineOptions,
  testCaseId: string,
): AestheticGateTerminalHalt {
  const violations = gateResult.violations;
  const diagnostics = [
    `AESTHETIC_CLICHE_BLOCKED: G2.5 AestheticGate vetoed the post-G2 design (${violations.length} P0 anti-cliche violation(s)); execution plan withheld.`,
    ...violations.map((v) => `${v.ruleId} [${v.severity}] @ ${v.location}: ${v.message} Suggested fix: ${v.suggestion}`),
  ];

  return {
    status: "TERMINAL_HALT",
    haltStage: "G2.5_AESTHETIC_GATE",
    evaluation: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      testCaseId,
      executedAt: opts.capturedAt,
      status: "FAIL",
      tierExecuted: "NONE",
      versions: {
        compiler: "1.0.0",
        distiller: "FROM_VALIDATED_IR",
        grammar: success.validatedIR.meta.grammarVersion || "NOT_RUN",
        adapter: "NOT_RUN",
        evaluator: "1.0.0",
      },
      diagnostics,
      provenance: {
        hashManifest: { algorithm: "SHA-256", canonicalization: "RFC8785" },
        // Preserve the chain up to the post-G2 scene. No executionPlanHash /
        // renderHash — the plan was never executed.
        hashChain: {
          inputHash: success.hashChain.inputHash,
          rawIRHash: success.hashChain.rawIRHash,
          validatedIRHash: success.hashChain.validatedIRHash,
        },
        timing: {
          distillationExecutionMs: success.timing.distillationExecutionMs,
          grammarExecutionMs: success.timing.grammarExecutionMs,
          adapterExecutionMs: success.timing.adapterExecutionMs,
        },
      },
    },
    aestheticGate: gateResult,
  };
}

// ============================================================================
// AestheticPipelineRunner
// ============================================================================

/**
 * End-to-end pipeline runner for aesthetic constraint sheets.
 *
 * Constructs a real PipelineRunner with the DC production config and provides
 * a single `execute(sheet, hostCaps)` entry point that handles:
 *   1. Sheet → CangjieRawDesignIR (via AestheticSheetAdapter)
 *   2. CangjieRawDesignIR → Core RawDesignIR (via normalizeIntent)
 *   3. Core RawDesignIR → PipelineOutput (via real PipelineRunner: G1→G2→G3)
 *
 * @example
 * ```ts
 * const runner = new AestheticPipelineRunner();
 * const result = runner.execute(sheet, { webgl2: true, floatTextures: true });
 * if (result.pipeline.status === "SUCCESS") {
 *   console.log(result.pipeline.executionPlan);
 * }
 * ```
 */
export class AestheticPipelineRunner {
  private readonly pipelineRunner: PipelineRunner;
  private readonly g1Policy: G1Policy;
  private readonly grammar: GrammarRulePack;
  private readonly tierConfig: TierMappingConfig;
  private readonly gate: AestheticGate;

  /**
   * Construct the runner. Loads DC production config files.
   *
   * @throws if config files are missing or malformed
   */
  constructor() {
    this.g1Policy = loadG1Policy();
    this.grammar = loadGrammar();
    this.tierConfig = loadTierConfig();
    this.pipelineRunner = new PipelineRunner({
      g1Policy: this.g1Policy,
      grammar: this.grammar,
      tierConfig: this.tierConfig,
    });
    // G2.5 anti-cliche gate, loaded with the production config JSON.
    this.gate = new AestheticGate(loadAntiClicheConfig());
  }

  /** Read-only accessor for the G2.5 gate (used by tests / the demo runner). */
  public getAestheticGate(): AestheticGate {
    return this.gate;
  }

  /**
   * Getter for the loaded G1 policy (useful for assertions in tests).
   */
  public getG1Policy(): G1Policy {
    return { ...this.g1Policy };
  }

  /**
   * Getter for the loaded grammar rule pack.
   */
  public getGrammar(): GrammarRulePack {
    return this.grammar;
  }

  /**
   * Execute the full aesthetic-to-compilation pipeline.
   *
   * @param sheet    The AestheticConstraintSheet from the CAS engine
   * @param hostCaps The host runtime capabilities (WebGL2, float textures, etc.)
   * @param opts     Pipeline options (must include capturedAt for determinism)
   * @returns        Full pipeline result including Cangjie IR, normalization, and PipelineOutput
   */
  public execute(
    sheet: AestheticConstraintSheet,
    hostCaps: HostCapabilities,
    opts: AestheticPipelineOptions,
  ): AestheticPipelineResult {
    // ── Step 1: Adapt sheet → CangjieRawDesignIR ────────────────────
    const adapterOpts: AestheticSheetAdapterOptions = {
      capturedAt: opts.capturedAt,
      irId: `ir-${sheet.sheetId}`,
      distillerVersion: opts.distillerVersion,
      confidenceOverrides: opts.confidenceOverrides,
      calibrationOverrides: opts.calibrationOverrides,
    };

    const adapterResult: AestheticSheetAdapterResult = sheetToCangjieIR(sheet, adapterOpts);
    const { cangjieIR, aestheticScore } = adapterResult;

    // ── Step 2: Normalize Cangjie IR → Core RawDesignIR ─────────────
    const normalization = normalizeIntent(cangjieIR, {
      capturedAt: opts.capturedAt,
      inferenceExecutionMs: opts.inferenceExecutionMs ?? 0,
      intentResolutionConfidence: 0.90,
      mappingConfidence: 0.95,
    });

    // ── Step 3: Run the real PipelineRunner (G1 → G2 → G3) ─────────
    // If normalization already detected BLOCKED_DATA (missing required paths),
    // we still feed the coreIR to the real PipelineRunner — G1 will catch it.
    const testCaseId = opts.testCaseId ?? `AES-${sheet.sheetId}`;

    const pipelineOutput = this.pipelineRunner.execute(
      normalization.coreIR,
      hostCaps,
      testCaseId,
    );

    // ── Step 4: G2.5 AestheticGate (post-G2 veto) ──────────────────
    // Only a genuine SUCCESS output carries a post-G2 scene graph worth
    // vetoing. G1/G3 halts short-circuit before the gate and pass through.
    const gateWanted = opts.aestheticGateEnabled !== false && this.gate.enabled;
    if (gateWanted && pipelineOutput.status === "SUCCESS") {
      const gateResult = this.gate.check(pipelineOutput.validatedIR, {
        typography: { families: sheet.typographyFamilies ?? [] },
      });

      if (!gateResult.passed) {
        const halt = buildG25TerminalHalt(pipelineOutput, gateResult, opts, testCaseId);
        return {
          pipeline: halt,
          cangjieIR,
          normalization,
          coreIR: normalization.coreIR,
          aestheticScore,
        };
      }
    }

    return {
      pipeline: pipelineOutput,
      cangjieIR,
      normalization,
      coreIR: normalization.coreIR,
      aestheticScore,
    };
  }
}
