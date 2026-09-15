# Diagnostic Asset Registry — 22-Image E2E Test

**Classification**: DIAGNOSTIC / CANDIDATE ASSETS — **NOT GOLDEN CASES**  
**Registry Version**: 1.0.0  
**Created**: 2026-09-16  
**Source**: DESIGN-COMPILER E2E Skill Compatibility Test (22 images)

---

## 🔒 HARD BOUNDARY — READ BEFORE USE

```
22 images
   ↓
Diagnostic / Candidate Asset
   ↓
NEVER automatically promote
   ↓
Golden Case
```

**All assets in this registry are diagnostic or candidate assets. They are NOT golden cases.**

Promotion to golden case requires ALL of:
1. Explicit architectural decision (not automatic)
2. Phase 2.2 Observable Evidence physical validation
3. Phase 2.4 Anti-Pattern Gate pass
4. Phase 2.6 Evidence Purity Audit pass
5. Branch: `feature/chinese-aesthetic-foundation` (NOT step8 sealed line)

**Under no circumstances shall these assets be copied into `tests/golden-cases/` without completing the full promotion path.**

---

## Directory Structure

```
diagnostic-assets/
├── DIAGNOSTIC-ASSET-MANIFEST.json          # Master registry: all 22 assets
├── README.md                                 # This file
│
├── candidate-cases/
│   └── structural-reference/
│       └── STRUCTURAL-REFERENCE-CANDIDATES.json  # 2 candidates (DIAG-003, DIAG-005)
│
├── reference-prompts/
│   └── (English prompts extracted from Group B watermarked cards)
│
└── evidence/
    └── diagnostic-anti-patterns/
        ├── ANTI-PATTERN-DIAGNOSTIC-REPORT.json   # 4 anti-pattern findings
        ├── red-sun-template/                       # AP-RED-SUN-001
        ├── mechanical-aerial-composition/          # AP-AERIAL-001
        └── ai-plastic-highlight/                   # AP-PLASTIC-001
```

---

## Asset Groups

### Group A: Pure Artwork (11 images, 1632×2912, no watermark)

| ID | URL | Score | Classification |
|---|---|---|---|
| DIAG-001 | [link](https://aka.doubaocdn.com/s/XVCYOnqgbm) | — | Diagnostic |
| DIAG-002 | [link](https://aka.doubaocdn.com/s/KROEvJLtJ1) | — | Diagnostic |
| DIAG-003 | [link](https://aka.doubaocdn.com/s/6SPcUeENbw) | 15/20 | **Candidate: Structural Reference** |
| DIAG-004 | [link](https://aka.doubaocdn.com/s/fL21QNonxT) | — | Diagnostic |
| DIAG-005 | [link](https://aka.doubaocdn.com/s/XYghc5RVbV) | 15/20 | **Candidate: Structural Reference** |
| DIAG-006 | [link](https://aka.doubaocdn.com/s/uVyBGuTHQW) | — | Diagnostic |
| DIAG-007 | [link](https://aka.doubaocdn.com/s/HYU1PH36VP) | — | Diagnostic |
| DIAG-008 | [link](https://aka.doubaocdn.com/s/24yqZknUba) | — | Diagnostic |
| DIAG-009 | [link](https://aka.doubaocdn.com/s/OiT9O0raek) | — | Diagnostic |
| DIAG-010 | [link](https://aka.doubaocdn.com/s/9ET8fm7TFG) | — | Diagnostic |
| DIAG-011 | [link](https://aka.doubaocdn.com/s/HiTmrg95JQ) | — | Diagnostic |

### Group B: Prompt Test Cards (11 images, 1440×1920, © IVAN CHIU watermark)

| ID | URL | Classification | Action |
|---|---|---|---|
| DIAG-012 ~ DIAG-022 | (see manifest) | Reference Prompt Only | Extract English prompts only; images NOT usable as primary assets |

---

## Key Diagnostic Findings

### Aesthetic Evaluation (7 representative images)

- **Average score**: 13.1 / 20
- **All in decorative layer** (10–15): none reached structural layer (≥16)
- **Strongest dimension**: spatial order / negative space (1.71)
- **Weakest dimension**: temporal sense / patina (0.57)

### Anti-Patterns Detected

| ID | Pattern | Occurrence | Severity |
|---|---|---|---|
| AP-RED-SUN-001 | Vermilion circular sun template | 9/11 Group A | HIGH |
| AP-AERIAL-001 | Mechanical aerial composition | 7/11 Group A | MEDIUM |
| AP-PLASTIC-001 | AI plastic highlight response | multiple | MEDIUM |
| AP-TEMPORAL-001 | Systemic temporal sterility | 22/22 ALL | HIGH |

**Important**: These are diagnostic findings, NOT machine rejection rules. Phase 2.4 Anti-Pattern Gate must be derived from Phase 1 Anti-Pattern Grammar + Phase 2 Observable Evidence.

---

## Structural Reference Candidates

Two images (DIAG-003, DIAG-005) scored 15/20, the upper bound of the decorative layer. They are registered as **structural reference candidates** because they exhibit the strongest spatial hierarchy characteristics among the 22 samples.

**They are NOT golden cases.** Both still:
- Score below the structural layer threshold (15 < 16)
- Contain template motifs (red sun)
- Lack temporal patina evidence

See `candidate-cases/structural-reference/STRUCTURAL-REFERENCE-CANDIDATES.json` for details.

---

## Relationship to Phase Roadmap

```
Phase 2.2 Physical Evidence Extractor ✅ COMPLETE @ 35d13e9
         ↓
Diagnostic Asset Registration ← CURRENT
         ↓
Phase 2.3 Relationship Graph
         ↓
Phase 2.4 Anti-Pattern Gate (uses diagnostic findings as input)
         ↓
Phase 2.5 Remove 14 Hardcoded Proxies
         ↓
Phase 2.6 Evidence Purity Audit
         ↓
Phase 2 COMPLETE → Candidate promotion evaluation
```

---

## Branch Isolation

This registry lives on `feature/chinese-aesthetic-foundation @ 35d13e9`.

It must **NOT** be merged into `feature/step8-contract-provenance-hardening` (which contains sealed Step 8 / PBR / Golden Case Matrix work). The two branches serve different sealed domains and must remain isolated.
