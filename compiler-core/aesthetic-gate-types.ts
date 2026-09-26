/**
 * ============================================================================
 * G2.5 Aesthetic Gate — Structural Contract (compiler-core side)
 * ============================================================================
 * The PatchEngine (G2) is a pure RFC 6902 *mutation* engine: every triggered
 * grammar rule produces a corrective `replace/add/remove` patch. It has no
 * "veto" primitive — a triggered rule can only *mutate*, never *refuse* the
 * design. Anti-cliche rules, by contrast, are *prohibitive*: a design that
 * pairs pure-red with pure-green, or stacks everything dead-center, must be
 * refused outright rather than silently patched.
 *
 * This file defines the structural contract the compiler core knows about.
 * The concrete implementation lives in `aesthetic-integration/anti-cliche-gate.ts`
 * (dependency inversion: compiler-core depends on this tiny interface, not on
 * the aesthetic module). When no gate is supplied to PipelineRunner, the
 * pipeline behaves exactly as before — this file is a no-op by default.
 *
 * @module compiler-core/aesthetic-gate-types
 */

import type { ValidatedDesignIR } from "./contracts";

/**
 * A single anti-cliche violation detected at G2.5.
 * Returned inside {@link AestheticGateResult}. Carries enough structured
 * detail for the pipeline to build a terminal evaluation with actionable
 * remediation advice.
 */
export interface AestheticClicheViolation {
  /** Canonical rule id, e.g. "AC-COLOR-001". */
  ruleId: string;
  /** Which cliche family the violation belongs to. */
  category: "color" | "layout" | "typography" | "material";
  /** Human-readable description of what was detected. */
  message: string;
  /** JSON Pointer into the post-G2 scene graph locating the offending value. */
  location: string;
  /** All current anti-cliche violations are hard vetoes (P0). */
  severity: "P0_HARD";
  /** Actionable remediation suggestion (what to change, and to what). */
  suggestion: string;
  /** Machine-readable evidence (observed value, thresholds, hues, …). */
  evidence: Record<string, unknown>;
}

/** Result of running the aesthetic gate on a post-G2 ValidatedDesignIR. */
export interface AestheticGateResult {
  /** true when zero P0 cliche violations were detected; false blocks compilation. */
  passed: boolean;
  /** All violations detected (empty when passed). */
  violations: AestheticClicheViolation[];
}

/**
 * Optional context the gate may consult. The pipeline (PipelineRunner) runs
 * with `context === undefined` (it only sees the scene graph). Upstream
 * orchestrators (e.g. AestheticPipelineRunner) MAY supply typography metadata
 * so that typography cliches can be enforced end-to-end.
 */
export interface AestheticGateContext {
  /**
   * Font families actually used by the design. When omitted, typography
   * cliche rules are skipped (they have no evidenceable signal in the scene
   * graph itself).
   */
  typography?: {
    /** Ordered list of font-family names in use. */
    families: string[];
  };
}

/**
 * The structural interface every G2.5 aesthetic gate must implement.
 * Implemented by `aesthetic-integration/AestheticGate`.
 */
export interface IAestheticGate {
  /** Whether the gate is active. When false, `check()` always passes. */
  readonly enabled: boolean;
  /**
   * Inspect a post-G2 ValidatedDesignIR and report cliche violations.
   * MUST be a pure function: no side effects, no mutation of the input.
   */
  check(validatedIR: ValidatedDesignIR, context?: AestheticGateContext): AestheticGateResult;
}
