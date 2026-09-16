/**
 * Phase 4-C: Golden Scene Pack — Dual Evidence Types
 *
 * 双证据链系统类型定义。
 *
 * Machine Evidence: 输入 IR 摘要、资产 SHA-256 散列树、编译参数矩阵、ScenePackDigest
 * Human Evidence: 宋式美学审核、空间留白率、专家签名哈希
 */

import type { ProfessionalScenePack } from "../types";

// ---------------------------------------------------------------------------
// Machine Provenance Evidence
// ---------------------------------------------------------------------------

/** 单个资产的机器溯源条目 */
export interface MachineAssetProvenanceEntry {
  /** 资产标识 */
  assetId: string;
  /** 文件名 */
  fileName: string;
  /** 真实性分类 */
  truthClass: "SOURCE" | "DERIVED" | "GENERATED";
  /** SHA-256 哈希 */
  sha256: string;
  /** 文件大小（字节） */
  byteSize: number;
  /** 编译策略 */
  compilationStrategy: string;
  /** 来源 IR 字段路径（如适用） */
  sourceIRField?: string;
  /** 派生算法标识（DERIVED 资产） */
  derivationAlgorithm?: string;
  /** 派生算法参数（DERIVED 资产） */
  derivationParams?: Record<string, unknown>;
  /** 输入资产哈希（DERIVED 资产的输入） */
  inputAssetHashes?: string[];
}

/** 编译参数矩阵 */
export interface CompilationParameterMatrix {
  /** 目标宽度 */
  targetWidth: number;
  /** 目标高度 */
  targetHeight: number;
  /** 编译器标识 */
  compilerId: string;
  /** 编译器版本 */
  compilerVersion: string;
  /** 编译时间（确定性固定值） */
  compiledAt: string;
  /** 各资产的编译参数 */
  perAssetParams: Record<string, Record<string, unknown>>;
}

/** 机器溯源证据 */
export interface MachineProvenanceEvidence {
  /** 证据版本 */
  evidenceVersion: "1.0.0";
  /** 证据类型 */
  evidenceType: "MACHINE_PROVENANCE";
  /** 场景标识 */
  sceneId: string;
  /** 输入 SceneCompilationIR 摘要 */
  inputIRDigest: string;
  /** 输入溯源链 */
  inputProvenance: {
    validatedDesignIRHash: string;
    aestheticExecutionPlanHash: string;
    aestheticRuntimePlanHash: string;
  };
  /** 资产散列树（Merkle-like，按 assetId 排序） */
  assetHashTree: {
    /** 根哈希 = SHA-256(所有资产 sha256 按 assetId 排序后拼接) */
    rootHash: string;
    /** 资产条目列表 */
    entries: MachineAssetProvenanceEntry[];
  };
  /** 编译参数矩阵 */
  compilationParams: CompilationParameterMatrix;
  /** ScenePack 物理链摘要 */
  scenePackDigest: string;
  /** 证据生成时间 */
  generatedAt: string;
  /** 证据自校验哈希（对除 selfHash 外的全部字段 SHA-256） */
  selfHash: string;
}

// ---------------------------------------------------------------------------
// Human Audit Ledger Evidence
// ---------------------------------------------------------------------------

/** 单条美学审核记录 */
export interface AestheticAuditEntry {
  /** 审核维度 */
  dimension: string;
  /** 审核原则引用（如 "ji-bai-dang-hei" / "qi-yun"） */
  principleRef: string;
  /** 测量值 */
  measuredValue: number;
  /** 测量单位 */
  unit?: string;
  /** 判定结果 */
  verdict: "PASS" | "FLAG" | "INCONCLUSIVE";
  /** 判定说明 */
  note: string;
}

/** 专家签名 */
export interface ExpertSignature {
  /** 专家标识（哈希，不存储真实身份） */
  expertIdHash: string;
  /** 签名算法 */
  algorithm: "sha256";
  /** 签名值 = SHA-256(expertId + ledgerRootHash + timestamp) */
  signature: string;
  /** 签名时间 */
  signedAt: string;
}

/** 人类审核账本证据 */
export interface HumanAuditLedgerEvidence {
  /** 证据版本 */
  evidenceVersion: "1.0.0";
  /** 证据类型 */
  evidenceType: "HUMAN_AUDIT_LEDGER";
  /** 场景标识 */
  sceneId: string;
  /** 美学范式 */
  aestheticParadigm: "SONG" | "TANG" | "MING" | "CONTEMPORARY_CYBER_CHINESE";
  /** 空间留白率（计白当黑测量） */
  negativeSpaceRatio: {
    /** 测量值 [0,1] */
    value: number;
    /** 宋式理想区间 */
    idealRange: { min: number; max: number };
    /** 是否在理想区间内 */
    withinIdealRange: boolean;
  };
  /** 美学审核条目 */
  auditEntries: AestheticAuditEntry[];
  /** 审核总结论 */
  overallVerdict: "PASS" | "FLAG" | "INCONCLUSIVE";
  /** 专家签名列表 */
  signatures: ExpertSignature[];
  /** 账本根哈希 */
  ledgerRootHash: string;
  /** 证据生成时间 */
  generatedAt: string;
  /** 证据自校验哈希 */
  selfHash: string;
}

// ---------------------------------------------------------------------------
// Dual Evidence Bundle
// ---------------------------------------------------------------------------

/** 双证据链包 */
export interface DualEvidenceBundle {
  /** 机器证据 */
  machine: MachineProvenanceEvidence;
  /** 人类证据 */
  human: HumanAuditLedgerEvidence;
  /** 双证据关联哈希 = SHA-256(machine.selfHash + human.selfHash) */
  crossReferenceHash: string;
}

/** 双证据验证结果 */
export interface DualEvidenceVerificationResult {
  /** 机器证据是否有效 */
  machineValid: boolean;
  /** 人类证据是否有效 */
  humanValid: boolean;
  /** 双证据关联是否一致 */
  crossReferenceValid: boolean;
  /** 与 scene.json 的自洽性 */
  sceneManifestConsistent: boolean;
  /** 总体是否通过 */
  valid: boolean;
  /** 违规列表 */
  violations: Array<{ code: string; message: string; path: string }>;
}
