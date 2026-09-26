/**
 * pipeline/real-pipeline-runner.ts
 *
 * REAL PipelineRunner for the e2e demo — replaces the in-memory mock.
 *
 * It delegates the whole compilation chain to the DC production
 * `AestheticPipelineRunner`, wiring the sheet through:
 *
 *   sheet ──▶ AestheticSheetAdapter ──▶ normalizeIntent
 *         ──▶ G1 DataGate ──▶ G2 PatchEngine ──▶ G2.5 AestheticGate
 *         ──▶ G3 CapabilityNegotiator ──▶ post-G2 scene graph
 *
 * Unlike the former `MockPipelineRunner` (which hand-rolled G1/G2 bookkeeping),
 * this runner uses the SAME code path as the contract suite — G1/G2/G3 are the
 * real compiler-core stages, and G2.5 is the real `AestheticGate`. Only the
 * demo-specific result shaping (scene / theme tokens / stage log) lives here.
 *
 * @module demo/e2e-aesthetic/src/pipeline/real-pipeline-runner
 */

import { AestheticPipelineRunner } from "../../../../aesthetic-integration/aesthetic-pipeline-runner";
import type {
  AestheticConstraintSheet,
} from "../../../../aesthetic-integration/aesthetic-sheet-adapter";
import type { AestheticGateResult } from "../../../../compiler-core/aesthetic-gate-types";
import type { HostCapabilities } from "../../../../compiler-core/capability-negotiator";
import type { ScenarioDefinition, ThemeTokens } from "../types";
import type {
  DemoPipelineResult,
  DemoSceneGraph,
  IPipelineRunner,
  PipelineStageRecord,
} from "./pipeline-types";

/** Deterministic capture timestamp — the demo never calls new Date(). */
const FIXED_CAPTURED_AT = "2026-09-27T00:00:00.000Z";

/** Full host capabilities → TIER_A acceptance (no G3 downgrade). */
const FULL_CAPS: HostCapabilities = {
  webgl2: true,
  floatTextures: true,
  highPrecisionFragment: true,
  anisotropyExtension: true,
};

export class RealPipelineRunner implements IPipelineRunner {
  private readonly runner: AestheticPipelineRunner;

  constructor() {
    this.runner = new AestheticPipelineRunner();
  }

  run(scenario: ScenarioDefinition): DemoPipelineResult {
    const stages: PipelineStageRecord[] = [];
    // The demo sheet structurally satisfies the DC AestheticConstraintSheet
    // (it carries the extra `typographyFamilies` field the gate context needs).
    const sheet = scenario.sheet as unknown as AestheticConstraintSheet;

    // ── Real end-to-end compile (G1 → G2 → G2.5 → G3) ─────────────────
    const result = this.runner.execute(sheet, FULL_CAPS, {
      capturedAt: FIXED_CAPTURED_AT,
      testCaseId: scenario.id,
      aestheticGateEnabled: true,
    });

    // A G2.5 veto (or any G1/G3 halt) means the demo scenario was designed to
    // pass the gate — a halt here is a hard failure, not a recoverable case.
    if (result.pipeline.status !== "SUCCESS") {
      const halt = result.pipeline;
      throw new Error(
        `[real-pipeline] "${scenario.id}" halted at ${halt.haltStage}: ` +
          (halt.evaluation.diagnostics ?? []).join(" | "),
      );
    }

    const { validatedIR } = result.pipeline;
    stages.push({ stage: "G1-data-gate", detail: "required paths resolved ≥ confidence floor — PASS" });
    stages.push({
      stage: "G2-grammar",
      detail: `PatchEngine applied ${validatedIR.auditReport.mutationsApplied} grammar mutation(s)`,
    });

    // ── G2.5: re-run the real gate to record a structured result ───────
    const gate: AestheticGateResult = this.runner.getAestheticGate().check(validatedIR, {
      typography: { families: scenario.sheet.typographyFamilies ?? [] },
    });
    stages.push({
      stage: "G2.5-aesthetic-gate",
      detail: gate.passed
        ? `real AestheticGate PASS (0 violations)`
        : `real AestheticGate VETO: ${gate.violations.map((v) => v.ruleId).join(", ")}`,
    });
    stages.push({
      stage: "G3-capability-negotiator",
      detail: `execution plan accepted (${result.pipeline.executionPlan.negotiation.selectedTier})`,
    });

    if (!gate.passed) {
      const ids = gate.violations.map((v) => `${v.ruleId}: ${v.message}`).join(" | ");
      throw new Error(`[real-pipeline] G2.5 veto for "${scenario.id}": ${ids}`);
    }

    // ── Shape the post-G2 scene graph for the demo ────────────────────
    const scene = validatedIR.validated as unknown as DemoSceneGraph;

    const shadow = scenario.sheet.colorSystem.palette.find((c) => c.role === "shadow");
    const theme: ThemeTokens = {
      mood: scenario.sheet.mood,
      bg: String(scene.color.dominant.value),
      ink: String(scene.color.secondary.value),
      accent: String(scene.color.accent.value),
      shadow: shadow ? shadow.hex : "#1f1f22",
      symmetry: Number(scene.composition.symmetry.value),
      negativeSpaceRatio: Number(scene.composition.negativeSpaceRatio.value),
      voidSolidRatio: scenario.sheet.proportion.voidSolidRatio,
    };

    return {
      scene,
      gate,
      stages,
      patchesApplied: validatedIR.auditReport.mutationsApplied,
      theme,
    };
  }
}
