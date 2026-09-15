/**
 * Chinese Aesthetic Evaluation Matrix — Machine Assertions
 *
 * 第一层：机器可计算断言。所有指标必须来自物理证据或 Core IR，
 * 严禁将文化判断伪装成机器精确事实。
 *
 * 架构关系：Chinese Cultural Principle → Aesthetic Relationship → Visual Structure
 *           → Machine Assertion（本层）→ Semantic Evaluation（上层）
 *
 * 本层与 ABI 1.0.0 正交：不修改 contracts/schemas，不反向入侵 Core Compiler。
 */

// ============================================================================
// 机器断言结果类型
// ============================================================================

export type MachineAssertionStatus = "PASS" | "FAIL" | "INCONCLUSIVE";

export interface MachineAssertion {
  /** 断言ID，如 focal-hierarchy */
  assertionId: string;
  /** 关联的文化维度，如 宾主揖让 */
  culturalDimension: string;
  /** 断言状态 */
  status: MachineAssertionStatus;
  /** 量化指标值 */
  metrics: Record<string, unknown>;
  /** 证据引用（指向物理证据文件或 Core IR 字段） */
  evidenceRefs: string[];
  /** 计算方法描述 */
  method: string;
}

// ============================================================================
// A. 宾主关系 Proxy (Subject-Prominence / Focal Hierarchy)
// ============================================================================

export interface FocalHierarchyMetrics {
  /** 焦点距中心偏移 (0=完美居中, 1=边缘) */
  focalCenterOffset: number;
  /** 主导色面积占比 */
  dominantAreaRatio: number;
  /** 辅助色面积占比 */
  secondaryAreaRatio: number;
  /** 点缀色面积占比 */
  accentAreaRatio: number;
  /** 主辅分离度 (dominant - secondary area ratio) */
  dominanceSeparation: number;
}

// ============================================================================
// B. 计白当黑 / 虚实 (Negative Space / Void-Solid)
// ============================================================================

export interface VoidSolidMetrics {
  /** 负空间比例 */
  negativeSpaceRatio: number;
  /** 主体空间比例 (1 - negativeSpace) */
  subjectSpaceRatio: number;
  /** 空域连续性 (负空间区域的连通性) */
  emptyRegionContinuity: number;
  /** 视觉密度方差 */
  visualDensityVariance: number;
  /** 边缘密度分布偏度 */
  edgeDensitySkew: number;
}

// ============================================================================
// C. 气韵连贯性 Proxy (Qi-Yun / Motion-Luminance Continuity)
// ============================================================================

export interface QiyunContinuityMetrics {
  /** 运动连续性 (光流方向一致性) */
  motionContinuity: number;
  /** 光流相干性 (相邻帧位移矢量的余弦相似度均值) */
  opticalFlowCoherence: number;
  /** 相机运动平滑度 (全局位移的标准差倒数) */
  cameraMotionSmoothness: number;
  /** 亮度连续性 (相邻关键帧亮度差的倒数) */
  luminanceContinuity: number;
  /** 色彩过渡连续性 (相邻关键帧色差的倒数) */
  chromaticContinuity: number;
  /** 深度过渡连续性 */
  depthContinuity: number;
}

// ============================================================================
// D. 空间层次 (Spatial Depth Layers)
// ============================================================================

export interface SpatialDepthMetrics {
  /** 深度层次数量 */
  depthLayerCount: number;
  /** 前景/中景/背景分离度 */
  layerSeparation: number;
  /** 遮挡关系数量 */
  occlusionCount: number;
  /** 大气透视深度 (远景亮度/对比度衰减) */
  atmosphericDepth: number;
  /** 焦深分离度 */
  focalDepthSeparation: number;
}

// ============================================================================
// E. 色彩关系 (Color Relationship)
// ============================================================================

export interface ColorRelationshipMetrics {
  /** 主导色 hex */
  dominant: string;
  /** 辅助色 hex */
  secondary: string;
  /** 点缀色 hex */
  accent: string;
  /** 对比度 (WCAG) */
  contrastRatio: number;
  /** 色温偏移 (-1极冷 ~ 1极暖) */
  temperatureBias: number;
  /** 亮度层级 (主导/辅助/点缀的亮度排序) */
  luminanceHierarchy: number;
  /** 点缀隔离度 (点缀色面积占比，越小越隔离) */
  accentIsolation: number;
}

// ============================================================================
// F. 材质关系 (Material Relationship)
// ============================================================================

export interface MaterialRelationshipMetrics {
  /** 主导材质粗糙度 */
  dominantRoughness: number;
  /** 主导材质金属度 */
  dominantMetalness: number;
  /** 主导材质磨损度 */
  dominantWear: number;
  /** 表面变化度 (不同材质粗糙度方差) */
  surfaceVariation: number;
  /** 微观细节分布 (高频纹理能量) */
  microDetailDistribution: number;
}

// ============================================================================
// 完整机器断言报告
// ============================================================================

export interface MachineAssertionReport {
  /** 评估用例ID */
  testCaseId: string;
  /** 评估时间 (确定性输入，禁止 new Date()) */
  evaluatedAt: string;
  /** 宾主关系断言 */
  focalHierarchy: MachineAssertion & { metrics: FocalHierarchyMetrics };
  /** 计白当黑/虚实断言 */
  voidSolid: MachineAssertion & { metrics: VoidSolidMetrics };
  /** 气韵连贯性断言 */
  qiyunContinuity: MachineAssertion & { metrics: QiyunContinuityMetrics };
  /** 空间层次断言 */
  spatialDepth: MachineAssertion & { metrics: SpatialDepthMetrics };
  /** 色彩关系断言 */
  colorRelationship: MachineAssertion & { metrics: ColorRelationshipMetrics };
  /** 材质关系断言 */
  materialRelationship: MachineAssertion & { metrics: MaterialRelationshipMetrics };
  /** 总体机器断言通过率 */
  passRate: number;
}
