/**
 * Anti-pattern gates — where their numbers come from, and what they decide with them.
 *
 * design-compiler does not define aesthetic numbers: the thresholds of ANTI-01..05 are the
 * ANTI_PATTERN_THRESHOLD decisions of the skill's AestheticConstraintSheet, read through the
 * DecisionPack. These tests prove it and pin the decision logic:
 *
 *  - every gate follows the decision table of its constitution (signals -> verdict + confidence);
 *    each signal is driven one probe beyond its threshold ("on") or exactly on it ("off": a strict
 *    comparison must not trigger). All inputs are derived from the pack — no threshold is typed here;
 *  - the same tables are run under packs of the REAL sheet in which exactly one decision key is moved:
 *    a gate that ignored the sheet for any key (a copy of its value in code) would disagree with the table;
 *  - the keys the gates read are exactly the keys ANTI_PATTERN_REQUIREMENTS declares (usage ledger);
 *  - a missing pack / decision fails closed: the orchestrator never turns it into a FLAG verdict;
 *  - ADR-0001: the dead-void "candidate" trigger is its own policy decision, not a void_ratio band.
 */
import { detectDeadVoid } from "../../../chinese-aesthetic/anti-pattern/gates/dead-void";
import { detectToxicSaturation } from "../../../chinese-aesthetic/anti-pattern/gates/toxic-saturation";
import { detectUnphysicalGlow } from "../../../chinese-aesthetic/anti-pattern/gates/unphysical-glow";
import { detectSymbolicStacking } from "../../../chinese-aesthetic/anti-pattern/gates/symbolic-stacking";
import { detectConflictedHierarchy } from "../../../chinese-aesthetic/anti-pattern/gates/conflicted-hierarchy";
import { runAntiPatternGate } from "../../../chinese-aesthetic/anti-pattern/anti-pattern-gate";
import type { AntiPatternResult, GateContext, GateVerdict } from "../../../chinese-aesthetic/anti-pattern/types";
import type { ObservableEvidenceSet } from "../../../chinese-aesthetic/extraction/types";
import type { AestheticRelationshipGraph } from "../../../chinese-aesthetic/graph/types";
import type { AestheticConstraintSheet, ConstraintOfKind } from "../../../contracts/aesthetic-constraint-sheet/aesthetic-constraint-sheet.types";
import { withDecisionPack } from "../../../skill-bridge/active-pack";
import { DecisionPack, MissingDecisionError, type PolicyView } from "../../../skill-bridge/decision-pack";
import { SheetRejectedError } from "../../../skill-bridge/errors";
import { validateSheet } from "../../../skill-bridge/sheet-validator";
import { ANTI_PATTERN_REQUIREMENTS } from "../../../skill-bridge/requirements/anti-pattern";
import { defaultPackFor, loadSheetJson, strictBinding } from "../../support/skill-packs";
import { mutate } from "../../skill-bridge/helpers/sheet-tools";
import {
  GATE_TEST_CONTEXT, NEUTRAL_ENERGY, connectedComposition, defaultGatePack, edgesOf, field, freshGatePack, gatePolicy, justAbove, justBelow, makeEvidence,
  makeGraph, node, nodesOf, packOfEdited, packWith, ratioAbove, relation, unrelaxedParadigm, type EvidencePatch, type GateSubject,
} from "./helpers/fixtures";

// ---------------------------------------------------------------------------
// plumbing
// ---------------------------------------------------------------------------

type Gate = (ctx: GateContext) => AntiPatternResult;
const run = (gate: Gate, pack: DecisionPack, evidence: ObservableEvidenceSet, graph: AestheticRelationshipGraph): AntiPatternResult =>
  withDecisionPack(pack, () => gate({ evidence, graph }));

const BOOLS = [false, true] as const;
/** A signal driven "on" one probe beyond its threshold, or "off" exactly on it (a strict comparison must not trigger). */
const above = (threshold: number, on: boolean): number => (on ? justAbove(threshold) : threshold);
const below = (threshold: number, on: boolean): number => (on ? justBelow(threshold) : threshold);

/** What a gate decided, as one comparable line: verdict, reported confidence, and whether it declared the assessment UNMEASURED. */
const outcome = (r: AntiPatternResult): string => `${r.verdict}@${r.confidence}${r.unmeasuredReason ? "+unmeasured" : ""}`;

/** Moves a numeric decision value away from where the sheet has it. */
const moved = (v: number): number => v * 2 + 1;

