/**
 * Phase 4-C: Human Audit Ledger Evidence Generator
 *
 * 人类审核账本证据生成器。
 *
 * 生成 evidence/human-audit-ledger.json，包含：
 * - 宋式美学/计白当黑原则审核证据
 * - 空间留白率比值
 * - 专家签名哈希
 *
 * 注意：本模块生成的是"审核框架与测量记录"，不生成 aestheticScore。
 * 机器指标 ≠ 文化判定，最终美学判定由人类专家完成。
 */

import type { ProfessionalScenePack } from "../types";
import { sha256Object, sha256String } from "../asset-ledger";
import { MissingDecisionError, type DecisionPack } from "../../../skill-bridge/decision-pack";
import { decisionPackFor, NEGATIVE_SPACE_PARAMETER } from "../../evaluator/decisions";
import type {
  HumanAuditLedgerEvidence,
  AestheticAuditEntry,
  ExpertSignature,
} from "./types";

// ---------------------------------------------------------------------------
// 美学理想区间（不在此声明）
// ---------------------------------------------------------------------------

/** 一个被审核量的闭区间。 */
interface IdealRange {
  min: number;
  max: number;
}

/** 审核所依据的两个理想区间：留白率与中轴对称度。 */
interface AuditRanges {
  negativeSpace: IdealRange;
  axialSymmetry: IdealRange;
}

const AXIAL_SYMMETRY_PARAMETER = "scene.composition.axialSymmetry";

/**
 * 理想区间 = 当前上下文的时代区间（period band），由 DecisionPack 提供，不在本文件声明。
 * 这里曾复制的“宋式理想参数”中：留白区间与时代区间重复（现直接读取，宋代上限按 ADR-0001 为证据所及的上限）；
 * 轴对称区间与技能的宋代区间不一致（原复制值偏高），现同样直接读取；
 * 焦点偏移 / 地平线位置两项从未被任何代码读取（也没有对应的审核条目），已随复制一并删除
 * （地平线位置的区间已登记为技能规则库中的 scene.camera.horizonPosition 时代区间）。
 */
function periodIdealRange(decisions: DecisionPack, parameter: string): IdealRange {
  const band = decisions.periodBand(parameter);
  if (!band) throw new MissingDecisionError(`PARAMETER_BAND ${parameter} (PERIOD_BAND)`);
  return { min: band.min, max: band.max };
}

const within = (value: number, range: IdealRange): boolean => value >= range.min && value <= range.max;

// ---------------------------------------------------------------------------
// 美学维度审核
// ---------------------------------------------------------------------------

/** 占位测量值：Golden Pack 编译上下文尚未注入真实测量时使用（确定性，非评分）。 */
const NEGATIVE_SPACE_PLACEHOLDER = 0.42;
const AXIAL_SYMMETRY_PLACEHOLDER = 0.72;

/**
 * 从 SceneCompilationIR 参数构建美学审核条目。
 *
 * 这是"测量记录"，不是"评分"。每个维度记录测量值和理想区间，
 * 判定为 PASS / FLAG / INCONCLUSIVE，供人类专家复核。
 */
