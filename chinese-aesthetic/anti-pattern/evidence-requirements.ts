/**
 * Anti-Pattern Gate Evidence Requirements — 门禁证据需求声明
 *
 * 声明每个门禁所需的物理测度依赖与图拓扑特征，强制执行 UNMEASURED ≠ FAIL。
 * 若证据缺失，门禁必须显式返回 ALLOW + unmeasuredReason，而非伪造判定。
 */

import type { GateEvidenceRequirement } from "./types";

/**
 * 6 大门禁的证据需求声明。
 * 每个门禁必须明确声明所需的证据字段和图特征，
 * 运行时由协调器检查证据可用性，缺失时按 onMissingEvidence 策略处理。
 */
export const GATE_EVIDENCE_REQUIREMENTS: GateEvidenceRequirement[] = [
  {
    gateId: "ANTI-01",
    requiredFields: [
      "pixel.edgePixelRatio",
      "pixel.negativeSpaceComponentCount",
    ],
    requiredGraphFeatures: [
      "nodeCount",
      "averageDegree",
      "hostGuestEdges",
    ],
    onMissingEvidence: "SKIP",
  },
  {
    gateId: "ANTI-02",
    requiredFields: [
      "material.microSurfaceHighFrequencyVariance",
      "material.specularSharpness",
      "material.specularHighlightRatio",
      "pixel.luminanceStdDev",
    ],
    requiredGraphFeatures: [],
    onMissingEvidence: "SKIP",
  },
  {
    gateId: "ANTI-03",
    requiredFields: [
      "pixel.negativeSpaceRatio",
      "pixel.largestVoidRegionRatio",
      "pixel.spatialLaplacianVariance",
      "pixel.blockLuminanceMeanGradient",
    ],
    requiredGraphFeatures: [
      "voidNodeEnergy",
      "solidVoidRelation",
    ],
    onMissingEvidence: "SKIP",
  },
  {
    gateId: "ANTI-04",
    requiredFields: [
      "pixel.focalPoint",
      "pixel.focalCenterOffset",
    ],
    requiredGraphFeatures: [
      "subjectNodeCount",
      "subjectNodeEnergies",
      "hostGuestEdgesBetweenSubjects",
    ],
    onMissingEvidence: "SKIP",
  },
  {
    gateId: "ANTI-05",
    requiredFields: [
      "pixel.dominantColorRatio",
      "pixel.contrastRatio",
      "material.dominantMaterialCategory",
    ],
    requiredGraphFeatures: [],
    onMissingEvidence: "SKIP",
  },
  {
    gateId: "ANTI-06",
    requiredFields: [
      "purityAudit.hardcodedConstantsFound",
      "purityAudit.fieldsMissingEvidenceRef",
      "purityAudit.fieldsMissingConfidence",
    ],
    requiredGraphFeatures: [],
    onMissingEvidence: "FLAG", // 伪证据门禁在自身证据缺失时应 FLAG 而非 SKIP
  },
];

/**
 * 检查指定门禁的证据是否可用。
 * @returns 缺失的字段列表（空数组表示全部可用）
 */
export function checkEvidenceAvailability(
  gateId: string,
  evidence: Record<string, unknown>,
): string[] {
  const req = GATE_EVIDENCE_REQUIREMENTS.find((r) => r.gateId === gateId);
  if (!req) return [];

  const missing: string[] = [];
  for (const fieldPath of req.requiredFields) {
    const value = getNestedValue(evidence, fieldPath);
    if (value === undefined || value === null) {
      missing.push(fieldPath);
    }
    // 检查是否为 UnmeasuredSemantic
    if (
      typeof value === "object" &&
      value !== null &&
      (value as { status?: string }).status === "UNMEASURED_SEMANTIC"
    ) {
      missing.push(`${fieldPath} (UNMEASURED_SEMANTIC)`);
    }
  }
  return missing;
}

/**
 * 从嵌套对象中按路径取值。
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
