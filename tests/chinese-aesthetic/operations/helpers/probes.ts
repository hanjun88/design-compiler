/**
 * A deterministic sweep of (IR, graph) probes for the operator tests.
 *
 * Values come from a structural grid over the unit interval (i / 20) mixed with seeded continuous
 * draws; none of them is an aesthetic number of the registry. The sweep is wide enough that every
 * activation branch and every clamp of every operator is exercised under any sensible policy.
 */
import type { RawDesignIR } from "../../../../compiler-core/contracts";
import type { AestheticRelationshipGraph } from "../../../../chinese-aesthetic/graph/types";
import { p } from "./operation-fixtures";

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;
const pick = <T,>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const GRID = Array.from({ length: 21 }, (_, i) => i / 20);
const unit = (r: Rng): number => (r() < 0.7 ? pick(r, GRID) : Math.round(r() * 10000) / 10000);

function makeIR(r: Rng): RawDesignIR {
  const material = (role: string) => ({
    role,
    baseType: p("WOOD::probe", "scalar"),
    roughness: p(unit(r), "ratio"),
    metalness: p(unit(r), "ratio"),
    wear: p(unit(r), "ratio"),
  });
  const layout = pick(r, ["none", "dominant", "pair", "pair", "pair", "reversed", "untyped"] as const);
  const materials =
    layout === "none" ? []
      : layout === "dominant" ? [material("dominant")]
      : layout === "pair" ? [material("dominant"), material("secondary")]
      : layout === "reversed" ? [material("secondary"), material("dominant")]
      : [material("background"), material("background")];
  return {
    $schema: "probe",
    meta: { sourceType: "image", aspectRatio: "16:9", timestamp: "2026-09-16T00:00:00Z" },
    composition: {
      focalPoint: p([unit(r), unit(r)], "vector2"),
      negativeSpaceRatio: p(unit(r), "ratio"),
      depthLayerCount: p(Math.floor(r() * 9), "scalar"),
      symmetry: p(unit(r), "ratio"),
    },
    camera: { fov: p(50, "degrees"), shotSize: p("medium", "scalar"), angle: p(Math.round((r() * 80 - 40) * 100) / 100, "degrees"), height: p(1.6, "ratio") },
    lighting: {
      keyLight: {
        azimuth: p(45, "degrees"),
        elevation: p(30, "degrees"),
        colorTemp: p(5500, "scalar"),
        intensity: p(Math.round((0.2 + r() * 1.6) * 1000) / 1000, "ratio"),
        softness: p(unit(r), "ratio"),
      },
      ambientRatio: p(unit(r), "ratio"),
      rimLightPresent: p(r() < 0.6, "scalar"),
    },
    materials,
    color: {
      dominant: p("#8B7355", "hex"),
      secondary: p("#6B5344", "hex"),
      accent: p("#C4A35A", "hex"),
      contrastRatio: p(3.5, "ratio"),
      temperatureBias: p(Math.round((r() * 1.3 - 0.3) * 1000) / 1000, "ratio"),
    },
    provenance: {
      extractorVersion: "probe",
      inferenceExecutionMs: 1,
      rawIntegrityStatus: "READY",
      hashManifest: { algorithm: "SHA-256", canonicalization: "RFC8785" },
      inputHash: "probe-input",
      rawIRHash: "probe-ir",
    },
  } as unknown as RawDesignIR;
}

function makeGraph(r: Rng): AestheticRelationshipGraph {
  const node = (id: string, type: string) => ({ id, type, boundingRegion: null, energy: unit(r), evidenceRefs: ["e"], confidence: 0.9 });
  const rel = (relationType: string, magnitude: number, sourceId = "node:subject:primary", targetId = "node:void:negative-space") => ({
    sourceId, targetId, relationType, magnitude, polarity: "MUTUAL", derivedFrom: ["d"], confidence: 0.85,
  });
  const nodes = [
    node("node:subject:primary", "SUBJECT"),
    node("node:void:negative-space", "VOID"),
    node("node:space:composition", "SPACE"),
    node("node:light:luminance-field", "LIGHT"),
    node("node:material:dominant", "MATERIAL"),
    node("node:boundary:edges", "BOUNDARY"),
    node("node:time:patina", "TIME"),
  ].filter((n) => n.type === "SUBJECT" || n.type === "VOID" || r() > 0.08);
  const relations = [
    r() < 0.9 ? rel("SOLID_VOID", unit(r)) : null,
    r() < 0.9 ? rel("DENSE_SPARSE", unit(r), "node:boundary:edges") : null,
    r() < 0.9 ? rel("HEAVY_LIGHT", unit(r), "node:material:dominant", "node:light:luminance-field") : null,
    r() < 0.9 ? rel("HIGH_LOW", unit(r), "node:light:luminance-field") : null,
    r() < 0.9 ? rel("OPEN_CLOSE", unit(r), "node:space:composition", "node:boundary:edges") : null,
    r() < 0.45 ? rel("NEAR_FAR", unit(r)) : null,
    r() < 0.95 ? rel("HOST_GUEST", unit(r), "node:subject:primary", "node:space:composition") : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);
  const unmeasuredRelations = [{ relationType: "MOVE_STILL", reason: "single frame", semanticInterpretationRef: "s:motion" }];
  if (r() < 0.5) unmeasuredRelations.push({ relationType: "NEAR_FAR", reason: "no depth buffer", semanticInterpretationRef: "s:depth" });
  return {
    graphId: "probe",
    evidenceId: "probe",
    generatedAt: "2026-09-16T00:00:00Z",
    nodes,
    relations,
    unmeasuredRelations,
    topologyAudit: { noIsolatedNodes: true, polarAlignment: true, boundedEnergy: true, purityPenetration: true, violations: [], status: "PASS" },
    graphHash: "probe",
    derivationPipeline: [],
  } as unknown as AestheticRelationshipGraph;
}

export interface Probe { ir: RawDesignIR; graph: AestheticRelationshipGraph }

/** `count` deterministic probes; the same seed always yields the same sweep. */
export function makeProbes(count = 400, seed = 20260930): Probe[] {
  const r = mulberry32(seed);
  return Array.from({ length: count }, () => ({ ir: makeIR(r), graph: makeGraph(r) }));
}