function declaredParams(subject: GateSubject): readonly string[] {
  const r = ANTI_PATTERN_REQUIREMENTS.find((x) => x.subject === subject);
  if (!r) throw new Error(`ANTI_PATTERN_REQUIREMENTS declares nothing for ${subject}`);
  return r.params ?? [];
}

/**
 * Every check below is `(gatePack, source)`: the gate runs under `gatePack`; the inputs and expectations
 * are derived from `source`. They are the same pack except in the usage-ledger test, where `source` is
 * a different pack of the same sheet so that only the gates' own reads are recorded on `gatePack`.
 *
 * `acrossPacks` runs a check under the real sheet and under one pack per numeric key with exactly that key
 * moved (inputs derived from the moved pack), and returns every disagreement.
 */
function acrossPacks(subject: GateSubject, check: (gatePack: DecisionPack, source: DecisionPack) => string[]): string[] {
  const out: string[] = check(defaultGatePack(), defaultGatePack()).map((m) => `[real sheet] ${m}`);
  for (const key of declaredParams(subject)) {
    const pack = packWith(subject, { params: { [key]: moved(gatePolicy(subject).num(key)) } });
    out.push(...check(pack, pack).map((m) => `[${subject}.${key} moved] ${m}`));
  }
  return out;
}

/** An evidence patch that leaves one measurement out (= UNMEASURED). */
const unmeasured = (section: "pixel" | "material", key: string): EvidencePatch => ({ [section]: { [key]: undefined } }) as EvidencePatch;

// ---------------------------------------------------------------------------
// ANTI-03 dead void
// ---------------------------------------------------------------------------

function deadVoidMismatches(gatePack: DecisionPack, source: DecisionPack): string[] {
  const s = gatePolicy("dead-void", source);
  const graph = connectedComposition(source);
  graph.nodes.push(node("nv", "VOID"));
  graph.relations.push(relation("n0", "nv", "SOLID_VOID"));
  const out: string[] = [];
  for (const large of BOOLS) for (const dominant of BOOLS) for (const texture of BOOLS) for (const gradient of BOOLS) for (const tonal of BOOLS)
    for (const buffer of BOOLS) for (const atmospheric of BOOLS) {
      const evidence = makeEvidence({
        pixel: {
          negativeSpaceRatio: field(above(s.num("candidate_void_ratio_above"), large), "pixel:void-ratio"),
          largestVoidRegionRatio: field(above(s.num("dominant_void_region_ratio_above"), dominant), "pixel:largest-void"),
          spatialLaplacianVariance: field(below(s.num("laplacian_variance_below"), texture), "pixel:laplacian"),
          blockLuminanceMeanGradient: field(below(s.num("block_luminance_gradient_below"), gradient), "pixel:block-gradient"),
          luminanceStdDev: field(below(s.num("luminance_std_below"), tonal), "pixel:luminance-std"),
        },
        depth: { depthBufferAvailable: buffer, atmosphericDepthMeasured: atmospheric },
      }, source);
      const hasDepth = buffer || atmospheric;
      let expected: string;
      if (large && dominant && texture && gradient && tonal && hasDepth) expected = `REJECT@${s.num("confidence_reject")}`;
      else if (large && (texture || gradient) && !hasDepth) expected = `FLAG@${s.num("confidence_flag_no_depth")}+unmeasured`;
      else if (large && texture && gradient) expected = `FLAG@${s.num("confidence_flag")}`;
      else expected = `ALLOW@${s.num("confidence_allow")}`;
      const got = outcome(run(detectDeadVoid, gatePack, evidence, graph));
      if (got !== expected) out.push(`large=${large} dominant=${dominant} texture=${texture} gradient=${gradient} tonal=${tonal} buffer=${buffer} atmospheric=${atmospheric}: got ${got}, expected ${expected}`);
    }
  return out;
}

