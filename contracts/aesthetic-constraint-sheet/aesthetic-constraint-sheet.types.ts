/* eslint-disable */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source:        contracts/aesthetic-constraint-sheet/aesthetic-constraint-sheet.schema.json
 * contract_hash: aa37657287da9b170c5709a22f0fb656da0833cd4aeaf25a64bd351bffa0e030
 * Regenerate:    node scripts/contract/lock-contract.mjs --write
 * Drift is a CI failure (node scripts/contract/lock-contract.mjs --check).
 */

export type Semver = string;

export type SemverRange = string;

export type Sha256 = string;

export type GitCommit = string;

export type RuleId = string;

export type DecisionId = string;

export type Confidence = number;

export type Role = "composition" | "spatial" | "lighting" | "material" | "color" | "evaluation" | "governance";

export type Period = "TANG" | "SONG" | "MING";

export type Identifier = string;

export type ParamKey = string;

export type MetricId = string;

export type Unit = string;

export type SceneParameterId = string;

export type JsonPointer = string;

export type CapabilityId = string;

export type SourceRef = {
  repository: string;
  commit: GitCommit;
  /**
   * True when the producer ran on a worktree with uncommitted changes; consumers fail closed on true unless explicitly allowed.
   */
  dirty: boolean;
  registry_path: string;
  /**
   * sha256 of the RFC 8785 canonical rules registry the sheet was derived from.
   */
  registry_hash: Sha256;
  generator: string;
};

export type Compatibility = {
  /**
   * Contract versions this sheet is valid against.
   */
  contract_range: SemverRange;
  /**
   * Consumer capabilities needed to honour the sheet; unknown capabilities are rejected.
   */
  requires_capabilities: CapabilityId[];
};

export type DesignContext = {
  period: Period;
  material: Identifier;
  lighting: Identifier;
  scene_type: Identifier;
  /**
   * Roles the sheet must cover; a missing role is a rejection.
   */
  required_roles: Role[];
};

export type AppliesTo = {
  period?: Period[];
  material?: Identifier[];
  lighting?: Identifier[];
  scene_type?: Identifier[];
};

export type SourceEntry = {
  source_id: string;
  kind: "guideline" | "literature" | "film-lexicon" | "expert-judgment" | "dataset-prior" | "engine" | "derived";
  ref: string;
  quote?: string;
};

export type ConstraintProvenance = {
  sources: SourceEntry[];
  derivation?: {
    formula: string;
    inputs: DecisionId[];
  };
  /**
   * sha256 of the RFC 8785 canonical constraint with provenance.content_hash removed.
   */
  content_hash: Sha256;
};

export type SheetProvenance = {
  /**
   * Digest of the producer's rule provenance ledger (rule_id, sources, confidence of every registry rule).
   */
  ledger_hash: Sha256;
  /**
   * sha256 of the RFC 8785 canonical sheet with provenance.content_hash removed.
   */
  content_hash: Sha256;
  constraint_count: number;
};

export type PayloadParameterBand = {
  parameter: SceneParameterId;
  /**
   * RawDesignIR pointer of the same quantity, when the quantity exists in the Core IR.
   */
  ir_pointer?: JsonPointer;
  metric: MetricId;
  semantics: "PERIOD_BAND" | "HARD_FLOOR" | "STRUCTURAL_SIGNAL" | "REPAIR_TARGET" | "DESIGN_DEFAULT" | "PHYSICAL_RANGE";
  min: number;
  max: number;
  target?: number;
  unit: Unit;
  rationale: string;
};

export type PayloadGrammarRule = {
  principle: string;
  category: "composition" | "lighting" | "color" | "materials";
  description?: string;
  target_path: JsonPointer;
  condition: {
    operator: "<" | ">" | "<=" | ">=" | "==" | "!=" | "between" | "not_between";
    value: number | string | boolean | number[];
  };
  mutation: {
    op: "replace" | "add" | "remove";
    value?: JsonScalarOrVector;
  };
  patches?: ({
    op: "replace" | "add" | "remove";
    path: JsonPointer;
    value?: JsonScalarOrVector;
  })[];
  severity: "P0_CRITICAL" | "P1_WARNING" | "P2_INFO";
  reason: string;
};

export type JsonScalarOrVector = number | string | boolean | number[];

