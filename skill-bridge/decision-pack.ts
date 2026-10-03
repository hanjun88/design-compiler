/**
 * DecisionPack — the compiler's only source of aesthetic numbers.
 *
 * Built from a ValidatedSheet (never from raw JSON, never from literals in compiler code).
 * Every read is recorded, so the pipeline can emit a ledger of exactly which skill decisions
 * (source_ref -> rule_id -> decision_id) produced the runtime numbers of a compilation.
 * Reading something the sheet does not carry throws: no silent default, no local fallback.
 */
import type { AestheticConstraintSheet, ConstraintKind, ConstraintOfKind } from "../contracts/aesthetic-constraint-sheet/aesthetic-constraint-sheet.types";
import type { GrammarRule, GrammarRulePack } from "../compiler-core/patch-engine";
import type { ComplianceScoringWeights } from "../compiler-core/scoring";
import { SheetRejectedError, type SheetIssue } from "./errors";
import { isValidatedSheet, type ValidatedSheet } from "./sheet-validator";
import { canonicalSha256 } from "./hash";

export type AestheticPeriodId = AestheticConstraintSheet["design_context"]["period"];
export type PolicyKind = "OPERATION_POLICY" | "ANTI_PATTERN_THRESHOLD" | "EVALUATION_ASSERTION";
export type Role = AestheticConstraintSheet["design_context"]["required_roles"][number];

export interface DecisionRef {
  readonly rule_id: string;
  readonly decision_id: string;
}

export interface BandView extends DecisionRef {
  readonly confidence: number;
  readonly parameter: string;
  readonly ir_pointer?: string;
  readonly metric: string;
  readonly semantics: ConstraintOfKind<"PARAMETER_BAND">["payload"]["semantics"];
  readonly min: number;
  readonly max: number;
  readonly target?: number;
  readonly unit: string;
  readonly rationale: string;
}

export interface EffectiveBand {
  readonly parameter: string;
  readonly min: number;
  readonly max: number;
  /** Every hard band (PERIOD_BAND / PHYSICAL_RANGE / HARD_FLOOR) that contributed. */
  readonly contributors: readonly BandView[];
}

export interface DecisionUse extends DecisionRef {
  readonly kind: ConstraintKind;
  readonly subject: string;
  /** Present for policy reads: which key of the decision was read. */
  readonly key?: string;
}

/** What the compiler needs from a sheet; checked when a pack is built (fail closed before any compilation). */
export interface DecisionRequirement {
  kind: ConstraintKind;
  /** policy subject, band parameter, or rule id for GRAMMAR_RULE; omitted for PRIORITY_ORDER / SCORING_WEIGHTS */
  subject?: string;
  params?: readonly string[];
  flags?: readonly string[];
  enums?: readonly string[];
  vectors?: readonly string[];
  lists?: readonly string[];
}

export class MissingDecisionError extends SheetRejectedError {
  constructor(what: string) {
    super([{ code: "SHEET_REQUIRED_DECISION_MISSING", message: `the aesthetic sheet carries no decision for ${what}` }]);
    this.name = "MissingDecisionError";
  }
}

export class DecisionContextMismatchError extends Error {
  constructor(requested: string, available: string) {
    super(`aesthetic decisions requested for ${requested} but the active sheet is for ${available}`);
    this.name = "DecisionContextMismatchError";
  }
}

const refOf = (c: { rule_id: string; decision_id: string }): DecisionRef => ({ rule_id: c.rule_id, decision_id: c.decision_id });

export class PolicyView {
  constructor(
    private readonly pack: DecisionPack,
    public readonly kind: PolicyKind,
    public readonly subject: string,
    public readonly ref: DecisionRef,
    private readonly payload: ConstraintOfKind<PolicyKind>["payload"],
  ) {}

  private read<T>(bag: Record<string, T> | undefined, key: string, label: string): T {
    const v = bag?.[key];
    if (v === undefined) throw new MissingDecisionError(`${this.kind} ${this.subject}.${label}.${key}`);
    this.pack.recordUse({ ...this.ref, kind: this.kind, subject: this.subject, key });
    return v;
  }