describe("ANTI-03 dead void", () => {
  it("follows its decision table for every combination of the five signals and the depth evidence", () => {
    expect(acrossPacks("dead-void", deadVoidMismatches)).toEqual([]);
  });

  /** Every dead-void signal satisfied. */
  const allSignalsOn = (patch: EvidencePatch = {}): ObservableEvidenceSet => {
    const t = gatePolicy("dead-void");
    return makeEvidence({
      pixel: {
        negativeSpaceRatio: field(justAbove(t.num("candidate_void_ratio_above")), "pixel:void-ratio"),
        largestVoidRegionRatio: field(justAbove(t.num("dominant_void_region_ratio_above")), "pixel:largest-void"),
        spatialLaplacianVariance: field(justBelow(t.num("laplacian_variance_below")), "pixel:laplacian"),
        blockLuminanceMeanGradient: field(justBelow(t.num("block_luminance_gradient_below")), "pixel:block-gradient"),
        luminanceStdDev: field(justBelow(t.num("luminance_std_below")), "pixel:luminance-std"),
        ...patch.pixel,
      },
      depth: patch.depth,
    });
  };
  const verdictOf = (e: ObservableEvidenceSet): GateVerdict => run(detectDeadVoid, defaultGatePack(), e, connectedComposition()).verdict;

  it("rejects only with depth evidence: none => FLAG; a depth buffer or a measured atmospheric depth => REJECT (UNMEASURED != FAIL)", () => {
    expect(verdictOf(allSignalsOn())).toBe("FLAG");
    expect(verdictOf(allSignalsOn({ depth: { depthBufferAvailable: true } }))).toBe("REJECT");
    expect(verdictOf(allSignalsOn({ depth: { atmosphericDepthMeasured: true } }))).toBe("REJECT");
  });

  it("a large void is only a candidate: with texture, gradient or tonal variation it is allowed (留白必须有功能)", () => {
    const t = gatePolicy("dead-void");
    const functionalVoid = makeEvidence({
      pixel: {
        negativeSpaceRatio: field(justAbove(t.num("candidate_void_ratio_above")), "pixel:void-ratio"),
        largestVoidRegionRatio: field(justAbove(t.num("dominant_void_region_ratio_above")), "pixel:largest-void"),
      },
      depth: { depthBufferAvailable: true },
    });
    expect(verdictOf(functionalVoid)).toBe("ALLOW");
  });

  it.each(["negativeSpaceRatio", "spatialLaplacianVariance", "blockLuminanceMeanGradient"])(
    "%s not measured => ALLOW with no confidence and an UNMEASURED reason (UNMEASURED != FAIL)",
    (measurement) => {
      const r = run(detectDeadVoid, defaultGatePack(), allSignalsOn(unmeasured("pixel", measurement)), connectedComposition());
      expect(r.verdict).toBe("ALLOW");
      expect(r.confidence).toBe(0); // protocol: an unmeasured assessment carries no confidence (anti-pattern/types.ts)
      expect(r.unmeasuredReason).toBeDefined();
    },
  );
});

// ---------------------------------------------------------------------------
// ANTI-05 toxic saturation
// ---------------------------------------------------------------------------

/** Evidence with dominant-colour overflow, high contrast and low tonal variation (the REJECT signals) for a paradigm. */
function fluorescentEvidence(pack: DecisionPack, paradigm: string): ObservableEvidenceSet {
  const s = gatePolicy("toxic-saturation", pack);
  return makeEvidence({
    pixel: {
      dominantColorRatio: field(justAbove(s.num("dominant_color_ratio_above")), "pixel:dominant-ratio"),
      contrastRatio: field(justAbove(s.num("contrast_ratio_above")), "pixel:contrast-ratio"),
      luminanceStdDev: field(justBelow(s.num("luminance_std_below")), "pixel:luminance-std"),
    },
    ir: { paradigm },
  }, pack);
}

function toxicMismatches(gatePack: DecisionPack, source: DecisionPack): string[] {
  const s = gatePolicy("toxic-saturation", source);
  const paradigms = [
    { name: unrelaxedParadigm(source), relaxed: false },
    ...s.list("high_saturation_paradigms").flatMap((name) => [
      { name, relaxed: true },
      { name: name.toLowerCase(), relaxed: true }, // evidence may spell the paradigm in lower case
    ]),
  ];
  const graph = connectedComposition(source);
  const biasLimit = s.num("temperature_bias_abs_above");
  const out: string[] = [];
  for (const overflow of BOOLS) for (const contrast of BOOLS) for (const lowVariation of BOOLS) for (const bias of ["none", "hot", "cold"] as const) for (const p of paradigms) {
    const evidence = makeEvidence({
      pixel: {
        dominantColorRatio: field(above(s.num("dominant_color_ratio_above"), overflow), "pixel:dominant-ratio"),
        contrastRatio: field(above(s.num("contrast_ratio_above"), contrast), "pixel:contrast-ratio"),
        luminanceStdDev: field(below(s.num("luminance_std_below"), lowVariation), "pixel:luminance-std"),
        temperatureBias: field(bias === "none" ? biasLimit : bias === "hot" ? justAbove(biasLimit) : -justAbove(biasLimit), "pixel:temp-bias"),
      },
      ir: { paradigm: p.name },
    }, source);
    const extremeTemperature = bias !== "none";
    let expected: string;
    if (overflow && contrast && lowVariation && !p.relaxed) expected = `REJECT@${s.num("confidence_reject")}`;
    else if ((overflow && contrast) || (overflow && extremeTemperature) || (contrast && lowVariation && !p.relaxed)) expected = `FLAG@${s.num("confidence_flag")}`;
    else expected = `ALLOW@${s.num("confidence_allow")}`;
    const got = outcome(run(detectToxicSaturation, gatePack, evidence, graph));
    if (got !== expected) out.push(`overflow=${overflow} contrast=${contrast} lowVariation=${lowVariation} bias=${bias} paradigm=${p.name}(relaxed=${p.relaxed}): got ${got}, expected ${expected}`);
  }
  return out;
}

