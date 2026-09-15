/**
 * Aesthetic Relationship Graph Types — 美学关系图类型定义
 *
 * Phase 2 Step 2.3: 将 ObservableEvidenceSet 提升为带方向、极性与溯源的拓扑图。
 *
 * 核心原则：
 * - 关系不是标签，而是有方向、有类型、有证据来源的结构
 * - 严禁输出语义评分或文化分类器结果
 * - 所有节点和边必须可回溯至具体 EvidenceField
 * - 无法从物理证据推导的关系显式标记为未测量，不脑补
 */

// ---------------------------------------------------------------------------
// 节点类型（受控词表）
// ---------------------------------------------------------------------------

/**
 * 美学实体节点类型。
 * 每个节点类型对应一类可从物理证据实例化的几何/场实体。
 */
export type AestheticNodeType =
  | "SUBJECT"    // 主体（显著性质心区域）
  | "OBJECT"     // 客体（次级显著区域）
  | "SPACE"      // 空间（构图/对称/视平线）
  | "VOID"       // 虚空（负空间/留白）
  | "LIGHT"      // 光照（亮度场/色温）
  | "MATERIAL"   // 材质（表面/粗糙度/金属度）
  | "TIME"       // 时间（包浆/风化/痕迹）
  | "VIEW"       // 视角（相机俯仰/视平线）
  | "AXIS"       // 轴线（中轴对称）
  | "BOUNDARY"   // 边界（边缘密度/轮廓）
  | "SCALE"      // 尺度（天地人级差/前景背景比）
  | "MOTION";    // 运动（光流/时序连续性，仅多帧时存在）

// ---------------------------------------------------------------------------
// 关系类型（受控词表）
// ---------------------------------------------------------------------------

/**
 * 美学关系类型。
 * 每种关系对应一类可从物理证据推导的结构关系，非文化语义判断。
 */
export type AestheticRelationType =
  | "HOST_GUEST"      // 主客（显著度支配比）
  | "SOLID_VOID"      // 虚实（实体与虚空咬合）
  | "VISIBLE_HIDDEN"  // 显隐（可见与遮挡/含蓄）
  | "DENSE_SPARSE"    // 疏密（局部频域方差对比）
  | "MOVE_STILL"      // 动静（运动与静止区域对比）
  | "NEAR_FAR"        // 远近（深度层级，需真实深度缓冲）
  | "HIGH_LOW"        // 高低（亮度/色温层级对比）
  | "CENTER_EDGE"     // 中边（中心与边缘张力）
  | "OPEN_CLOSE"      // 开合（空间开放与边界围合）
  | "HEAVY_LIGHT"     // 轻重（材质重量感与光照轻盈感）
  | "OLD_NEW";        // 新旧（时间痕迹与材质原始态）

// ---------------------------------------------------------------------------
// 极性
// ---------------------------------------------------------------------------

/** 关系极性：FORWARD=源→宿单向，REVERSE=宿→源单向，MUTUAL=双向互摄 */
export type RelationPolarity = "FORWARD" | "REVERSE" | "MUTUAL";

// ---------------------------------------------------------------------------
// 归一化区域
// ---------------------------------------------------------------------------

/** 归一化矩形区域 [x, y, width, height]，所有值 ∈ [0, 1] */
export type NormalizedRect = [number, number, number, number];

// ---------------------------------------------------------------------------
// 节点
// ---------------------------------------------------------------------------

/**
 * 美学实体节点。
 * 每个节点绑定底层具体物理测量或 IR 声明引用，杜绝抽象悬空。
 */
export interface AestheticNode {
  /** 节点唯一标识，如 "node:subject:primary" */
  id: string;
  /** 节点类型（受控词表） */
  type: AestheticNodeType;
  /** 归一化边界区域（如可定位，否则为 null） */
  boundingRegion: NormalizedRect | null;
  /** 物理能量（显著性/亮度/面积权重，非主观评分），∈ [0, 1] */
  energy: number;
  /** 证据引用列表，指向具体 EvidenceField.evidenceRef */
  evidenceRefs: string[];
  /** 置信度，由底层测度置信度传播得到，∈ [0, 1] */
  confidence: number;
}

// ---------------------------------------------------------------------------
// 关系边
// ---------------------------------------------------------------------------

/**
 * 有向极性关系边。
 * 关系必须具备源、宿、类型、量化强度、极性与来源。
 */
export interface AestheticRelation {
  /** 源节点 ID */
  sourceId: string;
  /** 目标节点 ID */
  targetId: string;
  /** 关系类型（受控词表） */
  relationType: AestheticRelationType;
  /** 物理关系强度 ∈ [0, 1]，由证据推导，非主观评分 */
  magnitude: number;
  /** 极性 */
  polarity: RelationPolarity;
  /** 推导算子与证据源引用 */
  derivedFrom: string[];
  /** 置信度 = min(source.conf, target.conf, derivation.conf) */
  confidence: number;
}

// ---------------------------------------------------------------------------
// 未测量关系
// ---------------------------------------------------------------------------

/**
 * 无法从物理证据推导的关系（如无深度缓冲时的 NEAR_FAR）。
 * 显式标记，不脑补、不默认。
 */
export interface UnmeasuredRelation {
  relationType: AestheticRelationType;
  reason: string;
  /** 建议的人工诠释入口 */
  semanticInterpretationRef: string;
}

// ---------------------------------------------------------------------------
// 拓扑审计
// ---------------------------------------------------------------------------

/**
 * 拓扑不变量审计结果。
 */
export interface TopologyAudit {
  /** 非孤立性：所有节点至少属于一条关系边 */
  noIsolatedNodes: boolean;
  /** 反向对称性：极性互斥关系方向与极性严格代数对齐 */
  polarAlignment: boolean;
  /** 有界力场：全图总能量归一化 ∈ [0, 1] */
  boundedEnergy: boolean;
  /** 纯度穿透：每条边必能回溯至具体 EvidenceField */
  purityPenetration: boolean;
  /** 审计详情（失败项描述） */
  violations: string[];
  /** 总体状态 */
  status: "PASS" | "FAIL";
}

// ---------------------------------------------------------------------------
// 图容器
// ---------------------------------------------------------------------------

/**
 * 美学关系图容器。
 * 从 ObservableEvidenceSet 确定性推导，字节级可复现。
 */
export interface AestheticRelationshipGraph {
  /** 图唯一标识（与 evidenceId 绑定） */
  graphId: string;
  /** 来源证据集 ID */
  evidenceId: string;
  /** 生成时间（确定性输入） */
  generatedAt: string;
  /** 节点列表 */
  nodes: AestheticNode[];
  /** 关系边列表 */
  relations: AestheticRelation[];
  /** 未测量关系列表（显式标记，不脑补） */
  unmeasuredRelations: UnmeasuredRelation[];
  /** 拓扑审计 */
  topologyAudit: TopologyAudit;
  /** 图结构 SHA256 指纹（确定性） */
  graphHash: string;
  /** 溯源：推导算子列表 */
  derivationPipeline: string[];
}
