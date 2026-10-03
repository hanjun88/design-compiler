/**
 * Aesthetic half of the chain, after the Core pipeline:
 *
 *   ValidatedDesignIR -> software render -> physical evidence -> relationship graph -> anti-pattern gate
 *     -> period grammar (principles from the sheet) -> AestheticExecutionPlan (operators + bands from the
 *     sheet) -> AestheticRuntimePlan -> SceneCompilationIR (4-A contract validated, provenance chain checked)
 *
 * Everything runs under the sheet's DecisionPack, so every aesthetic number any stage reads is a decision
 * of the skill; the result carries the usage the pack recorded.
 */
import type { PipelineOutput } from "../compiler-core/pipeline-runner";
import { HashPolicy } from "../compiler-core/hash-policy";
import { SoftwareRenderer, type RenderResult } from "../render-engine";
import { extractPhysicalEvidence } from "../chinese-aesthetic/extraction/physical-evidence-extractor";
import type { ExtractorInput, IRTransformationEntry, ObservableEvidenceSet } from "../chinese-aesthetic/extraction/types";
import { buildRelationshipGraph } from "../chinese-aesthetic/graph/relationship-graph-builder";
import type { AestheticRelationshipGraph } from "../chinese-aesthetic/graph/types";
import { runAntiPatternGate } from "../chinese-aesthetic/anti-pattern/anti-pattern-gate";
import type { AntiPatternReport } from "../chinese-aesthetic/anti-pattern/types";
import { PeriodGrammarCompiler, type GrammarCompileResult } from "../chinese-aesthetic/grammar/period-grammar-compiler";
import { compileAestheticExecutionPlan } from "../chinese-aesthetic/compiler/plan-emitter";
import type { AestheticExecutionPlan } from "../chinese-aesthetic/compiler/types";
import { adaptAestheticToRuntime } from "../chinese-aesthetic/adapter/plan-adapter";
import type { AestheticRuntimePlan } from "../chinese-aesthetic/adapter/types";
import { compileSceneIR } from "../chinese-aesthetic/scene-contract/scene-compiler";
import { validateSceneCompilationIR } from "../chinese-aesthetic/scene-contract/contract-validator";
import type { SceneCompilationIR } from "../chinese-aesthetic/scene-contract/types";
import { withDecisionPack } from "./active-pack";
import type { DecisionPack } from "./decision-pack";

export type CoreSuccess = Extract<PipelineOutput, { status: "SUCCESS" }>;

export interface SceneChainInput {
  core: CoreSuccess;
  pack: DecisionPack;
  sceneId: string;
  /** Deterministic stage time (never new Date()). */
  compiledAt: string;
  compilerVersion?: string;
}

export interface SceneChainResult {
  render: RenderResult;
  evidence: ObservableEvidenceSet;
  graph: AestheticRelationshipGraph;
  gate: AntiPatternReport;
  grammar: GrammarCompileResult;
  plan: AestheticExecutionPlan;
  runtimePlan: AestheticRuntimePlan;
  sceneIR: SceneCompilationIR;
  sceneIRValidation: ReturnType<typeof validateSceneCompilationIR>;
}

export class SceneChainError extends Error {
  constructor(stage: string, detail: string) {
    super(`scene chain stage ${stage} failed: ${detail}`);
    this.name = "SceneChainError";
  }
}

const categoryOf = (baseType: string): string => baseType.split("::")[0] ?? baseType;

