/**
 * Scene Compiler — ValidatedDesignIR + AestheticRuntimePlan + physical evidence -> SceneCompilationIR.
 *
 * Every one of the 24 scene parameters is bound to exactly one source, in this order:
 *   1. an instruction of the AestheticRuntimePlan that targets it (value, instruction seq and the
 *      operator's provenance hash are carried over);
 *   2. otherwise the quantity that the Core IR / the measured evidence / the relationship graph
 *      states for that slot (SCENE_PARAMETER_SOURCES below; a mapping of observable quantities to
 *      scene slots plus physical normalisations — it makes no aesthetic judgement);
 *   3. otherwise the slot is BLOCKED explicitly (SCENE_CAPABILITY_BLOCKED with the reason) and carries
 *      a zero placeholder that downstream stages must not read: there is no silent default.
 * Aesthetic decisions never enter here: they arrived through the sheet in the operators / patches.
 */
import type { ValidatedDesignIR } from "../../compiler-core/contracts";
import type { AestheticExecutionPlan } from "../compiler/types";
import type { AestheticRuntimePlan, RuntimeInstruction } from "../adapter/types";
import type { AestheticRelationshipGraph } from "../graph/types";
import type { EvidenceFieldOrUnmeasured, ObservableEvidenceSet } from "../extraction/types";
import { computeSceneDigest } from "./contract-validator";
import type {
  SceneAssetManifest,
  SceneCapabilityBlockCode,
  SceneCapabilityBlocked,
  SceneCompilationIR,
  TracedSceneParameter,
} from "./types";

export interface SceneCompilerInput {
  validatedIR: ValidatedDesignIR;
  /** HashPolicy hash of the validated IR (the Core hash chain's validatedIRHash). */
  validatedIRHash: string;
  evidence: ObservableEvidenceSet;
  graph: AestheticRelationshipGraph;
  plan: AestheticExecutionPlan;
  runtimePlan: AestheticRuntimePlan;
  sceneId: string;
  /** Deterministic compile time (never new Date()). */
  compiledAt: string;
  compilerVersion: string;
  /** Asset bindings are produced later by the scene pack compiler; an empty manifest is the honest pre-pack state. */
  assetManifest?: SceneAssetManifest;
}

type Domain = "composition" | "spatial" | "material" | "lighting" | "camera" | "motion";

interface Resolved {
  value: number | boolean;
  /** provenance tag for a base value; instruction overrides carry their own hashes */
  tag: string;
}
interface Blocked {
  block: SceneCapabilityBlockCode;
  reason: string;
}
type SourceFn = (c: SceneCompilerInput) => Resolved | Blocked;

const isBlocked = (r: Resolved | Blocked): r is Blocked => "block" in r;
const measured = <T>(f: EvidenceFieldOrUnmeasured<T>): T | undefined => ("value" in f ? (f as { value: T }).value : undefined);
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

const fromIR = (pointer: string, read: (c: SceneCompilerInput) => number): SourceFn => (c) => {
  const v = read(c);
  return finite(v) ? { value: v, tag: `ir:${c.validatedIRHash}#${pointer}` } : { block: "INSUFFICIENT_PHYSICAL_EVIDENCE", reason: `validated IR ${pointer} is not a finite number` };
};
const fromEvidence = (field: string, read: (e: ObservableEvidenceSet) => number | undefined, code: SceneCapabilityBlockCode, why: string, map: (n: number) => number = (n) => n): SourceFn => (c) => {
  const v = read(c.evidence);
  return finite(v) ? { value: map(v), tag: `evidence:${c.evidence.evidenceId}#${field}` } : { block: code, reason: `${field} is unmeasured: ${why}` };
};

const hexLuma01 = (hex: string): number => {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255; // ssot-ok(MEASUREMENT_MECHANISM): Rec.601 luma weights and the 8-bit range, a colour-space definition
};