  has(key: string): boolean {
    const p = this.payload;
    return key in p.params || (p.flags !== undefined && key in p.flags) || (p.enums !== undefined && key in p.enums) || (p.vectors !== undefined && key in p.vectors) || (p.lists !== undefined && key in p.lists);
  }
  num(key: string): number { return this.read(this.payload.params, key, "params"); }
  flag(key: string): boolean { return this.read(this.payload.flags, key, "flags"); }
  str(key: string): string { return this.read(this.payload.enums, key, "enums"); }
  vec(key: string): readonly number[] { return this.read(this.payload.vectors, key, "vectors"); }
  list(key: string): readonly string[] { return this.read(this.payload.lists, key, "lists"); }
}

export class DecisionPack {
  readonly sheet: ValidatedSheet;
  readonly context: AestheticConstraintSheet["design_context"];
  readonly sheetHash: string;
  private readonly bandsByParam = new Map<string, BandView[]>();
  private readonly policies = new Map<string, { ref: DecisionRef; payload: ConstraintOfKind<PolicyKind>["payload"] }>();
  private readonly grammar: ConstraintOfKind<"GRAMMAR_RULE">[] = [];
  private readonly ruleRefs = new Map<string, DecisionRef>();
  private priority?: ConstraintOfKind<"PRIORITY_ORDER">;
  private weights?: ConstraintOfKind<"SCORING_WEIGHTS">;
  private readonly uses = new Map<string, DecisionUse>();

  private constructor(sheet: ValidatedSheet) {
    this.sheet = sheet;
    this.context = sheet.design_context;
    this.sheetHash = sheet.provenance.content_hash;
    for (const c of sheet.constraints) {
      switch (c.kind) {
        case "PARAMETER_BAND": {
          const p = c.payload;
          const view: BandView = { ...refOf(c), confidence: c.confidence, parameter: p.parameter, ir_pointer: p.ir_pointer, metric: p.metric, semantics: p.semantics, min: p.min, max: p.max, target: p.target, unit: p.unit, rationale: p.rationale };
          this.bandsByParam.set(p.parameter, [...(this.bandsByParam.get(p.parameter) ?? []), view]);
          break;
        }
        case "GRAMMAR_RULE":
          this.grammar.push(c);
          this.ruleRefs.set(c.rule_id, refOf(c));
          break;
        case "OPERATION_POLICY":
        case "ANTI_PATTERN_THRESHOLD":
        case "EVALUATION_ASSERTION":
          this.policies.set(`${c.kind}|${c.payload.subject}`, { ref: refOf(c), payload: c.payload });
          break;
        case "PRIORITY_ORDER": this.priority = c; break;
        case "SCORING_WEIGHTS": this.weights = c; break;
      }
    }
  }

  /** The only constructor: a pack can only be derived from a sheet that passed validation. */
  static from(sheet: ValidatedSheet, requirements: readonly DecisionRequirement[] = []): DecisionPack {
    if (!isValidatedSheet(sheet)) {
      throw new SheetRejectedError([{ code: "SHEET_SCHEMA_INVALID", message: "DecisionPack.from requires a ValidatedSheet (call validateSheet first)" }]);
    }
    const pack = new DecisionPack(sheet);
    const issues = pack.missing(requirements);
    if (issues.length) throw new SheetRejectedError(issues);
    return pack;
  }

  get period(): AestheticPeriodId { return this.context.period; }
  get provenance() {
    const s = this.sheet;
    return {
      repository: s.source_ref.repository,
      commit: s.source_ref.commit,
      skill_version: s.skill_version,
      schema_version: s.schema_version,
      registry_hash: s.source_ref.registry_hash,
      ledger_hash: s.provenance.ledger_hash,
      contract_hash: s.contract_hash,
      sheet_hash: s.provenance.content_hash,
      sheet_decision_id: s.decision_id,
      sheet_rule_id: s.rule_id,
    } as const;
  }

