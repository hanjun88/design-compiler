/**
 * aesthetic-sheet-adapter.ts
 *
 * DC-side independent adapter: AestheticConstraintSheet JSON → CangjieRawDesignIR.
 *
 * This module is the DC-side reimplementation of CAS contract A (sheet-to-cangjie).
 * It does NOT import any CAS code; the conversion logic is independently ported
 * to operate on DC's native CangjieRawDesignIR type (compiler-intent/types.ts).
 *
 * Key adaptations from CAS:
 * - Both sides emit node-level JSON Pointer paths (e.g. "/color/dominant"),
 *   WITHOUT a trailing "/value" suffix. The legacy CAS "/color/dominant/value"
 *   form has been retired on both sides; constraints.targetPath follows the
 *   same node-level convention.
 * - CAS uses a slim CangjieEstimatedParameter shape (evidence[] array, no paramId);
 *   DC requires paramId and richer source/calibration/provenance fields.
 *   The adapter fills these in. This structural divergence is intentional and
 *   documented in docs/contract-a-schema.md — the shared contract is the path
 *   SET and the constraints shape, not the parameter envelope.
 * - Time stamps are caller-supplied (deterministic), never new Date().
 *
 * @module aesthetic-integration/aesthetic-sheet-adapter
 */

import type {
  CangjieRawDesignIR,
  CangjieEstimatedParameter,
  CangjieParameterSource,
  CangjieParameterCalibration,
  CangjieConstraint,
  CangjieSourceType,
  CangjieCalibrationMethod,
  CangjieCalibrationStatus,
} from "../compiler-intent/types";

// ============================================================================
// AestheticConstraintSheet — DC-side local type mirror (read-only from CAS)
// ============================================================================

/** Color role in the jun-chen-zuo-shi palette */
export type SheetColorRole = "dominant" | "secondary" | "accent" | "shadow";

/** A single color swatch in the sheet palette */
export interface SheetColorEntry {
  role: SheetColorRole;
  name: string;
  hex: string;
  hsl?: string;
  areaPct: number;
  usage: string;
}

/** An aesthetic violation detected by the CAS engine */
export interface SheetViolation {
  ruleId: string;
  severity: "P0" | "P1";
  message: string;
}

/** A structured dimension adjudication item */
export interface SheetStructuralDimension {
  id: string;
  weight: "primary" | "secondary" | "tertiary";
  hard?: string;
  soft?: string;
}

/**
 * AestheticConstraintSheet — the sole input artifact from the CAS engine.
 * This is a DC-side structural mirror; no runtime dependency on CAS.
 */
export interface AestheticConstraintSheet {
  sheetId: string;
  designBrief: string;
  mood: string;
  attributionStatement: string;
  structuralDimensions: SheetStructuralDimension[];
  colorSystem: {
    palette: SheetColorEntry[];
    saturationMax: number;
    hardFailHex: string[];
  };
  proportion: {
    baseModulePx: number;
    spacingScale: number[];
    voidSolidRatio: string;
    focalPointsMax: number;
    /**
     * Optional explicit negative-space-ratio (0..1) override. When present it is
     * emitted verbatim instead of deriving from `voidSolidRatio`. Lets upstream
     * sheets pin a precise composition value (used by the G2.5 layout-gate
     * fixtures — note G2 grammar still rescues values below its thresholds).
     */
    negativeSpaceRatio?: number;
  };
  spatial: {
    axis: "strict" | "offset" | "hidden";
    bays: number;
    hierarchyLevelsMin: number;
    /**
     * Optional explicit symmetry (0..1) override. When present it is emitted
     * verbatim instead of deriving symmetry from `axis`. Lets upstream sheets
     * pin a precise composition value (used by the G2.5 layout-gate fixtures).
     */
    symmetry?: number;
  };
  lighting: {
    primarySource: string;
    timeSetting: string;
    lightDarkRatio: string;
  };
  motion: {
    prototypes: string[];
    durationMs: [number, number];
    entryMode: string;
    hardFail: string[];
  };
  antiCliche: {
    scanned: boolean;
    hardFailHits: string[];
    forbidden: string[];
  };
  violations: SheetViolation[];
  /**
   * Font families actually used by the design. Forwarded to the G2.5
   * AestheticGate as `context.typography.families` so typography cliche rules
   * (AC-TYPE-001/002) can be enforced end-to-end. The scene graph itself does
   * not carry fonts, so this is the only evidenceable signal.
   */
  typographyFamilies?: string[];
  score: number;
}

