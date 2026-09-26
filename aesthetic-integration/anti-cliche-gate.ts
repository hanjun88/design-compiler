/**
 * anti-cliche-gate.ts
 *
 * The G2.5 Aesthetic Gate — a hard-veto stage inserted between G2 (PatchEngine)
 * and G3 (CapabilityNegotiator). Implements the compiler-core `IAestheticGate`
 * contract so PipelineRunner can depend on a tiny structural interface without
 * importing this module back.
 *
 * Why a separate stage (and not just more grammar rules):
 *   PatchEngine can only *mutate* (RFC 6902 replace/add/remove). Its only
 *   rejection primitive, `test`, is caught and logged — it never stops the
 *   pipeline. Anti-cliche rules are prohibitive: a forbidden palette, dead-center
 *   stacking, or calligraphy-on-everything must refuse the design, not patch it.
 *
 * Behavior:
 *   - `enabled === false` → check() always passes (feature toggle).
 *   - Runs the pure rule engine over the post-G2 scene graph.
 *   - Any P0_HARD violation → passed=false, with structured violations carrying
 *     ruleId / location / remediation suggestion.
 *
 * @module aesthetic-integration/anti-cliche-gate
 */

import * as fs from "fs";
import * as path from "path";

import type {
  AestheticClicheViolation,
  AestheticGateContext,
  AestheticGateResult,
  IAestheticGate,
} from "../compiler-core/aesthetic-gate-types";
import type { ValidatedDesignIR } from "../compiler-core/contracts";

import {
  evaluateAntiClicheRules,
  type AntiClicheConfig,
} from "./anti-cliche-rules";

const DEFAULT_CONFIG_PATH = path.join(__dirname, "..", "config", "anti-cliche-rules.json");

/** Load the anti-cliche config JSON from disk. */
export function loadAntiClicheConfig(configPath: string = DEFAULT_CONFIG_PATH): AntiClicheConfig {
  const raw = fs.readFileSync(configPath, "utf8");
  const parsed = JSON.parse(raw) as Partial<AntiClicheConfig>;
  return {
    enabled: parsed.enabled !== false,
    thresholds: {
      forbiddenHex: parsed.thresholds?.forbiddenHex ?? [],
      dominantSaturationHardLimit: parsed.thresholds?.dominantSaturationHardLimit ?? 0.75,
      complementaryHueToleranceDeg: parsed.thresholds?.complementaryHueToleranceDeg ?? 12,
      complementaryMinSaturation: parsed.thresholds?.complementaryMinSaturation ?? 0.85,
      deadCenterEpsilon: parsed.thresholds?.deadCenterEpsilon ?? 0.04,
      deadCenterSymmetryFloor: parsed.thresholds?.deadCenterSymmetryFloor ?? 0.85,
      minNegativeSpaceRatio: parsed.thresholds?.minNegativeSpaceRatio ?? 0.22,
      maxFontFamilies: parsed.thresholds?.maxFontFamilies ?? 3,
      calligraphyFontPattern:
        parsed.thresholds?.calligraphyFontPattern ??
        "(?i)(maobi|calligraphy|brush.?script|cursive|毛笔|书法)",
    },
    remediation: parsed.remediation ?? {},
  };
}

/**
 * G2.5 anti-cliche gate. Construct once per pipeline; stateless across runs.
 */
export class AestheticGate implements IAestheticGate {
  public readonly enabled: boolean;
  private readonly config: AntiClicheConfig;

  constructor(config?: AntiClicheConfig) {
    this.config = config ?? loadAntiClicheConfig();
    this.enabled = this.config.enabled;
  }

  /**
   * Pure check: inspect post-G2 validated IR, return pass/fail + violations.
   * Never mutates the input.
   */
  check(validatedIR: ValidatedDesignIR, context?: AestheticGateContext): AestheticGateResult {
    if (!this.enabled) {
      return { passed: true, violations: [] };
    }

    const violations: AestheticClicheViolation[] = evaluateAntiClicheRules(
      validatedIR.validated,
      this.config,
      context,
    );

    return {
      passed: violations.length === 0,
      violations,
    };
  }
}
