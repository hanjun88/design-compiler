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
import type { RawDesignIR } from "../compiler-core/contracts";
import { normalizeIntent } from "../compiler-intent/intent-normalizer";
import type { CangjieRawDesignIR, NormalizationResult } from "../compiler-intent/types";

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
}

/**
 * Full result of running an aesthetic sheet through the pipeline.
 */
export interface AestheticPipelineResult {
  /** The raw pipeline output (SUCCESS or TERMINAL_HALT) */
  pipeline: PipelineOutput;
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

    return {
      pipeline: pipelineOutput,
      cangjieIR,
      normalization,
      coreIR: normalization.coreIR,
      aestheticScore,
    };
  }
}
