/**
 * anti-cliche-gate tests
 *
 * Unit coverage for every G2.5 anti-cliche rule (≥1 violation + ≥1 compliance
 * case each), the enabled/disabled config switch, and a pipeline-integration
 * style check that the gate returns a structured, vetoable result on a realistic
 * post-G2 ValidatedDesignIR.
 *
 * We build minimal-but-type-correct ValidatedSceneGraph fixtures by hand so the
 * tests do not depend on the full sheet adapter.
 */

import { AestheticGate, loadAntiClicheConfig } from "../../aesthetic-integration/anti-cliche-gate";
import {
  checkCalligraphyCliche,
  checkDeadCenterStacking,
  checkDominantSaturation,
  checkFontFamilyCount,
  checkForbiddenPalette,
  checkNegativeSpaceSuffocation,
  checkRedGreenCliché,
  type AntiClicheConfig,
} from "../../aesthetic-integration/anti-cliche-rules";
import type { ValidatedEstimatedParameter, ValidatedSceneGraph } from "../../compiler-core/contracts";

// ── Fixture builder ────────────────────────────────────────────────────────

function p<T>(value: T): ValidatedEstimatedParameter<T> {
  return {
    value,
    unit: "scalar",
    confidence: 0.9,
    evidence: [],
    source: "grammar-rule",
    status: "grammar-derived",
  };
}

/** Build a compliant baseline scene graph, then mutate the fields under test. */
function makeScene(overrides: Partial<{
  dominant: string;
  secondary: string;
  accent: string;
  focalPoint: [number, number];
  symmetry: number;
  negativeSpaceRatio: number;
}> = {}): ValidatedSceneGraph {
  return {
    composition: {
      focalPoint: p(overrides.focalPoint ?? [0.62, 0.38]),
      negativeSpaceRatio: p(overrides.negativeSpaceRatio ?? 0.48),
      depthLayerCount: p(3),
      symmetry: p(overrides.symmetry ?? 0.8),
    },
    camera: {
      fov: p(35),
      shotSize: p("medium"),
      angle: p(0),
      height: p(1.6),
    },
    lighting: {
      keyLight: {
        azimuth: p(0),
        elevation: p(78),
        colorTemp: p(5600),
        intensity: p(0.9),
        softness: p(0.7),
      },
      ambientRatio: p(0.3),
      rimLightPresent: p(false),
    },
    materials: [
      {
        role: "dominant",
        baseType: p("aged-paper-wood"),
        roughness: p(0.72),
        metalness: p(0.04),
        wear: p(0.32),
      },
    ],
    color: {
      dominant: p(overrides.dominant ?? "#EDEAE4"), // moon-white, low sat
      secondary: p(overrides.secondary ?? "#2C3E50"), // dai-blue
      accent: p(overrides.accent ?? "#B8860B"), // matte gold
      contrastRatio: p(4.5),
      temperatureBias: p(0.05),
    },
  };
}

const cfg: AntiClicheConfig = loadAntiClicheConfig();

// ── Category 1: Color cliches ─────────────────────────────────────────────

describe("AC-COLOR-001 forbidden palette", () => {
  test("violation: pure red #FF0000 as dominant is rejected", () => {
    const v = checkForbiddenPalette(makeScene({ dominant: "#FF0000" }), cfg);
    expect(v).toHaveLength(1);
    expect(v[0].ruleId).toBe("AC-COLOR-001");
    expect(v[0].location).toBe("/color/dominant/value");
    expect(v[0].suggestion).toMatch(/zhusha|cinnabar/i);
  });

  test("compliance: muted moon-white / dai-blue / matte-gold passes", () => {
    expect(checkForbiddenPalette(makeScene(), cfg)).toHaveLength(0);
  });
});

describe("AC-COLOR-002 pure red + pure green", () => {
  test("violation: #FF0000 dominant + #00FF00 secondary", () => {
    const v = checkRedGreenCliché(makeScene({ dominant: "#FF0000", secondary: "#00FF00" }), cfg);
    expect(v).toHaveLength(1);
    expect(v[0].ruleId).toBe("AC-COLOR-002");
    expect(v[0].evidence.redRoles).toContain("dominant");
    expect(v[0].evidence.greenRoles).toContain("secondary");
  });

  test("compliance: muted analogous palette passes", () => {
    expect(checkRedGreenCliché(makeScene(), cfg)).toHaveLength(0);
  });
});

describe("AC-COLOR-003 over-saturated dominant", () => {
  test("violation: saturated #FF3B30 dominant", () => {
    const v = checkDominantSaturation(makeScene({ dominant: "#FF3B30" }), cfg);
    expect(v).toHaveLength(1);
    expect(v[0].ruleId).toBe("AC-COLOR-003");
  });

  test("compliance: muted #EDEAE4 dominant passes", () => {
    expect(checkDominantSaturation(makeScene(), cfg)).toHaveLength(0);
  });
});

// ── Category 2: Layout cliches ────────────────────────────────────────────

