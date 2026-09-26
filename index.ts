/**
 * design-compiler public entry point.
 *
 * AESTHETIC INTEGRATION: For end-to-end sheet→compile execution with the
 * G2.5 AestheticGate, use `AestheticPipelineRunner` (exported below).
 * The bare `PipelineRunner` from compiler-core does NOT run G2.5 and is
 * only intended for compiler-core unit testing and golden-case fixtures.
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
export * from "./compiler-core";

// Aesthetic integration — the RECOMMENDED end-to-end entry (G1→G2→G2.5→G3).
export {
  AestheticPipelineRunner,
  sheetToCangjieIR,
  type AestheticConstraintSheet,
  type AestheticPipelineOptions,
  type AestheticPipelineResult,
} from "./aesthetic-integration";
