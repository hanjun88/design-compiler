/**
 * pipeline/pipeline-types.ts
 *
 * PipelineRunner PORT for the e2e demo.
 *
 * The real DC `compiler-core/pipeline-runner.ts` was not present in this
 * sandbox, so the demo declares a minimal structural port that mirrors the
 * documented PipelineRunner contract (G1 → G2 → G2.5 → G3). A reference
 * in-memory implementation lives in `./mock-pipeline-runner.ts`; the moment the
 * full DC repo is restored, replace it with the real `AestheticPipelineRunner`
 * — the surface below is intentionally a subset of the documented ABI.
 *
 * @module demo/e2e-aesthetic/src/pipeline/pipeline-types
 */

import type { ScenarioDefinition, ThemeTokens } from "../types";
import type { AestheticGateResult } from "../../../../compiler-core/aesthetic-gate-types";

/** One recorded compilation stage (for the report). */
export interface PipelineStageRecord {
  stage: string;
  detail: string;
}

/** A post-G2 scene-graph node (structural mirror of ValidatedEstimatedParameter). */
export interface SceneNode {
  value: unknown;
  unit: string;
  confidence: number;
  evidence: unknown[];
  source: string;
  status: string;
}

/** Post-G2 scene graph the G2.5 gate inspects. */
export interface DemoSceneGraph {
  composition: {
    focalPoint: SceneNode;
    negativeSpaceRatio: SceneNode;
    depthLayerCount: SceneNode;
    symmetry: SceneNode;
  };
  camera: { fov: SceneNode; shotSize: SceneNode; angle: SceneNode; height: SceneNode };
  lighting: {
    keyLight: { azimuth: SceneNode; elevation: SceneNode; colorTemp: SceneNode; intensity: SceneNode; softness: SceneNode };
    ambientRatio: SceneNode;
    rimLightPresent: SceneNode;
  };
  materials: {
    role: string;
    baseType: SceneNode; roughness: SceneNode; metalness: SceneNode; wear: SceneNode;
  }[];
  color: {
    dominant: SceneNode; secondary: SceneNode; accent: SceneNode;
    contrastRatio: SceneNode; temperatureBias: SceneNode;
  };
}

/** Result of running the demo pipeline on one scenario. */
export interface DemoPipelineResult {
  /** Post-G2 scene graph fed to the real G2.5 gate. */
  scene: DemoSceneGraph;
  /** Outcome of the REAL DC AestheticGate (G2.5). */
  gate: AestheticGateResult;
  /** Human-readable stage log. */
  stages: PipelineStageRecord[];
  /** RFC6902-style grammar mutations the mock G2 applied. */
  patchesApplied: number;
  /** Compiler-approved rendering tokens. */
  theme: ThemeTokens;
}

/** The PipelineRunner port the demo depends on. */
export interface IPipelineRunner {
  run(scenario: ScenarioDefinition): DemoPipelineResult;
}