// ============================================================================
// Adapter options and result
// ============================================================================

/**
 * Options for the sheet → Cangjie IR conversion.
 * All timestamps are caller-supplied for 1000× hash determinism.
 */
export interface AestheticSheetAdapterOptions {
  /** Explicit deterministic timestamp (ISO 8601). Required — never auto-generated. */
  capturedAt: string;
  /** IR identifier; defaults to `ir-<sheetId>` if omitted. */
  irId?: string;
  /** Distiller version (semver). Defaults to "1.0.0". */
  distillerVersion?: string;
  /**
   * Per-path confidence overrides (0–1). Keyed by the DC pointer-map path
   * (WITHOUT trailing "/value"). Used by tests to exercise G1 interception.
   */
  confidenceOverrides?: Record<string, number>;
  /**
   * Per-path calibration status overrides. Used by tests to force
   * EXPERIMENTAL calibration (which maps to "estimated" in core IR).
   */
  calibrationOverrides?: Record<string, CangjieCalibrationStatus>;
}

/** Result of the sheet → Cangjie IR conversion */
export interface AestheticSheetAdapterResult {
  /** The Cangjie-layer IR ready for normalizeIntent() */
  cangjieIR: CangjieRawDesignIR;
  /** Aesthetic score (0–100), metadata only — never written into parameter confidence */
  aestheticScore: number;
}

// ============================================================================
// Deterministic derivation tables (independently ported from CAS contract A)
// ============================================================================

/** primarySource → keyLight azimuth/elevation in degrees */
const LIGHT_SOURCE_ANGLES: Record<string, { azimuth: number; elevation: number }> = {
  skylight: { azimuth: 0, elevation: 78 },
  leaked: { azimuth: 45, elevation: 30 },
  side: { azimuth: 80, elevation: 40 },
  bounced: { azimuth: 180, elevation: 18 },
  moonlight: { azimuth: 315, elevation: 60 },
};

/** timeSetting → correlated color temperature in Kelvin */
const TIME_COLOR_TEMP: Record<string, number> = {
  dawn: 4200,
  noon: 6500,
  dusk: 3200,
  night: 7200,
  cloudy: 5600,
};

/**
 * primarySource → keyLight softness (0=hard, 1=very soft).
 * Skylight is diffuse (0.7); bounced light is the softest (0.8);
 * side light is the hardest directional source (0.4).
 */
const LIGHT_SOURCE_SOFTNESS: Record<string, number> = {
  skylight: 0.7,
  leaked: 0.5,
  side: 0.4,
  bounced: 0.8,
  moonlight: 0.65,
};

/**
 * timeSetting → color temperature bias (-1=very cool, +1=very warm, 0=neutral).
 * Noon / cloudy sit near neutral; dawn and dusk bias warm; night biases cool.
 */
const TIME_TEMP_BIAS: Record<string, number> = {
  dawn: 0.15,
  noon: 0,
  dusk: 0.2,
  night: -0.1,
  cloudy: 0.05,
};

/** mood → dominant material PBR descriptor */
const MOOD_MATERIAL: Record<string, { baseType: string; roughness: number; metalness: number; wear: number }> = {
  "song-elegant": { baseType: "aged-paper-wood", roughness: 0.72, metalness: 0.04, wear: 0.32 },
  "chan-zen": { baseType: "raw-plaster-wood", roughness: 0.85, metalness: 0.02, wear: 0.45 },
  "tang-tang": { baseType: "lacquered-wood", roughness: 0.55, metalness: 0.12, wear: 0.2 },
  "night-feast": { baseType: "dark-lacquer-bronze", roughness: 0.48, metalness: 0.22, wear: 0.28 },
  "misty-blue": { baseType: "mist-silk-stone", roughness: 0.8, metalness: 0.03, wear: 0.38 },
};

