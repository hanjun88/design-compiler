/**
 * Aesthetic Intent Builder + Schema Validation + Fingerprint Generator
 *
 * 职责：
 * 1. 从构建上下文生成 AestheticIntentExtension
 * 2. 校验扩展对象符合 schema（required 字段 + 枚举约束）
 * 3. 生成 intentHash (FNV-1a 确定性指纹)
 * 4. 挂载到 IR 的 aestheticIntent 扩展字段，不污染 ABI 1.0.0 核心
 */

import type { RawDesignIR } from "../../compiler-core/contracts";
import type {
  AestheticIntentExtension,
  AestheticPrinciple,
  IntentBuildContext,
  ActiveRelationship,
  AppliedOperation,
} from "./types";

// ---------------------------------------------------------------------------
// FNV-1a 指纹（与 Anti-Pattern Gate 一致）
// ---------------------------------------------------------------------------

function fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

// ---------------------------------------------------------------------------
// Schema 校验
// ---------------------------------------------------------------------------

const VALID_PRINCIPLES: AestheticPrinciple[] = [
  "QI_YUN_CONTINUITY",
  "VOID_SOLID_INTERPLAY",
  "COUNT_WHITE_AS_BLACK",
  "GUEST_HOST_COMITY",
  "POSITION_MANAGEMENT",
  "SCALE_PROPORTION",
  "MATERIAL_PATINA",
  "LIGHT_TEMPORALITY",
];