describe("ANTI-05 toxic saturation", () => {
  it("follows its decision table for every combination of the signals, the colour-temperature bias and the paradigm", () => {
    expect(acrossPacks("toxic-saturation", toxicMismatches)).toEqual([]);
  });

  it("the exempt paradigms themselves come from the sheet: the exemption follows the list, with no change in code", () => {
    const current = gatePolicy("toxic-saturation").list("high_saturation_paradigms");
    const other = unrelaxedParadigm();
    const verdictFor = (pack: DecisionPack, paradigm: string) => run(detectToxicSaturation, pack, fluorescentEvidence(pack, paradigm), connectedComposition()).verdict;

    const replaced = packWith("toxic-saturation", { lists: { high_saturation_paradigms: [other] } });
    expect(current).not.toContain(other);
    expect(toxicMismatches(replaced, replaced)).toEqual([]);
    expect(verdictFor(replaced, other)).toBe("FLAG"); // the new paradigm is exempt from REJECT ...
    expect(verdictFor(replaced, current[0])).toBe("REJECT"); // ... the former one no longer is

    const extended = packWith("toxic-saturation", { lists: { high_saturation_paradigms: [...current, other] } });
    expect(toxicMismatches(extended, extended)).toEqual([]);
    expect(verdictFor(extended, other)).toBe("FLAG");
    expect(verdictFor(extended, current[0])).toBe("FLAG");
  });

  it("as shipped, the exempt paradigm downgrades REJECT to FLAG; its own ALLOW branch is unreachable (the FLAG clause matches first)", () => {
    const pack = defaultGatePack();
    const t = gatePolicy("toxic-saturation", pack);
    const graph = connectedComposition();
    expect(run(detectToxicSaturation, pack, fluorescentEvidence(pack, unrelaxedParadigm()), graph).verdict).toBe("REJECT");
    const exempt = run(detectToxicSaturation, pack, fluorescentEvidence(pack, t.list("high_saturation_paradigms")[0]), graph);
    expect(exempt.verdict).toBe("FLAG");
    expect(exempt.confidence).toBe(t.num("confidence_flag"));
  });

  it.each(["dominantColorRatio", "contrastRatio", "luminanceStdDev"])(
    "%s not measured => ALLOW with no confidence and an UNMEASURED reason (UNMEASURED != FAIL)",
    (measurement) => {
      const r = run(detectToxicSaturation, defaultGatePack(), makeEvidence(unmeasured("pixel", measurement)), connectedComposition());
      expect(r.verdict).toBe("ALLOW");
      expect(r.confidence).toBe(0); // protocol: an unmeasured assessment carries no confidence (anti-pattern/types.ts)
      expect(r.unmeasuredReason).toBeDefined();
    },
  );
});

// ---------------------------------------------------------------------------
// ANTI-02 unphysical glow
// ---------------------------------------------------------------------------

function glowMismatches(gatePack: DecisionPack, source: DecisionPack): string[] {
  const s = gatePolicy("unphysical-glow", source);
  const graph = connectedComposition(source);
  const out: string[] = [];
  for (const homogeneous of BOOLS) for (const sharp of BOOLS) for (const significant of BOOLS) for (const lowVariation of BOOLS) {
    const evidence = makeEvidence({
      material: {
        microSurfaceHighFrequencyVariance: field(below(s.num("micro_surface_variance_below"), homogeneous), "material:micro-variance"),
        specularSharpness: field(above(s.num("specular_sharpness_above"), sharp), "material:specular-sharpness"),
        specularHighlightRatio: field(above(s.num("specular_highlight_ratio_above"), significant), "material:specular-ratio"),
        surfaceVariation: field(below(s.num("surface_variation_below"), lowVariation), "material:surface-variation"),
      },
    }, source);
    let expected: string;
    if (homogeneous && sharp && significant) expected = `REJECT@${s.num("confidence_reject")}`;
    else if ((homogeneous && sharp) || (sharp && significant) || (homogeneous && lowVariation && significant)) expected = `FLAG@${s.num("confidence_flag")}`;
    else expected = `ALLOW@${s.num("confidence_allow")}`;
    const got = outcome(run(detectUnphysicalGlow, gatePack, evidence, graph));
    if (got !== expected) out.push(`homogeneous=${homogeneous} sharp=${sharp} significant=${significant} lowVariation=${lowVariation}: got ${got}, expected ${expected}`);
  }
  return out;
}