function extractorInput(core: CoreSuccess, pack: DecisionPack, render: RenderResult, evidenceId: string, compiledAt: string): ExtractorInput {
  const v = core.validatedIR.validated;
  const trace: IRTransformationEntry[] = core.validatedIR.patches.map((op) => ({
    ruleId: op.audit.ruleId,
    field: op.path,
    inputValue: op.audit.fromValue,
    outputValue: "value" in op ? op.value : null,
    action: op.op,
  }));
  return {
    evidenceId,
    capturedAt: compiledAt,
    frames: [render.pixelBuffer],
    width: render.width,
    height: render.height,
    depthBuffers: null, // the reference rasteriser produces no depth buffer: depth stays UNMEASURED, never invented
    ir: {
      irHash: core.hashChain.validatedIRHash,
      irType: "ValidatedDesignIR",
      paradigm: pack.period,
      compositionType: `scene-type:${pack.context.scene_type}`,
      symmetry: v.composition.symmetry.value,
      negativeSpaceRatio: v.composition.negativeSpaceRatio.value,
      horizonPosition: 0.5 - Math.tan((v.camera.angle.value * Math.PI) / 180) / (2 * Math.tan((v.camera.fov.value * Math.PI) / 360)), // ssot-ok(PHYSICAL_SAFETY): pinhole-camera projection geometry
      cameraPitch: v.camera.angle.value,
      lightingIntent: pack.context.lighting,
      colorTemp: v.lighting.keyLight.colorTemp.value,
      lightIntensity: v.lighting.keyLight.intensity.value,
      lightSoftness: v.lighting.keyLight.softness.value,
      ambientRatio: v.lighting.ambientRatio.value,
      materials: v.materials.map((m) => ({ baseType: m.baseType.value, materialCategory: categoryOf(m.baseType.value), roughness: m.roughness.value, metalness: m.metalness.value, wear: m.wear.value })),
      transformationTrace: trace,
    },
    renderHash: render.renderHash,
    rendererInfo: { type: render.rendererInfo.type, version: render.rendererInfo.version },
  };
}

export function runSceneChain(input: SceneChainInput): SceneChainResult {
  const { core, pack, compiledAt } = input;
  return withDecisionPack(pack, () => {
    const renderer = new SoftwareRenderer(480, 270); // ssot-ok(MEASUREMENT_MECHANISM): reference render resolution (16:9) of the evidence frame
    renderer.mount();
    const render = renderer.render(core.validatedIR, core.executionPlan);
    renderer.dispose();

    const evidenceId = `ev-${core.hashChain.validatedIRHash.slice("sha256:".length, "sha256:".length + 16)}`;
    const evidence = extractPhysicalEvidence(extractorInput(core, pack, render, evidenceId, compiledAt));
    const graph = buildRelationshipGraph(evidence);
    const gate = runAntiPatternGate(evidence, graph);
    const grammar = new PeriodGrammarCompiler(pack.period).compile(core.rawIR, graph, gate);
    if (grammar.antiPatternHalted) throw new SceneChainError("anti-pattern-gate", grammar.haltReason ?? "REJECT");

    const planned = compileAestheticExecutionPlan({ intent: grammar.intent, graph, compiledAt });
    if (!planned.success || !planned.plan) throw new SceneChainError("aesthetic-plan", planned.errors.map((e) => e.message).join("; "));
    const adapted = adaptAestheticToRuntime({ aestheticPlan: planned.plan, compiledAt });
    if (!adapted.success || !adapted.plan) throw new SceneChainError("runtime-adapter", adapted.errors.map((e) => e.message).join("; "));

    const sceneIR = compileSceneIR({
      validatedIR: core.validatedIR,
      validatedIRHash: core.hashChain.validatedIRHash,
      evidence,
      graph,
      plan: planned.plan,
      runtimePlan: adapted.plan,
      sceneId: `scene:${pack.sheetHash.slice(0, 12)}:${core.hashChain.validatedIRHash.slice("sha256:".length, "sha256:".length + 12)}`,
      compiledAt,
      compilerVersion: input.compilerVersion ?? "design-compiler-scene@1.0.0",
    });
    const sceneIRValidation = validateSceneCompilationIR(sceneIR, { runtimePlan: adapted.plan });
    return { render, evidence, graph, gate, grammar, plan: planned.plan, runtimePlan: adapted.plan, sceneIR, sceneIRValidation };
  });
}

/** HashPolicy hash helper re-exported for evidence tooling. */
export const hashOf = (v: unknown): string => HashPolicy.computeHash(v);