const VALID_PERIODS = ["TANG", "SONG", "MING"] as const;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateAestheticIntent(intent: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof intent !== "object" || intent === null) {
    return { valid: false, errors: ["AestheticIntent must be an object"] };
  }

  const obj = intent as Record<string, unknown>;

  // required fields
  const required = ["system", "period", "principles", "appliedOperations", "provenance"];
  for (const field of required) {
    if (!(field in obj)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (errors.length > 0) return { valid: false, errors };

  // system const
  if (obj.system !== "chinese-aesthetic@1.0.0") {
    errors.push(`system must be "chinese-aesthetic@1.0.0", got: ${obj.system}`);
  }

  // period enum
  if (!VALID_PERIODS.includes(obj.period as (typeof VALID_PERIODS)[number])) {
    errors.push(`period must be one of ${VALID_PERIODS.join(", ")}, got: ${obj.period}`);
  }

  // principles array
  if (!Array.isArray(obj.principles)) {
    errors.push("principles must be an array");
  } else {
    for (const p of obj.principles) {
      if (!VALID_PRINCIPLES.includes(p as AestheticPrinciple)) {
        errors.push(`Invalid principle: ${p}`);
      }
    }
  }

  // activeRelationships (optional but if present must be array)
  if (obj.activeRelationships !== undefined && !Array.isArray(obj.activeRelationships)) {
    errors.push("activeRelationships must be an array if present");
  }

  // appliedOperations array
  if (!Array.isArray(obj.appliedOperations)) {
    errors.push("appliedOperations must be an array");
  } else {
    for (const op of obj.appliedOperations as Record<string, unknown>[]) {
      if (!op.opId || typeof op.opId !== "string") {
        errors.push("Each appliedOperation must have string opId");
      }
      if (!op.rationale || typeof op.rationale !== "string") {
        errors.push("Each appliedOperation must have string rationale");
      }
      if (!op.provenanceRef || typeof op.provenanceRef !== "string") {
        errors.push("Each appliedOperation must have string provenanceRef");
      }
    }
  }

  // antiPatternConformance
  if (obj.antiPatternConformance) {
    const apc = obj.antiPatternConformance as Record<string, unknown>;
    if (typeof apc.allAllowed !== "boolean") {
      errors.push("antiPatternConformance.allAllowed must be boolean");
    }
  }

  // provenance
  const prov = obj.provenance as Record<string, unknown>;
  if (!prov.evidenceHash || typeof prov.evidenceHash !== "string") {
    errors.push("provenance.evidenceHash must be non-empty string");
  }
  if (!prov.graphHash || typeof prov.graphHash !== "string") {
    errors.push("provenance.graphHash must be non-empty string");
  }
  if (!prov.intentHash || typeof prov.intentHash !== "string") {
    errors.push("provenance.intentHash must be non-empty string");
  }

  // additionalProperties check
  const allowedKeys = new Set([
    "system", "period", "principles", "activeRelationships",
    "appliedOperations", "antiPatternConformance", "provenance",
  ]);
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) {
      errors.push(`Additional property not allowed: ${key}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export class AestheticIntentBuilder {
  private context: IntentBuildContext;
  private relationships: ActiveRelationship[] = [];
  private operations: AppliedOperation[] = [];

  constructor(context: IntentBuildContext) {
    this.context = context;
    this.relationships = context.activeRelationships ?? [];
    this.operations = context.appliedOperations ?? [];
  }

  addRelationship(rel: ActiveRelationship): this {
    this.relationships.push(rel);
    return this;
  }

  addOperation(op: AppliedOperation): this {
    this.operations.push(op);
    return this;
  }

  /** 生成 intentHash：对除 intentHash 外的所有字段做确定性序列化后 FNV-1a */
  private computeIntentHash(intent: {
    system: string;
    period: string;
    principles: AestheticPrinciple[];
    activeRelationships: ActiveRelationship[];
    appliedOperations: AppliedOperation[];
    antiPatternConformance: { gateReportRef: string; allAllowed: boolean };
  }): string {
    const hashable = {
      system: intent.system,
      period: intent.period,
      principles: [...intent.principles].sort(),
      activeRelationships: intent.activeRelationships.map((r) => ({
        relationType: r.relationType,
        sourceId: r.sourceId,
        targetId: r.targetId,
        magnitude: r.magnitude,
      })),
      appliedOperations: intent.appliedOperations.map((o) => ({
        opId: o.opId,
        targetNodeId: o.targetNodeId,
        parameters: o.parameters,
        rationale: o.rationale,
        provenanceRef: o.provenanceRef,
      })),
      antiPatternConformance: intent.antiPatternConformance,
      evidenceHash: this.context.evidenceHash,
      graphHash: this.context.graphHash,
    };
    return fnv1a(JSON.stringify(hashable));
  }

  build(): AestheticIntentExtension {
    const partial = {
      system: "chinese-aesthetic@1.0.0" as const,
      period: this.context.period,
      principles: this.context.principles,
      activeRelationships: this.relationships,
      appliedOperations: this.operations,
      antiPatternConformance: {
        gateReportRef: this.context.gateReportRef,
        allAllowed: this.context.allAllowed,
      },
    };

    const intentHash = this.computeIntentHash(partial);

    return {
      ...partial,
      provenance: {
        evidenceHash: this.context.evidenceHash,
        graphHash: this.context.graphHash,
        intentHash,
      },
    };
  }

  /** 构建并校验，返回扩展对象 + 校验结果 */
  buildAndValidate(): { intent: AestheticIntentExtension; validation: ValidationResult } {
    const intent = this.build();
    const validation = validateAestheticIntent(intent);
    return { intent, validation };
  }
}

// ---------------------------------------------------------------------------
// 挂载到 IR（扩展命名空间，不修改 ABI 核心字段）
// ---------------------------------------------------------------------------

/**
 * 将 AestheticIntentExtension 挂载到 IR 的 aestheticIntent 扩展字段。
 * 返回新的 IR 对象（深拷贝），不修改输入。
 *
 * 注意：aestheticIntent 是扩展命名空间，不属于 ABI 1.0.0 核心契约。
 * Core Compiler 的 validate() 应忽略此字段。
 */
export function attachAestheticIntent(
  ir: RawDesignIR,
  intent: AestheticIntentExtension,
): RawDesignIR & { aestheticIntent: AestheticIntentExtension } {
  const cloned = JSON.parse(JSON.stringify(ir)) as RawDesignIR;
  return { ...cloned, aestheticIntent: intent };
}