describe("ANTI-02 unphysical glow", () => {
  it("follows its decision table for every combination of the four signals", () => {
    expect(acrossPacks("unphysical-glow", glowMismatches)).toEqual([]);
  });

  it("a single condition is no anti-pattern: a homogeneous matte surface alone is allowed", () => {
    const t = gatePolicy("unphysical-glow");
    const matte = makeEvidence({ material: { microSurfaceHighFrequencyVariance: field(justBelow(t.num("micro_surface_variance_below")), "material:micro-variance") } });
    expect(run(detectUnphysicalGlow, defaultGatePack(), matte, connectedComposition()).verdict).toBe("ALLOW");
  });

  it.each(["microSurfaceHighFrequencyVariance", "specularSharpness", "specularHighlightRatio"])(
    "%s not measured => ALLOW with no confidence and an UNMEASURED reason (UNMEASURED != FAIL)",
    (measurement) => {
      const r = run(detectUnphysicalGlow, defaultGatePack(), makeEvidence(unmeasured("material", measurement)), connectedComposition());
      expect(r.verdict).toBe("ALLOW");
      expect(r.confidence).toBe(0); // protocol: an unmeasured assessment carries no confidence (anti-pattern/types.ts)
      expect(r.unmeasuredReason).toBeDefined();
    },
  );
});

// ---------------------------------------------------------------------------
// ANTI-04 conflicted hierarchy
// ---------------------------------------------------------------------------

/** `count` SUBJECT nodes whose relative energy difference (max-min)/max is `ratio`; every subject hosts the space; optionally s0 hosts s1. */
function subjectsGraph(count: number, ratio: number, hostGuestBetweenSubjects: boolean): AestheticRelationshipGraph {
  const top = NEUTRAL_ENERGY;
  const bottom = top * (1 - ratio);
  const energies = Array.from({ length: count }, (_, i) => (i === 0 ? top : i === count - 1 ? bottom : (top + bottom) / 2));
  const subjects = energies.map((e, i) => node(`s${i}`, "SUBJECT", e));
  const relations = [
    ...subjects.map((sub) => relation(sub.id, "space", "HOST_GUEST")),
    ...(hostGuestBetweenSubjects && count >= 2 ? [relation("s0", "s1", "HOST_GUEST")] : []),
  ];
  return makeGraph([...subjects, node("space", "SPACE")], relations);
}

function hierarchyMismatches(gatePack: DecisionPack, source: DecisionPack): string[] {
  const s = gatePolicy("conflicted-hierarchy", source);
  const close = s.num("close_energy_diff_ratio_below");
  const evidence = makeEvidence({}, source);
  const out: string[] = [];
  for (const count of [0, 1, 2, 3]) for (const isClose of BOOLS) for (const hostGuest of BOOLS) {
    // the gap is computed from energies: probe a safe distance either side of the cut-off rather than its exact value
    const ratio = isClose ? justBelow(close) : justAbove(close);
    const multiple = count >= 2;
    let expected: string;
    if (multiple && isClose && !hostGuest) expected = `REJECT@${s.num("confidence_reject")}`;
    else if (multiple && (isClose || !hostGuest)) expected = `FLAG@${s.num("confidence_flag")}`;
    else if (count === 0) expected = `ALLOW@${s.num("confidence_allow_no_subject")}`;
    else expected = `ALLOW@${s.num("confidence_allow")}`;
    const got = outcome(run(detectConflictedHierarchy, gatePack, evidence, subjectsGraph(count, ratio, hostGuest)));
    if (got !== expected) out.push(`subjects=${count} close=${isClose} hostGuestBetweenSubjects=${hostGuest}: got ${got}, expected ${expected}`);
  }
  return out;
}