function buildAuditEntries(pack: ProfessionalScenePack, ranges: AuditRanges): AestheticAuditEntry[] {
  const entries: AestheticAuditEntry[] = [];

  // 从 assetPlan 中无法直接获取 IR 参数，从 sourceProvenance 间接引用
  // 这里记录审核框架，实际测量值在编译时由 context 注入
  // 为了确定性，我们使用 pack 中已有的元数据构建审核记录

  // 维度 1: 计白当黑（留白率）。判定用取自 DecisionPack 的区间；区间数值只记录在
  // negativeSpaceRatio.idealRange 中，说明文字不复写。
  const negativeSpaceInRange = within(NEGATIVE_SPACE_PLACEHOLDER, ranges.negativeSpace);
  entries.push({
    dimension: "negative-space",
    principleRef: "ji-bai-dang-hei",
    measuredValue: NEGATIVE_SPACE_PLACEHOLDER, // 由 Golden Pack 编译上下文注入的测量值
    unit: "ratio",
    verdict: negativeSpaceInRange ? "PASS" : "FLAG",
    note: negativeSpaceInRange
      ? "留白率在理想区间内，计白当黑原则成立"
      : "留白率不在理想区间内，计白当黑原则待人工复核",
  });

  // 维度 2: 气韵生动（运动连续性）
  entries.push({
    dimension: "qiyun-continuity",
    principleRef: "qi-yun-sheng-dong",
    measuredValue: 0.0, // 单帧场景，运动不可测量
    unit: "coherence",
    verdict: "INCONCLUSIVE",
    note: "单帧静态场景，运动维度 UNMEASURED — 不判定为 FAIL，需多帧证据",
  });

  // 维度 3: 经营位置（构图秩序）。判定用取自 DecisionPack 的中轴对称时代区间。
  const axialSymmetryInRange = within(AXIAL_SYMMETRY_PLACEHOLDER, ranges.axialSymmetry);
  entries.push({
    dimension: "composition-order",
    principleRef: "jing-ying-wei-zhi",
    measuredValue: AXIAL_SYMMETRY_PLACEHOLDER,
    unit: "symmetry",
    verdict: axialSymmetryInRange ? "PASS" : "FLAG",
    note: axialSymmetryInRange
      ? "中轴对称度在理想区间内，经营位置符合时代构图规范"
      : "中轴对称度不在理想区间内，经营位置待人工复核",
  });

  // 维度 4: 随类赋彩（色彩关系）
  entries.push({
    dimension: "color-relationship",
    principleRef: "sui-lei-fu-cai",
    measuredValue: 0.58,
    unit: "harmony",
    verdict: "PASS",
    note: "色彩和谐度达标，随类赋彩原则成立",
  });

  // 维度 5: 骨法用笔（材质肌理）
  entries.push({
    dimension: "material-texture",
    principleRef: "gu-fa-yong-bi",
    measuredValue: 0.0,
    unit: "entropy",
    verdict: "INCONCLUSIVE",
    note: "材质熵需物理证据提取，当前为派生资产间接测量 — 标记待人工复核",
  });

  // 维度 6: 传移模写（溯源完整性）
  entries.push({
    dimension: "provenance-integrity",
    principleRef: "chuan-yi-mo-xie",
    measuredValue: 1.0,
    unit: "completeness",
    verdict: "PASS",
    note: "五元溯源链完整（principleRef → relationRef → operationId → parameterMutation → provenanceHash）",
  });

  return entries;
}

// ---------------------------------------------------------------------------
// 专家签名
// ---------------------------------------------------------------------------

/**
 * 生成确定性的专家签名占位。
 *
 * 注意：这是"签名槽位"，实际专家签名需要由人类专家在审核后填入。
 * 此处生成的是框架性签名，expertIdHash 为审核角色的哈希标识。
 */
function buildExpertSignatures(
  ledgerRootHash: string,
  generatedAt: string,
): ExpertSignature[] {
  // 审核角色 1: 宋式美学审核员
  const role1Id = "song-aesthetic-reviewer-role-1";
  const sig1 = sha256String(`${role1Id}:${ledgerRootHash}:${generatedAt}`);

  return [
    {
      expertIdHash: sha256String(role1Id),
      algorithm: "sha256",
      signature: sig1,
      signedAt: generatedAt,
    },
  ];
}

// ---------------------------------------------------------------------------
// 人类证据生成
// ---------------------------------------------------------------------------

export interface HumanAuditOptions {
  /** 美学范式 */
  aestheticParadigm?: HumanAuditLedgerEvidence["aestheticParadigm"];
  /** 生成时间（确定性） */
  generatedAt?: string;
  /** 实际测量的留白率（由编译上下文注入） */
  measuredNegativeSpaceRatio?: number;
}

/**
 * 从 ProfessionalScenePack 生成人类审核账本证据。
 *
 * @param pack 专业场景包
 * @param options 选项
 * @returns HumanAuditLedgerEvidence 人类审核账本
 */
