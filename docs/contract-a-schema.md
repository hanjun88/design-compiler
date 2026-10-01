# Contract A Schema — AestheticConstraintSheet → CangjieRawDesignIR

> **Status**: Authoritative contract document.
> **Scope**: Defines the shared conversion contract between the CAS engine
> (AestheticConstraintSheet producer) and the DC compiler pipeline
> (CangjieRawDesignIR consumer).
> **Branch alignment**: DC `feat/aesthetic-integration` · CAS `feat/frontend-playbook-v2`.

---

## 1. Contract definition

**Contract A** is the deterministic, hash-stable conversion that turns an
`AestheticConstraintSheet` (the sole output of the CAS aesthetic engine) into a
`CangjieRawDesignIR` ready to be fed into the DC `normalizeIntent()` / G1 data gate.

```
AestheticConstraintSheet  ──[Contract A]──▶  CangjieRawDesignIR
  (JSON, CAS-owned)                            (flattened parameters[] + constraints[], DC-owned)
```

Two independent implementations exist and **must stay in lock-step on the path
SET and the constraints shape**:

| Side | File | Role |
|------|------|------|
| CAS | `modules/frontend/runtime/sheet-to-cangjie.ts` | Production producer; runs inside the CAS runtime. Emits 21 params. |
| DC  | `aesthetic-integration/aesthetic-sheet-adapter.ts` | Independent DC-side port; used by the DC aesthetic pipeline runner. Emits 24 params (superset — grammar rules need 3 extra fields). |

Both implementations are pure functions: **same sheet + same caller-supplied
timestamp → byte-identical parameter serialization** (1000× hash stability).
Timestamps are **always caller-supplied**; `new Date()` is forbidden.

---

## 2. Path convention — node-level, no `/value` suffix

All `parameters[].path` and all `constraints[].targetPath` are **node-level
JSON Pointers** pointing at the parameter node itself:

```
✅ "/color/dominant"
✅ "/lighting/keyLight/azimuth"
❌ "/color/dominant/value"        ← legacy CAS form, retired
❌ "/lighting/keyLight/azimuth/value"
```

This matches the DC `compiler-intent/pointer-map.ts` `POINTER_MAP` exactly.
`constraints[].targetPath` follows the **same** node-level convention — the
previous DC adapter bug (``${targetPath}/value``) has been fixed.

---

## 3. Complete parameter path table (24 paths)

Source of truth: `compiler-intent/pointer-map.ts` `POINTER_MAP`.
Columns: confidence floor used by both adapters; `G1` = member of the 7-path
CAS-side required set; `DC-only` = emitted by DC adapter but not by CAS
(grammar-rule derived).

### 3.1 Color (5)

| # | Path | Unit | Value (derivation) | Conf | G1 | Source |
|---|------|------|--------------------|------|----|--------|
| 1 | `/color/dominant` | hex | palette[dominant].hex | 0.90 | ✅ | `colorSystem.palette[dominant]` |
| 2 | `/color/secondary` | hex | palette[secondary].hex | 0.90 | — | `colorSystem.palette[secondary]` |
| 3 | `/color/accent` | hex | palette[accent].hex | 0.90 | — | `colorSystem.palette[accent]` |
| 4 | `/color/contrastRatio` | ratio | `4.5` (WCAG AA floor fallback) | 0.80 | — | Conservative fallback |
| 5 | `/color/temperatureBias` | scalar | `dawn=0.15, noon=0, dusk=0.2, night=-0.1, cloudy=0.05` | 0.70 | — | `lighting.timeSetting` (DC-only) |

### 3.2 Composition (4)

| # | Path | Unit | Value (derivation) | Conf | G1 | Source |
|---|------|------|--------------------|------|----|--------|
| 6 | `/composition/negativeSpaceRatio` | ratio | `void/(void+solid)` from `proportion.voidSolidRatio` | 0.88 | ✅ | `proportion.voidSolidRatio` |
| 7 | `/composition/symmetry` | ratio | `strict→1, offset→0.5, hidden→0.15` | 0.85 | — | `spatial.axis` |
| 8 | `/composition/depthLayerCount` | scalar | `spatial.hierarchyLevelsMin` | 0.80 | — | `spatial.hierarchyLevelsMin` |
| 9 | `/composition/focalPoint` | vector2 | `[0.5, 0.5]` (single focal point) | 0.85 | ✅ | `proportion.focalPointsMax=1` |