describe("ANTI-04 conflicted hierarchy", () => {
  it("follows its decision table for every combination of subject count, energy gap and host-guest subordination", () => {
    expect(acrossPacks("conflicted-hierarchy", hierarchyMismatches)).toEqual([]);
  });

  it("subjects with a clear energy gap and a host-guest edge between them have a clear hierarchy: allowed", () => {
    const close = gatePolicy("conflicted-hierarchy").num("close_energy_diff_ratio_below");
    const r = run(detectConflictedHierarchy, defaultGatePack(), makeEvidence(), subjectsGraph(2, ratioAbove(close), true));
    expect(r.verdict).toBe("ALLOW");
  });

  it("a single subject, or none at all, is never in conflict", () => {
    const close = gatePolicy("conflicted-hierarchy").num("close_energy_diff_ratio_below");
    for (const count of [0, 1]) {
      expect(run(detectConflictedHierarchy, defaultGatePack(), makeEvidence(), subjectsGraph(count, justBelow(close), false)).verdict).toBe("ALLOW");
    }
  });
});

// ---------------------------------------------------------------------------
// ANTI-01 symbolic stacking
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The documented rule, recomputed from the graph: topology signals (never an object count) -> verdict. */
function stackingExpected(graph: AestheticRelationshipGraph, s: PolicyView): string {
  const nodeCount = graph.nodes.length;
  const average = nodeCount > 0 ? (graph.relations.length * 2) / nodeCount : 0;
  const degree = new Map<string, number>();
  const inDegree = new Map<string, number>();
  for (const n of graph.nodes) { degree.set(n.id, 0); inDegree.set(n.id, 0); }
  for (const r of graph.relations) {
    degree.set(r.sourceId, (degree.get(r.sourceId) ?? 0) + 1);
    degree.set(r.targetId, (degree.get(r.targetId) ?? 0) + 1);
    inDegree.set(r.targetId, (inDegree.get(r.targetId) ?? 0) + 1);
  }
  const isolated = [...degree.values()].filter((d) => d === 0).length;
  const hostGuest = graph.relations.filter((r) => r.relationType === "HOST_GUEST").length;
  const maxInDegree = Math.max(0, ...inDegree.values());
  const signals = [nodeCount >= s.num("many_nodes_min"), average < s.num("low_average_degree_below"), hostGuest === 0, maxInDegree < s.num("convergence_in_degree_min")].filter(Boolean).length;
  if (signals >= s.num("reject_severe_signals_min") && isolated >= s.num("isolated_nodes_min")) return `REJECT@${s.num("confidence_reject")}`;
  if (signals >= s.num("flag_severe_signals_min")) return `FLAG@${s.num("confidence_flag")}`;
  return `ALLOW@${s.num("confidence_allow")}`;
}

function randomTopology(rnd: () => number, maxNodes: number): AestheticRelationshipGraph {
  const nodeCount = Math.floor(rnd() * (maxNodes + 1));
  const relationCount = nodeCount === 0 ? 0 : Math.floor(rnd() * (3 * nodeCount + 1));
  const hostGuestShare = rnd() < 0.5 ? 0 : 0.25;
  const relations = Array.from({ length: relationCount }, () =>
    relation(`n${Math.floor(rnd() * nodeCount)}`, `n${Math.floor(rnd() * nodeCount)}`, rnd() < hostGuestShare ? "HOST_GUEST" : "SOLID_VOID"));
  return makeGraph(nodesOf(nodeCount), relations);
}

function stackingMismatches(gatePack: DecisionPack, source: DecisionPack): string[] {
  const s = gatePolicy("symbolic-stacking", source);
  const evidence = makeEvidence({}, source);
  const rnd = mulberry32(20261003);
  const maxNodes = s.num("many_nodes_min") + 4; // straddle the "many nodes" cut-off
  const out: string[] = [];
  for (let i = 0; i < 300; i++) {
    const graph = randomTopology(rnd, maxNodes);
    const expected = stackingExpected(graph, s);
    const got = outcome(run(detectSymbolicStacking, gatePack, evidence, graph));
    if (got !== expected) out.push(`random topology #${i} (${graph.nodes.length} nodes, ${graph.relations.length} relations): got ${got}, expected ${expected}`);
  }
  return out;
}

