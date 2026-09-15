/**
 * Anti-Pattern Gate Types — 反模式门禁类型定义
 *
 * Phase 2 Step 2.4: 基于 ObservableEvidence (2.2) + RelationshipGraph (2.3)
 * 的硬性可证伪淘汰门禁。严禁引入美学综合打分或以"低分"代"淘汰"。
 *
 * 核心宪法（12 条）：
 * 1. No semantic score as gate input.
 * 2. No hardcoded visual defaults.
 * 3. No inferred depth when depth evidence is absent.
 * 4. No IR declared parameter as physical observation.
 * 5. No confidence=1 unless evidence supports it.
 * 6. Every REJECT must have evidenceRef.
 * 7. Every FLAG must expose reason + evidence.
 * 8. UNMEASURED / SOURCE_LIMITED ≠ FAIL.
 * 9. Diagnostic asset ≠ Golden Case.
 * 10. Metric threshold ≠ cultural truth.
 * 11. Gate output must be deterministic.
 * 12. Existing Core / Evaluator / PBR / Golden Matrix remain untouched.
 */

// ---------------------------------------------------------------------------
// 门禁标识与判定状态
// ---------------------------------------------------------------------------

/** 6 大反模式门禁标识 */
export type AntiPatternGateId =
  | "ANTI-01" // Symbolic Stacking — 符号化机械堆砌
  | "ANTI-02" // Unphysical Glow / Plastic Highlight — 非物理荧光与塑料高光
  | "ANTI-03" // Dead Void — 假留白死黑/死白
  | "ANTI-04" // Conflicted Hierarchy — 主从混乱 / 多主冲突
  | "ANTI-05" // Toxic Saturation — 高饱和度毒性溢出
  | "ANTI-06"; // Fake Evidence / Default Injection — 伪证据与默认值注入（最高优先级）

/** 门禁判定结果 */
export type GateVerdict =
  | "ALLOW" // 通过，无反模式特征
  | "FLAG" // 警告，存在可疑特征但不足以淘汰
  | "REJECT"; // 淘汰，明确触发反模式

/** 整体判定（聚合 6 大门禁） */
export type OverallVerdict =
  | "ALLOW" // 全部 ALLOW
  | "FLAG" // 至少一个 FLAG，无 REJECT
  | "REJECT"; // 至少一个 REJECT

// ---------------------------------------------------------------------------
// 单门禁结果
// ---------------------------------------------------------------------------

/** 单个反模式门禁的判定结果 */
export interface AntiPatternResult {
  /** 门禁标识 */
  gateId: AntiPatternGateId;
  /** 门禁名称 */
  name: string;
  /** 判定结果 */
  verdict: GateVerdict;
  /** 判定置信度 [0, 1]，UNMEASURED 时为 0 */
  confidence: number;
  /** 证据引用列表（必填，指向具体的 pixel-buffer: 或 graph: 路径） */
  evidenceRefs: string[];
  /** 判定方法描述 */
  method: string;
  /** 判定理由（人类可读） */
  rationale: string;
  /** 若数据不足以判定，显式记录原因（而非伪造 PASS/FAIL） */
  unmeasuredReason?: string;
  /** 触发的具体指标值（用于法医对账） */
  metrics?: Record<string, number | string | boolean>;
}

// ---------------------------------------------------------------------------
// 整体报告
// ---------------------------------------------------------------------------

/** 反模式门禁整体报告 */
export interface AntiPatternReport {
  /** 报告唯一标识（基于 evidenceId + graphHash） */
  reportId: string;
  /** 关联的证据集 ID */
  evidenceId: string;
  /** 关联的关系图哈希 */
  graphHash: string;
  /** 整体判定 */
  overallVerdict: OverallVerdict;
  /** 6 大门禁的判定结果 */
  gateResults: AntiPatternResult[];
  /** 触发 REJECT 的门禁列表 */
  rejectedGates: AntiPatternGateId[];
  /** 触发 FLAG 的门禁列表 */
  flaggedGates: AntiPatternGateId[];
  /** 报告生成时间（确定性，取自 evidence.capturedAt） */
  generatedAt: string;
  /** 报告内容的 SHA256 指纹（用于法医对账） */
  reportHash: string;
  /** 宪法合规性自检结果 */
  constitutionCompliance: ConstitutionCompliance;
}

/** 宪法合规性自检 */
export interface ConstitutionCompliance {
  /** 所有 REJECT 都有 evidenceRef */
  allRejectsHaveEvidence: boolean;
  /** 所有 FLAG 都有 reason + evidence */
  allFlagsHaveReason: boolean;
  /** 无 confidence=1 除非证据支持（检查是否有 confidence=1 但 evidenceRefs 为空） */
  noUnsupportedConfidenceOne: boolean;
  /** UNMEASURED 未被当作 FAIL */
  unmeasuredNotTreatedAsFail: boolean;
  /** 无语义评分输入 */
  noSemanticScoreInput: boolean;
  /** 整体合规状态 */
  compliant: boolean;
}

// ---------------------------------------------------------------------------
// 门禁输入上下文
// ---------------------------------------------------------------------------

/** 门禁执行上下文（传递给每个 gate 的输入） */
export interface GateContext {
  /** 可观测证据集（2.2 产物） */
  evidence: import("../extraction/types").ObservableEvidenceSet;
  /** 美学关系图（2.3 产物） */
  graph: import("../graph/types").AestheticRelationshipGraph;
}

/** 门禁函数签名 */
export type GateFunction = (ctx: GateContext) => AntiPatternResult;

// ---------------------------------------------------------------------------
// 证据需求声明
// ---------------------------------------------------------------------------

/** 单个门禁的证据需求声明 */
export interface GateEvidenceRequirement {
  gateId: AntiPatternGateId;
  /** 需要的证据字段路径（如 "pixel.spatialLaplacianVariance"） */
  requiredFields: string[];
  /** 需要的图拓扑特征（如 "nodeDegree", "hostGuestEdges"） */
  requiredGraphFeatures: string[];
  /** 若证据缺失时的行为："SKIP"（返回 ALLOW + unmeasuredReason）或 "FLAG" */
  onMissingEvidence: "SKIP" | "FLAG";
}