export type PayloadPolicy = {
  subject: string;
  params: Record<string, number>;
  flags?: Record<string, boolean>;
  enums?: Record<string, string>;
  vectors?: Record<string, number[]>;
  rationale: string;
};

export type PayloadPriorityOrder = {
  order: Role[];
  rationale: string;
};

export type PayloadScoringWeights = {
  weights: {
    composition: number;
    lighting: number;
    color: number;
    materials: number;
  };
  rationale: string;
};

export type ConstraintParameterBand = {
  decision_id: DecisionId;
  rule_id: RuleId;
  kind: "PARAMETER_BAND";
  role: Role;
  confidence: Confidence;
  applies_to: AppliesTo;
  provenance: ConstraintProvenance;
  payload: PayloadParameterBand;
};

export type ConstraintGrammarRule = {
  decision_id: DecisionId;
  rule_id: RuleId;
  kind: "GRAMMAR_RULE";
  role: Role;
  confidence: Confidence;
  applies_to: AppliesTo;
  provenance: ConstraintProvenance;
  payload: PayloadGrammarRule;
};

export type ConstraintOperationPolicy = {
  decision_id: DecisionId;
  rule_id: RuleId;
  kind: "OPERATION_POLICY";
  role: Role;
  confidence: Confidence;
  applies_to: AppliesTo;
  provenance: ConstraintProvenance;
  payload: PayloadPolicy;
};

export type ConstraintAntiPatternThreshold = {
  decision_id: DecisionId;
  rule_id: RuleId;
  kind: "ANTI_PATTERN_THRESHOLD";
  role: Role;
  confidence: Confidence;
  applies_to: AppliesTo;
  provenance: ConstraintProvenance;
  payload: PayloadPolicy;
};

export type ConstraintEvaluationAssertion = {
  decision_id: DecisionId;
  rule_id: RuleId;
  kind: "EVALUATION_ASSERTION";
  role: Role;
  confidence: Confidence;
  applies_to: AppliesTo;
  provenance: ConstraintProvenance;
  payload: PayloadPolicy;
};

export type ConstraintPriorityOrder = {
  decision_id: DecisionId;
  rule_id: RuleId;
  kind: "PRIORITY_ORDER";
  role: Role;
  confidence: Confidence;
  applies_to: AppliesTo;
  provenance: ConstraintProvenance;
  payload: PayloadPriorityOrder;
};

export type ConstraintScoringWeights = {
  decision_id: DecisionId;
  rule_id: RuleId;
  kind: "SCORING_WEIGHTS";
  role: Role;
  confidence: Confidence;
  applies_to: AppliesTo;
  provenance: ConstraintProvenance;
  payload: PayloadScoringWeights;
};

/**
 * The single machine contract between chinese-aesthetic-skill (producer) and design-compiler (consumer). Owned by design-compiler; the skill emits instances that must validate against this schema, the compiler derives every aesthetic runtime number from a validated instance. Hash-locked in contract.lock.json.
 */
export type AestheticConstraintSheet = {
  /**
   * Version of this contract the sheet was produced against.
   */
  schema_version: Semver;
  /**
   * Version of chinese-aesthetic-skill that produced the sheet.
   */
  skill_version: Semver;
  source_ref: SourceRef;
  compatibility: Compatibility;
  /**
   * contract_hash of the schema the producer targeted (contract.lock.json). The consumer rejects any mismatch.
   */
  contract_hash: Sha256;
  /**
   * Context-resolution rule that selected the constraint set below.
   */
  rule_id: RuleId;
  /**
   * The context decision recorded by this sheet; root of every provenance chain.
   */
  decision_id: DecisionId;
  /**
   * Aggregate confidence; equals the minimum over constraints[].confidence.
   */
  confidence: Confidence;
  design_context: DesignContext;
  constraints: (ConstraintParameterBand | ConstraintGrammarRule | ConstraintOperationPolicy | ConstraintAntiPatternThreshold | ConstraintEvaluationAssertion | ConstraintPriorityOrder | ConstraintScoringWeights)[];
  provenance: SheetProvenance;
};

export type ConstraintKind = AestheticConstraintSheet["constraints"][number]["kind"];
export type AestheticConstraint = AestheticConstraintSheet["constraints"][number];
export type ConstraintOfKind<K extends ConstraintKind> = Extract<AestheticConstraint, { kind: K }>;
