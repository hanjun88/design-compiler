/**
 * Phase 4-C: Dual Evidence Module
 *
 * 双证据链模块导出。
 */

export * from "./types";
export * from "./machine-provenance";
export * from "./human-audit-ledger";

import type { ProfessionalScenePack } from "../types";
import { sha256String } from "../asset-ledger";
import { generateMachineProvenance, verifyMachineProvenance } from "./machine-provenance";
import { generateHumanAuditLedger, verifyHumanAuditLedger } from "./human-audit-ledger";
import type {
  DualEvidenceBundle,
  DualEvidenceVerificationResult,
  MachineProvenanceEvidence,
  HumanAuditLedgerEvidence,
} from "./types";

// ---------------------------------------------------------------------------
// 双证据链生成
// ---------------------------------------------------------------------------

export interface DualEvidenceOptions {
  /** 编译器标识 */
  compilerId?: string;
  /** 生成时间（确定性） */
  generatedAt?: string;
  /** 美学范式 */
  aestheticParadigm?: HumanAuditLedgerEvidence["aestheticParadigm"];
  /** 实测留白率 */
  measuredNegativeSpaceRatio?: number;
}

/**
 * 生成双证据链包。
 *
 * @param pack 专业场景包
 * @param options 选项
 * @returns DualEvidenceBundle 双证据链包
 */
export function generateDualEvidence(
  pack: ProfessionalScenePack,
  options: DualEvidenceOptions = {},
): DualEvidenceBundle {
  const machine = generateMachineProvenance(pack, {
    compilerId: options.compilerId,
    generatedAt: options.generatedAt,
  });

  const human = generateHumanAuditLedger(pack, {
    aestheticParadigm: options.aestheticParadigm,
    generatedAt: options.generatedAt,
    measuredNegativeSpaceRatio: options.measuredNegativeSpaceRatio,
  });

  const crossReferenceHash = `sha256:${sha256String(machine.selfHash + human.selfHash)}`;

  return {
    machine,
    human,
    crossReferenceHash,
  };
}

/**
 * 验证双证据链的完整性和自洽性。
 */
export function verifyDualEvidence(
  bundle: DualEvidenceBundle,
  pack?: ProfessionalScenePack,
): DualEvidenceVerificationResult {
  const violations: DualEvidenceVerificationResult["violations"] = [];

  // 1. 验证机器证据
  const machineResult = verifyMachineProvenance(bundle.machine, pack);
  if (!machineResult.valid) {
    violations.push(...machineResult.violations);
  }

  // 2. 验证人类证据
  const humanResult = verifyHumanAuditLedger(bundle.human);
  if (!humanResult.valid) {
    violations.push(...humanResult.violations);
  }

  // 3. 验证双证据关联
  const expectedCrossRef = `sha256:${sha256String(bundle.machine.selfHash + bundle.human.selfHash)}`;
  const crossReferenceValid = bundle.crossReferenceHash === expectedCrossRef;
  if (!crossReferenceValid) {
    violations.push({
      code: "CROSS_REFERENCE_MISMATCH",
      message: `Dual evidence cross-reference hash mismatch`,
      path: "$.crossReferenceHash",
    });
  }

  // 4. 验证 sceneId 一致
  const sceneManifestConsistent = bundle.machine.sceneId === bundle.human.sceneId;
  if (!sceneManifestConsistent) {
    violations.push({
      code: "SCENE_ID_INCONSISTENT",
      message: `Machine evidence sceneId (${bundle.machine.sceneId}) != Human evidence sceneId (${bundle.human.sceneId})`,
      path: "$.sceneId",
    });
  }

  return {
    machineValid: machineResult.valid,
    humanValid: humanResult.valid,
    crossReferenceValid,
    sceneManifestConsistent,
    valid: machineResult.valid && humanResult.valid && crossReferenceValid && sceneManifestConsistent,
    violations,
  };
}