  /** Throws when `period` is not the period this pack was decided for. */
  assertPeriod(period: string): void {
    if (period !== this.context.period) throw new DecisionContextMismatchError(period, this.context.period);
  }

  // ----- bands -----------------------------------------------------------------------------
  bands(parameter: string): readonly BandView[] { return this.bandsByParam.get(parameter) ?? []; }
  allBands(): readonly BandView[] { return [...this.bandsByParam.values()].flat(); }

  /** The period plausibility band of a parameter; undefined when the sheet constrains no such parameter. */
  periodBand(parameter: string): BandView | undefined {
    const b = this.bands(parameter).find((x) => x.semantics === "PERIOD_BAND");
    if (b) this.recordUse({ ...b, kind: "PARAMETER_BAND", subject: parameter });
    return b;
  }

  /** Intersection of every hard band of a parameter (empty intersections were rejected at validation). */
  effectiveBand(parameter: string): EffectiveBand | undefined {
    const hard = this.bands(parameter).filter((b) => b.semantics === "PERIOD_BAND" || b.semantics === "PHYSICAL_RANGE" || b.semantics === "HARD_FLOOR");
    if (hard.length === 0) return undefined;
    for (const b of hard) this.recordUse({ ...b, kind: "PARAMETER_BAND", subject: parameter });
    return { parameter, min: Math.max(...hard.map((b) => b.min)), max: Math.min(...hard.map((b) => b.max)), contributors: hard };
  }

  /** The authored design target (REPAIR_TARGET / DESIGN_DEFAULT) of a parameter, if the sheet has one. */
  designTarget(parameter: string): BandView | undefined {
    const b = this.bands(parameter).find((x) => (x.semantics === "REPAIR_TARGET" || x.semantics === "DESIGN_DEFAULT") && x.target !== undefined);
    if (b) this.recordUse({ ...b, kind: "PARAMETER_BAND", subject: parameter });
    return b;
  }

  /** The structural-signal threshold (scoring only, never a compliance floor). */
  structuralSignal(parameter: string): BandView | undefined {
    const b = this.bands(parameter).find((x) => x.semantics === "STRUCTURAL_SIGNAL");
    if (b) this.recordUse({ ...b, kind: "PARAMETER_BAND", subject: parameter });
    return b;
  }

  // ----- policies --------------------------------------------------------------------------
  hasPolicy(kind: PolicyKind, subject: string): boolean { return this.policies.has(`${kind}|${subject}`); }
  policy(kind: PolicyKind, subject: string): PolicyView {
    const p = this.policies.get(`${kind}|${subject}`);
    if (!p) throw new MissingDecisionError(`${kind} ${subject}`);
    return new PolicyView(this, kind, subject, p.ref, p.payload);
  }

  // ----- grammar / ordering / weights -------------------------------------------------------
  /** GrammarRulePack for the Core PatchEngine; rule ids are the skill's rule_ids. */
  grammarRulePack(): GrammarRulePack {
    const rules: GrammarRule[] = this.grammar.map((c) => {
      const p = c.payload;
      this.recordUse({ ...refOf(c), kind: "GRAMMAR_RULE", subject: c.rule_id });
      return {
        ruleId: c.rule_id,
        principle: p.principle,
        category: p.category,
        targetPath: p.target_path,
        condition: { operator: p.condition.operator, value: p.condition.value as GrammarRule["condition"]["value"] },
        mutation: { op: p.mutation.op, ...(p.mutation.value !== undefined ? { value: p.mutation.value } : {}) },
        ...(p.patches ? { patches: p.patches.map((x) => ({ op: x.op, path: x.path, ...(x.value !== undefined ? { value: x.value } : {}) })) } : {}),
        ...(p.description ? { description: p.description } : {}),
        severity: p.severity,
        reason: p.reason,
      };
    });
    return {
      packName: `aesthetic-sheet:${this.sheet.decision_id}`,
      version: this.sheet.skill_version,
      description: `Derived from AestheticConstraintSheet ${this.sheetHash.slice(0, 12)} (skill ${this.sheet.skill_version} @ ${this.sheet.source_ref.commit.slice(0, 10)})`,
      rules,
      weights: this.scoringWeights(),
    };
  }
  grammarRuleRef(ruleId: string): DecisionRef | undefined { return this.ruleRefs.get(ruleId); }