### 3.3 Lighting (7)

| # | Path | Unit | Value (derivation) | Conf | G1 | Source |
|---|------|------|--------------------|------|----|--------|
| 10 | `/lighting/keyLight/azimuth` | degrees | `skylight=0, leaked=45, side=80, bounced=180, moonlight=315` | 0.85 | ✅ | `lighting.primarySource` |
| 11 | `/lighting/keyLight/elevation` | degrees | `skylight=78, leaked=30, side=40, bounced=18, moonlight=60` | 0.85 | ✅ | `lighting.primarySource` |
| 12 | `/lighting/keyLight/colorTemp` | kelvin | `dawn=4200, noon=6500, dusk=3200, night=7200, cloudy=5600` | 0.82 | — | `lighting.timeSetting` |
| 13 | `/lighting/keyLight/intensity` | scalar | `1.0` (fallback) | 0.80 | — | Conservative fallback |
| 14 | `/lighting/keyLight/softness` | scalar | `skylight=0.7, leaked=0.5, side=0.4, bounced=0.8, moonlight=0.65` | 0.75 | — | `lighting.primarySource` (DC-only) |
| 15 | `/lighting/ambientRatio` | ratio | `dark/(light+dark)` from `lighting.lightDarkRatio` | 0.80 | — | `lighting.lightDarkRatio` |
| 16 | `/lighting/rimLightPresent` | boolean | `false` (fallback) | 0.80 | — | Conservative fallback (DC-only) |

### 3.4 Materials (4)

| # | Path | Unit | Value (derivation) | Conf | G1 | Source |
|---|------|------|--------------------|------|----|--------|
| 17 | `/materials/0/baseType` | scalar (string) | mood→`{aged-paper-wood, raw-plaster-wood, lacquered-wood, dark-lacquer-bronze, mist-silk-stone}` | 0.85 | ✅ | `mood` |
| 18 | `/materials/0/roughness` | scalar | mood PBR table | 0.80 | — | `mood` |
| 19 | `/materials/0/metalness` | scalar | mood PBR table | 0.80 | — | `mood` |
| 20 | `/materials/0/wear` | scalar | mood PBR table | 0.80 | — | `mood` |

### 3.5 Camera (4)

| # | Path | Unit | Value (derivation) | Conf | G1 | Source |
|---|------|------|--------------------|------|----|--------|
| 21 | `/camera/fov` | degrees | `35` (default) | 0.85 | ✅ | Camera default |
| 22 | `/camera/shotSize` | scalar (string) | `"medium"` | 0.80 | — | Camera default |
| 23 | `/camera/angle` | degrees | `0` (level) | 0.80 | — | Camera default |
| 24 | `/camera/height` | scalar | `1.6` m (eye level) | 0.80 | — | Camera default |

**Totals**: color 5 + composition 4 + lighting 7 + materials 4 + camera 4 = **24 paths**.

---

## 4. Constraints convention

Violations from `sheet.violations[]` are translated into `CangjieConstraint[]`
plus per-parameter range patches:

- **P0 violation** → `range.fatalBelow = 0.0` **and** a `threshold` constraint:
  ```ts
  {
    constraintId: `VC-<ruleId>`,
    type: "threshold",
    targetPath: "<node-level path>",   // ← NO /value suffix
    condition: { operator: "not-in", value: sheet.colorSystem.hardFailHex },
    assertionId: ruleId,
  }
  ```
- **P1 violation** → `range.hard = [0.3, 0.7]` on the target parameter (no constraint row).

The `VIOLATION_RULE_PATH` map (identical on both sides) routes rule ids to
target paths:

```
saturation / pure-red / main-area  → /color/dominant
bright-gold / accent-area          → /color/accent
pure-black                         → /color/secondary
void-solid                         → /composition/negativeSpaceRatio
symmetry                           → /composition/symmetry
light-ratio                        → /lighting/ambientRatio
(unmapped)                         → /composition/negativeSpaceRatio  (default)
```

---

## 5. G1 requiredPaths — 7-path hard gate (CAS-side only)

The CAS adapter throws `BLOCKED_DATA` when any of the following 7 paths is
missing or has `confidence < 0.85` / `calibration.status !== "PRODUCTION"`:

