/**
 * design-compiler public entry point.
 *
 * AESTHETIC INTEGRATION: For end-to-end sheet→compile execution with the
 * G2.5 AestheticGate, use `AestheticPipelineRunner` (exported below).
 *
 * SECURITY: The bare `PipelineRunner` from compiler-core is intentionally
 * NOT re-exported from this root entry — it does NOT run G2.5 and would
 * create a gate-bypass path. Import it directly from
 * `compiler-core/pipeline-runner` only for compiler-core unit tests and
 * golden-case fixtures.
 */
export * from "./compiler-core/contracts";
export * from "./compiler-core/error-codes";
export * from "./compiler-core/hash-policy";
export * from "./compiler-core/json-pointer";
export * from "./compiler-core/scoring";
export * from "./compiler-core/semantic-gate";
export * from "./compiler-core/data-gate";
export * from "./compiler-core/patch-engine";
export * from "./compiler-core/deep-equal";
export * from "./compiler-core/capability-negotiator";
export * from "./compiler-core/tier-mapping-types";
// Whitelist re-exports from compiler-core — everything EXCEPT the bare PipelineRunner.
export * from "./compiler-core/types";
export * from "./compiler-core/execution-planner";
export type { PipelineOutput, PipelineRunnerDependencies } from "./compiler-core/pipeline-runner";
export {
  DesignCompiler,
  createCompileContext,
  type DesignCompilerOptions,
  type DesignCompilerResult,
} from "./compiler-core";

// Aesthetic integration — the RECOMMENDED end-to-end entry (G1→G2→G2.5→G3).
export {
  AestheticPipelineRunner,
  sheetToCangjieIR,
  type AestheticConstraintSheet,
  type AestheticPipelineOptions,
  type AestheticPipelineResult,
} from "./aesthetic-integration";