  priorityOrder(): readonly Role[] {
    if (!this.priority) throw new MissingDecisionError("PRIORITY_ORDER");
    this.recordUse({ ...refOf(this.priority), kind: "PRIORITY_ORDER", subject: "conflict-priority" });
    return this.priority.payload.order;
  }
  scoringWeights(): ComplianceScoringWeights {
    if (!this.weights) throw new MissingDecisionError("SCORING_WEIGHTS");
    this.recordUse({ ...refOf(this.weights), kind: "SCORING_WEIGHTS", subject: "compliance-weights" });
    return { ...this.weights.payload.weights };
  }

  // ----- requirements ------------------------------------------------------------------------
  missing(requirements: readonly DecisionRequirement[]): SheetIssue[] {
    const issues: SheetIssue[] = [];
    const miss = (what: string) => issues.push({ code: "SHEET_REQUIRED_DECISION_MISSING", message: `the aesthetic sheet carries no decision for ${what}` });
    for (const r of requirements) {
      switch (r.kind) {
        case "PARAMETER_BAND":
          if (!r.subject || this.bands(r.subject).length === 0) miss(`PARAMETER_BAND ${r.subject}`);
          break;
        case "GRAMMAR_RULE":
          if (!r.subject || !this.ruleRefs.has(r.subject)) miss(`GRAMMAR_RULE ${r.subject}`);
          break;
        case "PRIORITY_ORDER": if (!this.priority) miss("PRIORITY_ORDER"); break;
        case "SCORING_WEIGHTS": if (!this.weights) miss("SCORING_WEIGHTS"); break;
        default: {
          const p = this.policies.get(`${r.kind}|${r.subject}`);
          if (!p) { miss(`${r.kind} ${r.subject}`); break; }
          for (const k of r.params ?? []) if (p.payload.params[k] === undefined) miss(`${r.kind} ${r.subject}.params.${k}`);
          for (const k of r.flags ?? []) if (p.payload.flags?.[k] === undefined) miss(`${r.kind} ${r.subject}.flags.${k}`);
          for (const k of r.enums ?? []) if (p.payload.enums?.[k] === undefined) miss(`${r.kind} ${r.subject}.enums.${k}`);
          for (const k of r.vectors ?? []) if (p.payload.vectors?.[k] === undefined) miss(`${r.kind} ${r.subject}.vectors.${k}`);
          for (const k of r.lists ?? []) if (p.payload.lists?.[k] === undefined) miss(`${r.kind} ${r.subject}.lists.${k}`);
        }
      }
    }
    return issues;
  }

  // ----- provenance usage ledger ---------------------------------------------------------------
  /** Content digest of the decisions only (not of source_ref): stable across skill commits that do not change them. */
  get constraintsHash(): string { return canonicalSha256(this.sheet.constraints); }

  /** The constraint carrying a decision id, for provenance reporting. */
  constraintOf(decisionId: string): AestheticConstraintSheet["constraints"][number] | undefined {
    return this.sheet.constraints.find((c) => c.decision_id === decisionId);
  }

  /** @internal called by views; records one use per (decision, key). */
  recordUse(use: DecisionUse): void {
    const id = `${use.decision_id}|${use.key ?? ""}`;
    if (!this.uses.has(id)) this.uses.set(id, use);
  }
  /** Decisions that actually produced runtime numbers so far, in first-use order. */
  usage(): readonly DecisionUse[] { return [...this.uses.values()]; }
}