describe("ANTI-01 symbolic stacking", () => {
  it("follows the documented topology rule on random graphs that straddle every cut-off", () => {
    expect(acrossPacks("symbolic-stacking", stackingMismatches)).toEqual([]);
  });

  const t = () => gatePolicy("symbolic-stacking");
  const resultOf = (graph: AestheticRelationshipGraph): AntiPatternResult => run(detectSymbolicStacking, defaultGatePack(), makeEvidence(), graph);

  it("mechanical stacking (many nodes, no relation at all) is rejected", () => {
    const r = resultOf(makeGraph(nodesOf(t().num("many_nodes_min")), []));
    expect(r.verdict).toBe("REJECT");
    expect(r.confidence).toBe(t().num("confidence_reject"));
  });

  it("a complex but well-connected composition is not judged by its node count", () => {
    const r = resultOf(connectedComposition());
    expect(r.metrics?.nodeCount).toBeGreaterThanOrEqual(t().num("many_nodes_min"));
    expect(r.verdict).toBe("ALLOW");
  });

  it("all stacking signals without a single isolated node make a FLAG, never a REJECT", () => {
    // a path through all nodes: connected (no isolated node), few relations (low degree), no host-guest edge, no convergence
    const n = t().num("many_nodes_min");
    const r = resultOf(makeGraph(nodesOf(n), edgesOf(Array.from({ length: n - 1 }, (_, i) => [i, i + 1] as [number, number]))));
    expect(r.metrics?.isolatedNodeCount).toBe(0);
    expect(r.metrics?.severeSignalCount).toBeGreaterThanOrEqual(t().num("reject_severe_signals_min"));
    expect(r.verdict).toBe("FLAG");
  });
});

// ---------------------------------------------------------------------------
// where the numbers come from
// ---------------------------------------------------------------------------

const GATE_SUBJECTS: readonly GateSubject[] = ["symbolic-stacking", "unphysical-glow", "dead-void", "conflicted-hierarchy", "toxic-saturation"];

const policyOf = (sheet: AestheticConstraintSheet, subject: string): ConstraintOfKind<"ANTI_PATTERN_THRESHOLD"> => {
  const c = sheet.constraints.find((x): x is ConstraintOfKind<"ANTI_PATTERN_THRESHOLD"> => x.kind === "ANTI_PATTERN_THRESHOLD" && x.payload.subject === subject);
  if (!c) throw new Error(`sheet has no ANTI_PATTERN_THRESHOLD ${subject}`);
  return c;
};

describe("the gates' numbers come from the skill's sheet", () => {
  it("reads exactly the decision keys ANTI_PATTERN_REQUIREMENTS declares (the confidence of the exempt-paradigm ALLOW belongs to an unreachable branch)", () => {
    const pack = freshGatePack(); // empty usage ledger; inputs are derived from another pack, so only the gates' own reads are recorded here
    const source = defaultGatePack();
    expect([
      ...deadVoidMismatches(pack, source), ...toxicMismatches(pack, source), ...glowMismatches(pack, source),
      ...hierarchyMismatches(pack, source), ...stackingMismatches(pack, source),
    ]).toEqual([]);

    const used = new Set(pack.usage().filter((u) => u.kind === "ANTI_PATTERN_THRESHOLD").map((u) => `${u.subject}.${u.key}`));
    const declared = ANTI_PATTERN_REQUIREMENTS.flatMap((r) => [...(r.params ?? []), ...(r.enums ?? []), ...(r.lists ?? [])].map((k) => `${r.subject}.${k}`));
    expect([...used].filter((k) => !declared.includes(k)).sort()).toEqual([]); // an undeclared read is a bug
    expect(declared.filter((k) => !used.has(k)).sort()).toEqual(["toxic-saturation.confidence_allow_paradigm"]);
  });

  it("the sheet carries exactly the declared keys of each gate (no stray, unread key)", () => {
    const sheet = defaultGatePack().sheet;
    for (const r of ANTI_PATTERN_REQUIREMENTS) {
      const c = policyOf(sheet, r.subject as string);
      expect(Object.keys(c.payload.params).sort()).toEqual([...(r.params ?? [])].sort());
      expect(Object.keys(c.payload.enums ?? {}).sort()).toEqual([...(r.enums ?? [])].sort());
      expect(Object.keys(c.payload.lists ?? {}).sort()).toEqual([...(r.lists ?? [])].sort());
      expect(c.payload.flags).toBeUndefined();
      expect(c.payload.vectors).toBeUndefined();
    }
  });

  it("every gate threshold is the same in all three periods: period-less lookups (requireDecisionPack()) are unambiguous", () => {
    for (const subject of GATE_SUBJECTS) {
      for (const key of declaredParams(subject)) {
        const values = (["TANG", "SONG", "MING"] as const).map((p) => gatePolicy(subject, defaultPackFor(p)).num(key));
        expect(new Set(values).size).toBe(1);
      }
    }
  });

  it("DecisionPack.from rejects, before any compilation, a sheet that lacks a declared gate decision or key", () => {
    const codesOfBuilding = (sheet: AestheticConstraintSheet): readonly string[] => {
      try {
        DecisionPack.from(validateSheet(sheet, { allowDirty: !strictBinding() }), ANTI_PATTERN_REQUIREMENTS);
      } catch (e) {
        expect(e).toBeInstanceOf(SheetRejectedError);
        return (e as SheetRejectedError).codes;
      }
      return [];
    };
    const base = loadSheetJson(GATE_TEST_CONTEXT);
    for (const r of ANTI_PATTERN_REQUIREMENTS) {
      const withoutGate = mutate(base, (s) => { s.constraints = s.constraints.filter((c) => !(c.kind === "ANTI_PATTERN_THRESHOLD" && c.payload.subject === r.subject)); });
      expect(codesOfBuilding(withoutGate)).toEqual(["SHEET_REQUIRED_DECISION_MISSING"]);
      for (const key of r.params ?? []) {
        const withoutKey = mutate(base, (s) => { delete policyOf(s, r.subject as string).payload.params[key]; });
        expect(codesOfBuilding(withoutKey)).toEqual(["SHEET_REQUIRED_DECISION_MISSING"]);
      }
      for (const key of r.enums ?? []) {
        const withoutEnum = mutate(base, (s) => { delete policyOf(s, r.subject as string).payload.enums?.[key]; });
        expect(codesOfBuilding(withoutEnum)).toEqual(["SHEET_REQUIRED_DECISION_MISSING"]);
      }
      for (const key of r.lists ?? []) {
        const withoutList = mutate(base, (s) => { delete policyOf(s, r.subject as string).payload.lists?.[key]; });
        expect(codesOfBuilding(withoutList)).toEqual(["SHEET_REQUIRED_DECISION_MISSING"]);
      }
    }
  });
});