/** One source per scene slot. Normalisations are physical (frame geometry, colour spaces, theoretical maxima). */
export const SCENE_PARAMETER_SOURCES: Record<`${Domain}.${string}`, SourceFn> = {
  "composition.negativeSpaceRatio": fromIR("/composition/negativeSpaceRatio", (c) => c.validatedIR.validated.composition.negativeSpaceRatio.value),
  "composition.focalOffset": fromEvidence("pixel.focalCenterOffset", (e) => measured(e.pixel.focalCenterOffset), "INSUFFICIENT_PHYSICAL_EVIDENCE", "no frame evidence"),
  "composition.clusterDensity": (c) => {
    const rel = c.graph.relations.find((r) => r.relationType === "DENSE_SPARSE");
    return rel ? { value: rel.magnitude, tag: `graph:${c.graph.graphHash}#DENSE_SPARSE` } : { block: "INSUFFICIENT_PHYSICAL_EVIDENCE", reason: "the relationship graph has no DENSE_SPARSE relation" };
  },
  "composition.axialSymmetry": fromIR("/composition/symmetry", (c) => c.validatedIR.validated.composition.symmetry.value),
  "spatial.depthLayers": fromIR("/composition/depthLayerCount", (c) => c.validatedIR.validated.composition.depthLayerCount.value),
  "spatial.atmosphericDensity": fromEvidence("depth.atmosphericDepth", (e) => measured(e.depth.atmosphericDepth), "DEPTH_BUFFER_UNAVAILABLE", "the reference render has no depth buffer"),
  "spatial.horizonPosition": (c) => {
    // Pinhole geometry: where the horizon falls in the frame for the IR's pitch (degrees, positive = looking down) and fov.
    const { angle, fov } = c.validatedIR.validated.camera;
    const y = 0.5 - Math.tan((angle.value * Math.PI) / 180) / (2 * Math.tan((fov.value * Math.PI) / 360)); // ssot-ok(PHYSICAL_SAFETY): pinhole-camera projection geometry
    return finite(y) ? { value: Math.min(1, Math.max(0, y)), tag: `ir:${c.validatedIRHash}#/camera/angle+fov` } : { block: "INSUFFICIENT_PHYSICAL_EVIDENCE", reason: "camera angle / fov do not define a horizon" };
  },
  "spatial.occlusionRatio": fromEvidence("depth.occlusionEdgeCount", (e) => measured(e.depth.occlusionEdgeCount), "DEPTH_BUFFER_UNAVAILABLE", "the reference render has no depth buffer"),
  "material.patinaLevel": fromIR("/materials/0/wear", (c) => c.validatedIR.validated.materials[0]?.wear.value ?? Number.NaN),
  "material.specularSharpness": fromEvidence("material.specularSharpness", (e) => measured(e.material.specularSharpness), "INSUFFICIENT_PHYSICAL_EVIDENCE", "no frame evidence"),
  "material.contrastRatio": fromEvidence("pixel.contrastRatio", (e) => measured(e.pixel.contrastRatio), "INSUFFICIENT_PHYSICAL_EVIDENCE", "no frame evidence", (r) => Math.min(1, Math.max(0, (r - 1) / 20))), // ssot-ok(MEASUREMENT_MECHANISM): WCAG contrast ratio spans 1..21; normalised by its theoretical range
  // micro-detail energy as a share of total luma energy: a [0,1] ratio (surfaceVariation is an unbounded variance)
  "material.surfaceEntropy": fromEvidence("material.microSurfaceHighFrequencyVariance", (e) => measured(e.material.microSurfaceHighFrequencyVariance), "INSUFFICIENT_PHYSICAL_EVIDENCE", "no frame evidence"),
  "lighting.skyLuminance": fromEvidence("pixel.meanLuminance", (e) => measured(e.pixel.meanLuminance), "INSUFFICIENT_PHYSICAL_EVIDENCE", "no frame evidence", (l) => l / 255), // ssot-ok(MEASUREMENT_MECHANISM): 8-bit luminance to [0,1]
  "lighting.shadowTemperature": fromEvidence("pixel.temperatureBias", (e) => measured(e.pixel.temperatureBias), "INSUFFICIENT_PHYSICAL_EVIDENCE", "no frame evidence", (b) => (b + 1) / 2), // ssot-ok(MEASUREMENT_MECHANISM): bias [-1,1] to [0,1]
  "lighting.mistDensity": fromEvidence("depth.atmosphericDepth", (e) => measured(e.depth.atmosphericDepth), "DEPTH_BUFFER_UNAVAILABLE", "the reference render has no depth buffer"),
  "lighting.accentLuminance": (c) => {
    const hex = measured(c.evidence.pixel.accentColor);
    return typeof hex === "string" ? { value: hexLuma01(hex), tag: `evidence:${c.evidence.evidenceId}#pixel.accentColor` } : { block: "INSUFFICIENT_PHYSICAL_EVIDENCE", reason: "no accent colour measured" };
  },
  "camera.fov": fromIR("/camera/fov", (c) => c.validatedIR.validated.camera.fov.value),
  "camera.pitch": fromIR("/camera/angle", (c) => c.validatedIR.validated.camera.angle.value),
  "camera.yaw": () => ({ value: 0, tag: "renderer:software-rasterizer#fixed-forward-camera" }), // ssot-ok(PHYSICAL_SAFETY): the software rasteriser has no yaw axis; its camera looks straight ahead
  "camera.parallaxLayers": fromIR("/composition/depthLayerCount", (c) => c.validatedIR.validated.composition.depthLayerCount.value),
  "motion.cameraMotionSmoothness": (c) => motion(c, (m) => m.cameraMotionSmoothness.value, "motion.cameraMotionSmoothness"),
  "motion.opticalFlowCoherence": (c) => motion(c, (m) => m.opticalFlowDirectionCoherence.value, "motion.opticalFlowDirectionCoherence"),
  "motion.motionContinuity": (c) => motion(c, (m) => m.motionContinuity.value, "motion.motionContinuity"),
  "motion.isDynamic": (c) => ({ value: c.evidence.motion !== null, tag: `evidence:${c.evidence.evidenceId}#motion.present` }),
};

