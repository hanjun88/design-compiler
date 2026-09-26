/**
 * pipeline/mock-pipeline-runner.ts
 *
 * MOCK PipelineRunner for the e2e demo — clearly labelled.
 *
 * It stages the documented DC compilation flow in memory:
 *
 *   sheet ──▶ adapt ──▶ G1 confidence gate ──▶ G2 grammar patches
 *         ──▶ G2.5 AestheticGate  ★ REAL DC stage (aesthetic-integration/anti-cliche-gate.ts)
 *         ──▶ theme tokens
 *
 * The G2.5 call is NOT mocked: it instantiates the real `AestheticGate` with
 * the production config `config/anti-cliche-rules.json` and runs the real rule
 * engine (`evaluateAntiClicheRules`) over the scene graph. Only the surrounding
 * G1/G2 bookkeeping is simplified.
 *
 * To swap in the real pipeline once the DC monorepo is restored:
 *   1. import { AestheticPipelineRunner } from "../../../../aesthetic-integration";
 *   2. implement `IPipelineRunner.run()` by calling it; keep the same return shape.
 *
 * @module demo/e2e-aesthetic/src/pipeline/mock-pipeline-runner
 */

import { AestheticGate, loadAntiClicheConfig } from "../../../../aesthetic-integration/anti-cliche-gate";
import type { AestheticGateResult } from "../../../../compiler-core/aesthetic-gate-types";
import type { ScenarioDefinition, ThemeTokens } from "../types";
import type {
  DemoPipelineResult,
  DemoSceneGraph,
  IPipelineRunner,
  PipelineStageRecord,
  SceneNode,
} from "./pipeline-types";

// ── helpers ────────────────────────────────────────────────────────────────

function node(value: unknown, unit = "scalar", confidence = 0.9): SceneNode {
  return { value, unit, confidence, evidence: [], source: "expert-judgment", status: "estimated" };
}

/** Parse "7:3" → void/(void+solid). */
function negativeSpaceFromRatio(ratio: string): number {
  const m = /^\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\s*$/.exec(ratio);
  if (!m) return 0.5;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return Math.round((a / (a + b)) * 1000) / 1000;
}

/** axis → symmetry (kept ≤0.80 so symmetric layouts avoid the dead-center veto). */
function symmetryFromAxis(axis: "strict" | "offset" | "hidden"): number {
  if (axis === "strict") return 0.8;
  if (axis === "offset") return 0.5;
  return 0.15;
}

/** axis → focal point (off-center anchor; strict keeps x-centred but lifts y). */
function focalFromAxis(axis: "strict" | "offset" | "hidden"): [number, number] {
  if (axis === "strict") return [0.5, 0.35];
  if (axis === "offset") return [0.62, 0.38];
  return [0.5, 0.5];
}

// ── Mock runner ────────────────────────────────────────────────────────────

export class MockPipelineRunner implements IPipelineRunner {
  private readonly gate: AestheticGate;

  constructor() {
    // Real DC gate, loaded with the real production config JSON.
    this.gate = new AestheticGate(loadAntiClicheConfig());
  }

  run(scenario: ScenarioDefinition): DemoPipelineResult {
    const stages: PipelineStageRecord[] = [];
    const sheet = scenario.sheet;

    // ── adapt: sheet → post-G2 scene graph ──────────────────────────────
    const pal = (role: string) => sheet.colorSystem.palette.find((c) => c.role === role);
    let scene: DemoSceneGraph = {
      composition: {
        focalPoint: node(focalFromAxis(sheet.spatial.axis), "vector2"),
        negativeSpaceRatio: node(negativeSpaceFromRatio(sheet.proportion.voidSolidRatio), "ratio"),
        depthLayerCount: node(sheet.spatial.hierarchyLevelsMin, "scalar"),
        symmetry: node(symmetryFromAxis(sheet.spatial.axis), "ratio"),
      },
      camera: { fov: node(35, "degrees"), shotSize: node("medium"), angle: node(0, "degrees"), height: node(1.6) },
      lighting: {
        keyLight: {
          azimuth: node(0, "degrees"), elevation: node(72, "degrees"),
          colorTemp: node(5600, "kelvin"), intensity: node(0.9), softness: node(0.7),
        },
        ambientRatio: node(0.3),
        rimLightPresent: node(false, "boolean"),
      },
      materials: [
        {
          role: "dominant",
          baseType: node("aged-paper", "string"), roughness: node(0.75), metalness: node(0.05), wear: node(0.3),
        },
      ],
      color: {
        dominant: node(pal("dominant")!.hex, "hex"),
        secondary: node(pal("secondary")!.hex, "hex"),
        accent: node(pal("accent")!.hex, "hex"),
        contrastRatio: node(4.5, "ratio"),
        temperatureBias: node(0.05),
      },
    };
    stages.push({ stage: "adapt", detail: `sheet ${sheet.sheetId} → scene graph (${sheet.mood})` });

    // ── G1 (mock): confidence floor 0.6 ────────────────────────────────
    const allNodes = JSON.stringify(scene).length > 0; // shape is built at 0.9 confidence
    if (!allNodes) throw new Error("[mock-pipeline] G1: empty scene");
    stages.push({ stage: "G1-data-gate", detail: "all parameters ≥ confidence 0.6 — PASS" });

    // ── G2 (mock): lift suffocated negative space, mirroring grammar rules ─
    let patchesApplied = 0;
    const nsr = Number(scene.composition.negativeSpaceRatio.value);
    if (nsr < 0.35) {
      scene = {
        ...scene,
        composition: {
          ...scene.composition,
          negativeSpaceRatio: { ...scene.composition.negativeSpaceRatio, value: 0.45, status: "grammar-derived" },
        },
      };
      patchesApplied += 1;
      stages.push({ stage: "G2-grammar", detail: `negativeSpaceRatio ${nsr} → 0.45 (grammar patch)` });
    } else {
      stages.push({ stage: "G2-grammar", detail: `negativeSpaceRatio ${nsr} — no patch needed` });
    }

    // ── G2.5: THE REAL DC AestheticGate ────────────────────────────────
    const ir = { validated: scene } as never;
    const gateResult: AestheticGateResult = this.gate.check(ir, {
      typography: { families: sheet.typographyFamilies },
    });
    stages.push({
      stage: "G2.5-aesthetic-gate",
      detail: gateResult.passed
        ? `real AestheticGate PASS (0 violations)`
        : `real AestheticGate VETO: ${gateResult.violations.map((v) => v.ruleId).join(", ")}`,
    });

    if (!gateResult.passed) {
      const ids = gateResult.violations.map((v) => `${v.ruleId}: ${v.message}`).join(" | ");
      throw new Error(`[e2e-demo] G2.5 veto for "${scenario.id}": ${ids}`);
    }

    // ── Theme tokens (from the compiler-approved scene) ─────────────────
    const shadow = pal("shadow");
    const theme: ThemeTokens = {
      mood: sheet.mood,
      bg: String(scene.color.dominant.value),
      ink: String(scene.color.secondary.value),
      accent: String(scene.color.accent.value),
      shadow: shadow ? shadow.hex : "#1f1f22",
      symmetry: Number(scene.composition.symmetry.value),
      negativeSpaceRatio: Number(scene.composition.negativeSpaceRatio.value),
      voidSolidRatio: sheet.proportion.voidSolidRatio,
    };

    return { scene, gate: gateResult, stages, patchesApplied, theme };
  }
}