describe("fail closed", () => {
  it("with no decision pack active a gate throws, and the orchestrator does not turn that into a FLAG", () => {
    const evidence = makeEvidence();
    const graph = connectedComposition();
    // a fresh module registry has no process-wide default pack (tests/setup/pack-setup.ts installs it only in the main one)
    jest.isolateModules(() => {
      const gates = require("../../../chinese-aesthetic/anti-pattern/gates/dead-void");
      const runner = require("../../../chinese-aesthetic/anti-pattern/anti-pattern-gate");
      expect(() => gates.detectDeadVoid({ evidence, graph })).toThrow(/no AestheticConstraintSheet decision pack is active/);
      expect(() => runner.runAntiPatternGate(evidence, graph)).toThrow(/no AestheticConstraintSheet decision pack is active/);
    });
  });

  it("a pack that lacks a gate's decision makes the orchestrator throw MissingDecisionError, not report a FLAG", () => {
    const pack = packOfEdited((s) => {
      s.constraints = s.constraints.filter((c) => !(c.kind === "ANTI_PATTERN_THRESHOLD" && c.payload.subject === "dead-void"));
    }, []); // built without the manifest on purpose: the point is what the gate does at run time
    expect(() => withDecisionPack(pack, () => runAntiPatternGate(makeEvidence(), connectedComposition()))).toThrow(MissingDecisionError);
  });

  it("a gate-internal failure that is not a decision-pack failure is still reported as a FLAG (as before)", () => {
    const broken = { ...connectedComposition(), nodes: undefined } as unknown as AestheticRelationshipGraph;
    const report = withDecisionPack(defaultGatePack(), () => runAntiPatternGate(makeEvidence(), broken));
    const errors = report.gateResults.filter((r) => r.method === "gate-execution-error");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every((r) => r.verdict === "FLAG")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ADR-0001
// ---------------------------------------------------------------------------

describe("ADR-0001: the dead-void candidate trigger is a policy decision of its own, not a void_ratio band", () => {
  const periods = ["TANG", "SONG", "MING"] as const;

  it("does not move with the period while the void_ratio period band does", () => {
    const triggers = periods.map((p) => gatePolicy("dead-void", defaultPackFor(p)).num("candidate_void_ratio_above"));
    const bandTops = periods.map((p) => defaultPackFor(p).periodBand("scene.composition.negativeSpaceRatio")?.max);
    expect(new Set(triggers).size).toBe(1);
    expect(new Set(bandTops).size).toBeGreaterThan(1);
  });

  it("is an authored literal (no band derivation) with the void-solid guideline and ADR-0001 in its provenance", () => {
    const c = policyOf(defaultGatePack().sheet as AestheticConstraintSheet, "dead-void");
    expect(c.provenance.derivation).toBeUndefined();
    expect(c.provenance.sources.map((s) => s.source_id)).toContain("SRC-ADR-0001");
    expect(c.provenance.sources.some((s) => s.kind === "guideline" && s.ref.startsWith("guidelines/void-solid.md"))).toBe(true);
    expect(Object.keys(c.payload.params)).toContain("candidate_void_ratio_above");
  });
});