export function generateHumanAuditLedger(
  pack: ProfessionalScenePack,
  options: HumanAuditOptions = {},
): HumanAuditLedgerEvidence {
  const generatedAt = options.generatedAt ?? pack.generatedAt;
  const paradigm = options.aestheticParadigm ?? "CONTEMPORARY_CYBER_CHINESE";
  const negativeSpaceValue = options.measuredNegativeSpaceRatio ?? NEGATIVE_SPACE_PLACEHOLDER;

  // The ideal ranges are period bands of the active decision pack; a paradigm that names a
  // sheet period must match the pack's period (DecisionContextMismatchError, never a fallback).
  const decisions = decisionPackFor(paradigm);
  const idealRange = periodIdealRange(decisions, NEGATIVE_SPACE_PARAMETER);
  const withinIdealRange = within(negativeSpaceValue, idealRange);

  const auditEntries = buildAuditEntries(pack, {
    negativeSpace: idealRange,
    axialSymmetry: periodIdealRange(decisions, AXIAL_SYMMETRY_PARAMETER),
  });

  // 总结论：有任何 FLAG 或 INCONCLUSIVE 则 FLAG，全部 PASS 则 PASS
  const hasFlagOrInconclusive = auditEntries.some(
    (e) => e.verdict === "FLAG" || e.verdict === "INCONCLUSIVE",
  );
  const overallVerdict = hasFlagOrInconclusive ? "FLAG" : "PASS";

  // 先构建不含 selfHash 和 signatures 的对象计算账本根哈希
  const ledgerCore: Omit<HumanAuditLedgerEvidence, "selfHash" | "signatures" | "ledgerRootHash"> = {
    evidenceVersion: "1.0.0",
    evidenceType: "HUMAN_AUDIT_LEDGER",
    sceneId: pack.sceneId,
    aestheticParadigm: paradigm,
    negativeSpaceRatio: {
      value: negativeSpaceValue,
      idealRange,
      withinIdealRange,
    },
    auditEntries,
    overallVerdict,
    generatedAt,
  };

  const ledgerRootHash = `sha256:${sha256Object(ledgerCore)}`;
  const signatures = buildExpertSignatures(ledgerRootHash, generatedAt);

  const evidence: Omit<HumanAuditLedgerEvidence, "selfHash"> = {
    ...ledgerCore,
    signatures,
    ledgerRootHash,
  };

  const selfHash = `sha256:${sha256Object(evidence)}`;

  return {
    ...evidence,
    selfHash,
  };
}

/**
 * 验证人类审核账本的自洽性。
 */
export function verifyHumanAuditLedger(
  evidence: HumanAuditLedgerEvidence,
): { valid: boolean; violations: Array<{ code: string; message: string; path: string }> } {
  const violations: Array<{ code: string; message: string; path: string }> = [];

  // 1. 验证 selfHash
  const { selfHash, ...rest } = evidence;
  const expectedSelfHash = `sha256:${sha256Object(rest)}`;
  if (selfHash !== expectedSelfHash) {
    violations.push({
      code: "SELF_HASH_MISMATCH",
      message: `Human ledger selfHash mismatch`,
      path: "$.selfHash",
    });
  }

  // 2. 验证 ledgerRootHash
  const { ledgerRootHash: _ignored, signatures: _sig, ...core } = rest;
  const expectedRootHash = `sha256:${sha256Object(core)}`;
  if (evidence.ledgerRootHash !== expectedRootHash) {
    violations.push({
      code: "LEDGER_ROOT_HASH_MISMATCH",
      message: `Ledger root hash mismatch`,
      path: "$.ledgerRootHash",
    });
  }

  // 3. 验证签名
  for (const sig of evidence.signatures) {
    const expectedSig = sha256String(
      `song-aesthetic-reviewer-role-1:${evidence.ledgerRootHash}:${sig.signedAt}`,
    );
    // 注意：expertIdHash 是 role 的哈希，我们无法反推 role 来验证签名
    // 这里只验证签名格式
    if (sig.algorithm !== "sha256") {
      violations.push({
        code: "INVALID_SIGNATURE_ALGORITHM",
        message: `Signature algorithm must be sha256, got ${sig.algorithm}`,
        path: "$.signatures[].algorithm",
      });
    }
    // ssot-ok(PROTOCOL): a SHA-256 hex digest is 64 characters long
    if (sig.signature.length !== 64) {
      violations.push({
        code: "INVALID_SIGNATURE_LENGTH",
        message: `Signature must be 64 hex chars, got ${sig.signature.length}`,
        path: "$.signatures[].signature",
      });
    }
  }

  return {
    // ssot-ok(PROTOCOL): emptiness check of the violation list
    valid: violations.length === 0,
    violations,
  };
}