describe("AC-LAYOUT-001 dead-center stacking", () => {
  test("violation: focal point dead-center with high symmetry", () => {
    const v = checkDeadCenterStacking(
      makeScene({ focalPoint: [0.5, 0.5], symmetry: 0.92 }),
      cfg,
    );
    expect(v).toHaveLength(1);
    expect(v[0].ruleId).toBe("AC-LAYOUT-001");
    expect(v[0].location).toBe("/composition/focalPoint/value");
  });

  test("compliance: golden-ratio focal point passes", () => {
    expect(checkDeadCenterStacking(makeScene(), cfg)).toHaveLength(0);
  });
});

describe("AC-LAYOUT-002 negative-space suffocation", () => {
  test("violation: negative space 0.15 (< 0.22 floor)", () => {
    const v = checkNegativeSpaceSuffocation(makeScene({ negativeSpaceRatio: 0.15 }), cfg);
    expect(v).toHaveLength(1);
    expect(v[0].ruleId).toBe("AC-LAYOUT-002");
  });

  test("compliance: negative space 0.48 passes", () => {
    expect(checkNegativeSpaceSuffocation(makeScene({ negativeSpaceRatio: 0.48 }), cfg)).toHaveLength(0);
  });
});

// ── Category 3: Typography cliches (context-driven) ───────────────────────

describe("AC-TYPE-001 too many font families", () => {
  test("violation: 4 families mixed", () => {
    const v = checkFontFamilyCount(makeScene(), cfg, {
      typography: { families: ["Song", "Hei", "Kai", "Western-Grotesk"] },
    });
    expect(v).toHaveLength(1);
    expect(v[0].ruleId).toBe("AC-TYPE-001");
  });

  test("compliance: 2 families pass; absent context also passes", () => {
    expect(
      checkFontFamilyCount(makeScene(), cfg, { typography: { families: ["Song", "Hei"] } }),
    ).toHaveLength(0);
    expect(checkFontFamilyCount(makeScene(), cfg, undefined)).toHaveLength(0);
  });
});

describe("AC-TYPE-002 calligraphy cliche", () => {
  test("violation: Maobi brush face used as typeface", () => {
    const v = checkCalligraphyCliche(makeScene(), cfg, {
      typography: { families: ["Maobi Brush Script", "Song Serif"] },
    });
    expect(v).toHaveLength(1);
    expect(v[0].ruleId).toBe("AC-TYPE-002");
  });

  test("compliance: serif + sans passes", () => {
    const v = checkCalligraphyCliche(makeScene(), cfg, {
      typography: { families: ["Song Serif", "Hei Sans"] },
    });
    expect(v).toHaveLength(0);
  });
});

// ── Config switch ─────────────────────────────────────────────────────────

describe("AestheticGate enable/disable switch", () => {
  test("enabled gate vetoes a forbidden-palette design", () => {
    const gate = new AestheticGate(cfg);
    expect(gate.enabled).toBe(true);
    // Build a minimal ValidatedDesignIR wrapping the offending scene.
    const scene = makeScene({ dominant: "#FF0000" });
    const ir = { validated: scene } as never;
    const result = gate.check(ir);
    expect(result.passed).toBe(false);
    expect(result.violations.some((x) => x.ruleId === "AC-COLOR-001")).toBe(true);
  });

  test("disabled gate always passes even when cliches are present", () => {
    const offCfg: AntiClicheConfig = { ...cfg, enabled: false };
    const gate = new AestheticGate(offCfg);
    expect(gate.enabled).toBe(false);
    const scene = makeScene({ dominant: "#FF0000", focalPoint: [0.5, 0.5], symmetry: 0.99 });
    const ir = { validated: scene } as never;
    const result = gate.check(ir);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});

// ── Boundary: combined / nested violations ────────────────────────────────

describe("Boundary: combined violations", () => {
  test("a doubly-bad design collects all violations (color + layout)", () => {
    const gate = new AestheticGate(cfg);
    const scene = makeScene({
      dominant: "#FF0000",
      secondary: "#00FF00",
      focalPoint: [0.5, 0.5],
      symmetry: 0.99,
      negativeSpaceRatio: 0.1,
    });
    const ir = { validated: scene } as never;
    const result = gate.check(ir, { typography: { families: ["Maobi", "Song", "Hei", "Kai"] } });

    expect(result.passed).toBe(false);
    const ids = result.violations.map((v) => v.ruleId).sort();
    expect(ids).toEqual(
      expect.arrayContaining([
        "AC-COLOR-001",
        "AC-COLOR-002",
        "AC-LAYOUT-001",
        "AC-LAYOUT-002",
        "AC-TYPE-001",
      ]),
    );
    // Every violation carries an actionable suggestion + JSON-pointer location.
    for (const v of result.violations) {
      expect(v.severity).toBe("P0_HARD");
      expect(v.location).toMatch(/^\//);
      expect(v.suggestion.length).toBeGreaterThan(0);
    }
  });
});