function motion(c: SceneCompilerInput, read: (m: NonNullable<ObservableEvidenceSet["motion"]>) => number, field: string): Resolved | Blocked {
  const m = c.evidence.motion;
  return m ? { value: read(m), tag: `evidence:${c.evidence.evidenceId}#${field}` } : { block: "MOTION_DATA_UNAVAILABLE", reason: "single reference frame: no frame pair to measure motion" };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4; // ssot-ok(NUMERIC_GUARD): 4-decimal canonical rounding, identical to the adapter's

function build(c: SceneCompilerInput, key: keyof typeof SCENE_PARAMETER_SOURCES, blocks: SceneCapabilityBlocked[]): TracedSceneParameter<number> | TracedSceneParameter<boolean> {
  const [domain, name] = key.split(".") as [Domain, string];
  const targetPath = `scene.${domain}.${name}`;
  const instructions = c.runtimePlan.instructions.filter((i: RuntimeInstruction) => i.targetPath === targetPath).sort((a, b) => a.seq - b.seq);
  if (instructions.length > 0) {
    const last = instructions[instructions.length - 1];
    return {
      value: typeof last.value === "number" ? round4(last.value) : (last.value as unknown as number),
      appliedFromInstructionSeq: instructions.map((i) => i.seq),
      provenanceHashes: instructions.map((i) => i.metadata.provenanceHash),
    };
  }
  const base = SCENE_PARAMETER_SOURCES[key](c);
  if (isBlocked(base)) {
    blocks.push({
      code: base.block,
      reason: `${targetPath}: ${base.reason}`,
      affectedDomain: domain,
      affectedParameter: name,
      provenance: { provenanceHash: `blocked:${base.block}` },
      blockedAt: c.compiledAt,
    });
    return { value: 0, appliedFromInstructionSeq: [], provenanceHashes: [`blocked:${base.block}`], description: "BLOCKED placeholder: not a measurement, never read downstream" };
  }
  return { value: typeof base.value === "number" ? round4(base.value) : base.value, appliedFromInstructionSeq: [], provenanceHashes: [base.tag] } as TracedSceneParameter<number>;
}

export function compileSceneIR(c: SceneCompilerInput): SceneCompilationIR {
  const blocks: SceneCapabilityBlocked[] = [];
  const p = (key: keyof typeof SCENE_PARAMETER_SOURCES) => build(c, key, blocks) as TracedSceneParameter;
  const manifest: SceneAssetManifest = c.assetManifest ?? {
    manifestVersion: "1.0.0",
    sceneId: c.sceneId,
    generatedAt: c.compiledAt,
    assets: [],
    totalAssets: 0,
    physicalAssetCount: 0,
    derivedAssetCount: 0,
  };
  const ir: Omit<SceneCompilationIR, "deterministicDigest"> = {
    schemaVersion: "1.0.0",
    sceneId: c.sceneId,
    sourceProvenance: {
      validatedDesignIRHash: c.validatedIRHash,
      aestheticExecutionPlanHash: c.plan.planDigest,
      aestheticRuntimePlanHash: c.runtimePlan.deterministicDigest,
      compiledAt: c.compiledAt,
      compilerVersion: c.compilerVersion,
    },
    composition: { negativeSpaceRatio: p("composition.negativeSpaceRatio"), focalOffset: p("composition.focalOffset"), clusterDensity: p("composition.clusterDensity"), axialSymmetry: p("composition.axialSymmetry") },
    spatial: { depthLayers: p("spatial.depthLayers"), atmosphericDensity: p("spatial.atmosphericDensity"), horizonPosition: p("spatial.horizonPosition"), occlusionRatio: p("spatial.occlusionRatio") },
    material: { patinaLevel: p("material.patinaLevel"), specularSharpness: p("material.specularSharpness"), contrastRatio: p("material.contrastRatio"), surfaceEntropy: p("material.surfaceEntropy") },
    lighting: { skyLuminance: p("lighting.skyLuminance"), shadowTemperature: p("lighting.shadowTemperature"), mistDensity: p("lighting.mistDensity"), accentLuminance: p("lighting.accentLuminance") },
    camera: { fov: p("camera.fov"), pitch: p("camera.pitch"), yaw: p("camera.yaw"), parallaxLayers: p("camera.parallaxLayers") },
    motion: {
      cameraMotionSmoothness: p("motion.cameraMotionSmoothness"),
      opticalFlowCoherence: p("motion.opticalFlowCoherence"),
      motionContinuity: p("motion.motionContinuity"),
      isDynamic: build(c, "motion.isDynamic", blocks) as TracedSceneParameter<boolean>,
    },
    assetBindings: { manifest, hashes: {} },
    ...(blocks.length ? { capabilityBlocks: blocks } : {}),
  };
  return { ...ir, deterministicDigest: computeSceneDigest(ir) };
}
