/**
 * aesthetic-integration/index.ts
 *
 * Public entry point for the DC-side aesthetic constraint integration module.
 *
 * Wires CAS AestheticConstraintSheet JSON through the real DC PipelineRunner:
 *   G1 Data Gate → G2 Grammar Engine → G3 Capability Negotiator → Execution Plan.
 *
 * Usage:
 * ```ts
 * import { AestheticPipelineRunner, type AestheticConstraintSheet } from "./aesthetic-integration";
 *
 * const runner = new AestheticPipelineRunner();
 * const result = runner.execute(sheet, hostCaps, { capturedAt: "2026-09-26T00:00:00Z" });
 * ```
 *
 * @module aesthetic-integration
 */

// Adapter (sheet → Cangjie IR)
export {
  sheetToCangjieIR,
  type AestheticConstraintSheet,
  type SheetColorEntry,
  type SheetColorRole,
  type SheetViolation,
  type SheetStructuralDimension,
  type AestheticSheetAdapterOptions,
  type AestheticSheetAdapterResult,
} from "./aesthetic-sheet-adapter";

// Pipeline runner (end-to-end)
export {
  AestheticPipelineRunner,
  type AestheticPipelineOptions,
  type AestheticPipelineResult,
  type AestheticPipelineOutput,
  type AestheticGateTerminalHalt,
} from "./aesthetic-pipeline-runner";