```
1. /composition/focalPoint
2. /composition/negativeSpaceRatio
3. /camera/fov
4. /lighting/keyLight/azimuth
5. /lighting/keyLight/elevation
6. /color/dominant
7. /materials/0/baseType
```

The DC adapter **does not** perform this check itself; it relies on the DC
pipeline runner's downstream G1 data gate (`compiler-intent/confidence-isolator.ts`).
This asymmetry is intentional: DC normalizes first and then gates; CAS gates
before returning.

---

## 6. Known implementation differences (intentional)

| Aspect | CAS (`sheet-to-cangjie.ts`) | DC (`aesthetic-sheet-adapter.ts`) | Rationale |
|--------|------------------------------|-----------------------------------|-----------|
| `paramId` field | Absent (slim envelope) | Present, auto-incremented `aes-001…` | DC core IR requires a stable per-param id for patch targeting. Counter resets to 0 at function entry for deterministic output. |
| `evidence[]` field | Present (`[dimension]`) | Absent | CAS provenance model tracks evidence chains; DC uses `source`/`calibration` objects instead. |
| `calibration.method` | `"skill-10d-engine"` | `"expert-calibrated"` | Different tooling provenance; both map to `status: PRODUCTION`. |
| `source.type` | `"expert-judgment"` | `"expert-judgment"` | **Identical** — this is the contract. |
| `source.ref` | `chinese-aesthetic-skill:<dimension>` | `chinese-aesthetic-skill:<dimension>` | **Identical**. |
| Param count | 21 | 24 (+`softness`, `temperatureBias`, `rimLightPresent`) | DC grammar-rules.json consumes these 3 fields; CAS does not yet emit them. |
| G1 requiredPaths check | Throws `BLOCKED_DATA` inline | Deferred to pipeline runner | Architectural split described in §5. |
| Returns | `{ cangjieIR, advisorRulePack, unmappedDimensions, aestheticScore }` | `{ cangjieIR, aestheticScore }` | DC has no advisor rule pack (rules live in DC grammar engine). |

**The contract is the path SET + the constraints shape.** The envelope fields
(`paramId`, `evidence`, `calibration.method`) are local ABI choices and must not
be "unified" across sides — doing so would break the FROZEN DC ABI on one side
or the CAS runtime on the other.

---

## 7. Derivation tables (shared enumerations)

Both adapters maintain identical copies of these tables (independent ports):

```ts
// primarySource → azimuth / elevation (deg)
{ skylight: {azimuth:0, elevation:78}, leaked:{azimuth:45,elevation:30},
  side:{azimuth:80,elevation:40}, bounced:{azimuth:180,elevation:18},
  moonlight:{azimuth:315,elevation:60} }

// timeSetting → colorTemp (kelvin)
{ dawn:4200, noon:6500, dusk:3200, night:7200, cloudy:5600 }

// primarySource → softness (DC-only, 0=hard 1=very soft)
{ skylight:0.7, leaked:0.5, side:0.4, bounced:0.8, moonlight:0.65 }

// timeSetting → temperatureBias (DC-only, -1=cool +1=warm)
{ dawn:0.15, noon:0, dusk:0.2, night:-0.1, cloudy:0.05 }

// mood → material PBR
{ "song-elegant":{baseType:"aged-paper-wood",roughness:0.72,metalness:0.04,wear:0.32},
  "chan-zen":{baseType:"raw-plaster-wood",roughness:0.85,metalness:0.02,wear:0.45},
  "tang-tang":{baseType:"lacquered-wood",roughness:0.55,metalness:0.12,wear:0.2},
  "night-feast":{baseType:"dark-lacquer-bronze",roughness:0.48,metalness:0.22,wear:0.28},
  "misty-blue":{baseType:"mist-silk-stone",roughness:0.8,metalness:0.03,wear:0.38} }
```

---

## 8. Hard constraints (do not violate)

- Timestamps are **caller-supplied** (`opts.capturedAt`); `new Date()` is banned.
- No `/value` suffix on any path or targetPath.
- `aestheticScore` is metadata only — **never** written into any parameter's `confidence`.
- DC `paramIdCounter` resets to 0 at function entry (deterministic design — do not refactor).
- This document does **not** cover `grammar-rules.json` (owned by a separate sub-agent),
  `patch-engine.ts`, or `hash-policy.ts`.