/** violation.ruleId → target Cangjie path (DC pointer-map path, no /value suffix) */
const VIOLATION_RULE_PATH: Record<string, string> = {
  saturation: "/color/dominant",
  "pure-red": "/color/dominant",
  "bright-gold": "/color/accent",
  "pure-black": "/color/secondary",
  "accent-area": "/color/accent",
  "main-area": "/color/dominant",
  "void-solid": "/composition/negativeSpaceRatio",
  symmetry: "/composition/symmetry",
  "light-ratio": "/lighting/ambientRatio",
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Parse a "7:5" ratio string into [a, b].
 * @throws if the string does not match the ratio format
 */
function parseRatioPair(ratio: string): [number, number] {
  const m = /^\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\s*$/.exec(ratio);
  if (!m) {
    throw new Error(`[aesthetic-adapter] Cannot parse ratio string: "${ratio}"`);
  }
  return [Number(m[1]), Number(m[2])];
}

/** Find a palette entry by role */
function pickColor(palette: SheetColorEntry[], role: SheetColorRole): SheetColorEntry {
  const found = palette.find((c) => c.role === role);
  if (!found) {
    throw new Error(`[aesthetic-adapter] Palette missing role: ${role}`);
  }
  return found;
}

/** Counter for generating unique paramIds */
let paramIdCounter = 0;

/**
 * Build a single Cangjie estimated parameter.
 *
 * @param dcPath   DC pointer-map path (WITHOUT trailing /value), e.g. "/color/dominant"
 * @param value    The estimated value
 * @param unit     Physical unit
 * @param baseConfidence  Base confidence from the aesthetic engine
 * @param dimension Canonical dimension id (for provenance traceability)
 * @param opts     Adapter options (confidence overrides, calibration overrides)
 * @param extra    Optional extra fields (range, focalProtection, etc.)
 */
function makeCangjieParam(
  dcPath: string,
  value: unknown,
  unit: string,
  baseConfidence: number,
  dimension: string,
  opts: AestheticSheetAdapterOptions,
  extra?: Partial<CangjieEstimatedParameter>,
): CangjieEstimatedParameter {
  paramIdCounter += 1;
  const paramId = `aes-${String(paramIdCounter).padStart(3, "0")}`;

  // Apply confidence override if present
  const confidence = opts.confidenceOverrides?.[dcPath] ?? baseConfidence;

  // Apply calibration override if present
  const calStatus: CangjieCalibrationStatus =
    opts.calibrationOverrides?.[dcPath] ?? "PRODUCTION";

  const source: CangjieParameterSource = {
    type: "expert-judgment" as CangjieSourceType,
    ref: `chinese-aesthetic-skill:${dimension}`,
  };

  const calibration: CangjieParameterCalibration = {
    method: "expert-calibrated" as CangjieCalibrationMethod,
    status: calStatus,
  };

  return {
    paramId,
    path: dcPath,
    value,
    unit,
    confidence,
    source,
    calibration,
    ...extra,
  };
}

// ============================================================================
// Violations → Cangjie constraints + range patches
// ============================================================================

interface RangePatch {
  fatalBelow?: number;
  hard?: [number, number];
}

/**
 * Translate sheet violations into Cangjie constraints and per-parameter range patches.
 * P0 violations → fatalBelow + threshold constraint; P1 → hard range.
 */
function buildViolationArtifacts(
  sheet: AestheticConstraintSheet,
): { constraints: CangjieConstraint[]; rangePatches: Map<string, RangePatch> } {
  const constraints: CangjieConstraint[] = [];
  const rangePatches = new Map<string, RangePatch>();

  for (const v of sheet.violations) {
    const targetPath = VIOLATION_RULE_PATH[v.ruleId] ?? "/composition/negativeSpaceRatio";
    if (v.severity === "P0") {
      const existing = rangePatches.get(targetPath) ?? {};
      existing.fatalBelow = 0.0;
      rangePatches.set(targetPath, existing);
      constraints.push({
        constraintId: `VC-${v.ruleId}`,
        type: "threshold",
        // Node-level path (no /value suffix), matching the parameters[].path convention
        // and CAS contract A. Both rangePatches key and constraint.targetPath use targetPath.
        targetPath,
        condition: { operator: "not-in", value: sheet.colorSystem.hardFailHex },
        assertionId: v.ruleId,
      });
    } else {
      const existing = rangePatches.get(targetPath) ?? {};
      existing.hard = [0.3, 0.7];
      rangePatches.set(targetPath, existing);
    }
  }

  return { constraints, rangePatches };
}

// ============================================================================
// Main conversion entry
// ============================================================================

/**
 * Convert an AestheticConstraintSheet into a DC-native CangjieRawDesignIR.
 *
 * This is a pure deterministic function: same sheet + same options → same IR.
 * The output is ready to be fed into compiler-intent/normalizeIntent().
 *
 * @param sheet  The aesthetic constraint sheet from the CAS engine
 * @param opts   Conversion options (must include capturedAt for determinism)
 * @returns      CangjieRawDesignIR ready for the DC compiler pipeline
 * @throws       If required palette entries are missing or ratio strings are malformed
 */
export function sheetToCangjieIR(
  sheet: AestheticConstraintSheet,
  opts: AestheticSheetAdapterOptions,
): AestheticSheetAdapterResult {
  // Reset paramId counter for deterministic output
  paramIdCounter = 0;

  // Derive negative space ratio from void:solid proportion (overridable)
  const derivedNegativeSpace = ((): number => {
    if (typeof sheet.proportion.negativeSpaceRatio === "number") {
      return sheet.proportion.negativeSpaceRatio;
    }
    const [voidPart, solidPart] = parseRatioPair(sheet.proportion.voidSolidRatio);
    return Number((voidPart / (voidPart + solidPart)).toFixed(4));
  })();

  // Derive ambient ratio from light:dark ratio
  const [lightPart, darkPart] = parseRatioPair(sheet.lighting.lightDarkRatio);
  const ambientRatio = Number((darkPart / (lightPart + darkPart)).toFixed(4));

  // Resolve palette entries
  const dominant = pickColor(sheet.colorSystem.palette, "dominant");
  const secondary = pickColor(sheet.colorSystem.palette, "secondary");
  const accent = pickColor(sheet.colorSystem.palette, "accent");

  // Resolve light physics from sheet enums
  const angles = LIGHT_SOURCE_ANGLES[sheet.lighting.primarySource] ?? LIGHT_SOURCE_ANGLES.skylight;
  const colorTemp = TIME_COLOR_TEMP[sheet.lighting.timeSetting] ?? 5600;
  const softness = LIGHT_SOURCE_SOFTNESS[sheet.lighting.primarySource] ?? 0.6;
  const tempBias = TIME_TEMP_BIAS[sheet.lighting.timeSetting] ?? 0.05;

  // Resolve material PBR from mood
  const mat = MOOD_MATERIAL[sheet.mood] ?? MOOD_MATERIAL["song-elegant"];

  // Derive symmetry from spatial axis (overridable via sheet.spatial.symmetry)
  const derivedSymmetry =
    typeof sheet.spatial.symmetry === "number"
      ? sheet.spatial.symmetry
      : sheet.spatial.axis === "strict"
        ? 1
        : sheet.spatial.axis === "offset"
          ? 0.5
          : 0.15;

  const params: CangjieEstimatedParameter[] = [];

  // ── Color (5 entries) ──────────────────────────────────────────────
  params.push(makeCangjieParam("/color/dominant", dominant.hex, "hex", 0.90, "color", opts, {
    range: { preferred: [0.6, 0.7] },
  }));
  params.push(makeCangjieParam("/color/secondary", secondary.hex, "hex", 0.90, "color", opts));
  params.push(makeCangjieParam("/color/accent", accent.hex, "hex", 0.90, "color", opts, {
    range: { preferred: [0.02, 0.08] },
  }));
  // contrastRatio is a required pointer-map path; derive a conservative WCAG value
  params.push(makeCangjieParam("/color/contrastRatio", 4.5, "ratio", 0.80, "color", opts));
  // temperatureBias is required by grammar rules; derived from timeSetting
  params.push(makeCangjieParam("/color/temperatureBias", tempBias, "scalar", 0.70, "color", opts));

  // ── Composition (4 entries) ────────────────────────────────────────
  params.push(makeCangjieParam("/composition/negativeSpaceRatio", derivedNegativeSpace, "ratio", 0.88, "void-solid", opts, {
    range: { preferred: [0.42, 0.55], hard: [0.35, 0.42], fatalBelow: 0.3 },
  }));
  params.push(makeCangjieParam("/composition/symmetry", derivedSymmetry, "ratio", 0.85, "spatial-order", opts));
  params.push(makeCangjieParam("/composition/depthLayerCount", sheet.spatial.hierarchyLevelsMin, "scalar", 0.80, "architecture", opts));
  params.push(makeCangjieParam("/composition/focalPoint", [0.5, 0.5] as [number, number], "vector2", 0.85, "interaction", opts));

  // ── Lighting (7 entries, incl. intensity/softness/rimLightPresent required by grammar rules) ─
  params.push(makeCangjieParam("/lighting/keyLight/azimuth", angles.azimuth, "degrees", 0.85, "light", opts));
  params.push(makeCangjieParam("/lighting/keyLight/elevation", angles.elevation, "degrees", 0.85, "light", opts, {
    range: { hard: [20, 70] },
  }));
  params.push(makeCangjieParam("/lighting/keyLight/colorTemp", colorTemp, "kelvin", 0.82, "light", opts));
  params.push(makeCangjieParam("/lighting/keyLight/intensity", 1.0, "scalar", 0.80, "light", opts));
  params.push(makeCangjieParam("/lighting/keyLight/softness", softness, "scalar", 0.75, "light", opts));
  params.push(makeCangjieParam("/lighting/ambientRatio", ambientRatio, "ratio", 0.80, "light", opts));
  params.push(makeCangjieParam("/lighting/rimLightPresent", false, "boolean", 0.80, "light", opts));

  // ── Materials /materials/0/* (4 entries) ──────────────────────────
  params.push(makeCangjieParam("/materials/0/baseType", mat.baseType, "scalar", 0.85, "material", opts));
  params.push(makeCangjieParam("/materials/0/roughness", mat.roughness, "scalar", 0.80, "material", opts));
  params.push(makeCangjieParam("/materials/0/metalness", mat.metalness, "scalar", 0.80, "material", opts));
  params.push(makeCangjieParam("/materials/0/wear", mat.wear, "scalar", 0.80, "material", opts));

  // ── Camera (4 entries) ────────────────────────────────────────────
  params.push(makeCangjieParam("/camera/fov", 35, "degrees", 0.85, "spatial-order", opts));
  params.push(makeCangjieParam("/camera/shotSize", "medium", "scalar", 0.80, "spatial-order", opts));
  params.push(makeCangjieParam("/camera/angle", 0, "degrees", 0.80, "spatial-order", opts));
  params.push(makeCangjieParam("/camera/height", 1.6, "scalar", 0.80, "spatial-order", opts));

  // ── Violations → constraints + range patches ─────────────────────
  const { constraints, rangePatches } = buildViolationArtifacts(sheet);
  for (const p of params) {
    const patch = rangePatches.get(p.path);
    if (patch) {
      p.range = { ...(p.range ?? {}), ...patch };
    }
  }

  // ── Assemble CangjieRawDesignIR ───────────────────────────────────
  const cangjieIR: CangjieRawDesignIR = {
    irId: opts.irId ?? `ir-${sheet.sheetId}`,
    concept: {
      name: sheet.mood,
      ontologyPath: `/eastern-aesthetic/${sheet.mood}`,
    },
    intent: {
      statement: sheet.designBrief,
      heuristicIds: sheet.structuralDimensions.map((d) => d.id),
      priority: "P1",
    },
    parameters: params,
    constraints,
    provenance: {
      corpusSources: [
        {
          corpusId: `sheet:${sheet.sheetId}`,
          title: sheet.designBrief,
          type: "book",
          extractionMethod: "cangjie-ria",
        },
      ],
      distillationMethod: "aesthetic-sheet-adapter@1.0.0",
    },
    distillerVersion: opts.distillerVersion ?? "1.0.0",
    grammarVersion: "chinese-aesthetic@1.0.0",
    metadata: {
      createdAt: opts.capturedAt,
      createdBy: "aesthetic-integration-adapter",
      tags: [sheet.mood, `score:${sheet.score}`],
      sheetId: sheet.sheetId,
      aestheticScore: sheet.score,
    },
  };

  return {
    cangjieIR,
    aestheticScore: sheet.score,
  };
}
