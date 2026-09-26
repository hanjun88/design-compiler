/**
 * types.ts
 *
 * Shared types for the e2e-aesthetic demo framework.
 *
 * IMPORTANT — environment note:
 * The original DC monorepo (compiler-core/pipeline-runner.ts,
 * aesthetic-integration/aesthetic-pipeline-runner.ts) was unavailable in this
 * sandbox. The demo therefore defines its own minimal PipelineRunner port
 * (`src/pipeline/pipeline-types.ts`) backed by a clearly-labelled
 * `MockPipelineRunner`. The ONE real DC compilation stage it wires in is the
 * G2.5 AestheticGate (`aesthetic-integration/anti-cliche-gate.ts`), which runs
 * verbatim on every generated scene graph. When the full DC repo is restored,
 * swap `MockPipelineRunner` for the real `AestheticPipelineRunner` — the sheet
 * shape below is a structural mirror of the documented AestheticConstraintSheet.
 */

// ---------------------------------------------------------------------------
// Page content payloads (discriminated by scenario content kind)
// ---------------------------------------------------------------------------

export interface WorkItem { title: string; category: string; year: string; }
export interface ProductItem { name: string; price: string; tag: string; }

export interface SongLoginContent {
  heading: string; subheading: string; accountLabel: string;
  passwordLabel: string; submitText: string; footerNote: string;
}
export interface ZenPortfolioContent {
  author: string; nav: string[]; blurb: string; filters: string[]; works: WorkItem[];
}
export interface TangShopContent {
  brand: string; nav: string[]; heroTitle: string; heroSub: string; cta: string;
  products: ProductItem[];
}

export type PageContent =
  | { kind: "song-login"; data: SongLoginContent }
  | { kind: "zen-portfolio"; data: ZenPortfolioContent }
  | { kind: "tang-shop"; data: TangShopContent };

// ---------------------------------------------------------------------------
// AestheticConstraintSheet — structural mirror of the documented DC contract
// ---------------------------------------------------------------------------

export type SheetColorRole = "dominant" | "secondary" | "accent" | "shadow";
export interface SheetColorEntry { role: SheetColorRole; name: string; hex: string; areaPct: number; usage: string; }

export interface AestheticConstraintSheet {
  sheetId: string;
  designBrief: string;
  mood: string;
  attributionStatement: string;
  structuralDimensions: { id: string; weight: "primary" | "secondary" | "tertiary" }[];
  colorSystem: { palette: SheetColorEntry[]; saturationMax: number; hardFailHex: string[] };
  proportion: { baseModulePx: number; spacingScale: number[]; voidSolidRatio: string; focalPointsMax: number };
  spatial: { axis: "strict" | "offset" | "hidden"; bays: number; hierarchyLevelsMin: number };
  lighting: { primarySource: string; timeSetting: string; lightDarkRatio: string };
  motion: { prototypes: string[]; durationMs: [number, number]; entryMode: string; hardFail: string[] };
  antiCliche: { scanned: boolean; hardFailHits: string[]; forbidden: string[] };
  violations: { ruleId: string; severity: "P0" | "P1"; message: string }[];
  /** Font families actually used by the page (fed to the real gate context). */
  typographyFamilies: string[];
  score: number;
}

// ---------------------------------------------------------------------------
// Scenario + theme tokens
// ---------------------------------------------------------------------------

export interface ScenarioDefinition {
  id: string;
  title: string;
  brief: string;
  sheet: AestheticConstraintSheet;
  content: PageContent;
}

export interface ThemeTokens {
  mood: string;
  bg: string;      // validated dominant hex
  ink: string;     // validated secondary hex
  accent: string;  // validated accent hex
  shadow: string;  // shadow-role hex from the sheet
  symmetry: number;
  negativeSpaceRatio: number;
  voidSolidRatio: string;
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export interface AntiClicheReport {
  passed: boolean;
  hardFailHexFound: string[];
  forbiddenTokensFound: string[];
  bannedMotionHits: string[];
  contrastRatio: number;
  warnings: string[];
  /** Rule ids raised by the REAL DC AestheticGate on the scene graph. */
  gateViolations: string[];
}

export interface DimensionScore { name: string; score: number; weight: number; evidence: string; }
export interface FidelityReport { total: number; verdict: string; dimensions: DimensionScore[]; }

// ---------------------------------------------------------------------------
// E2E result
// ---------------------------------------------------------------------------

export interface E2EScenarioResult {
  scenario: ScenarioDefinition;
  /** Curated summary of the (mock) pipeline run + real gate outcome. */
  pipelineSummary: Record<string, unknown>;
  theme: ThemeTokens;
  html: string;
  audit: AntiClicheReport;
  fidelity: FidelityReport;
}
