/**
 * Phase 4-B: Professional Scene Pack Compiler
 *
 * 场景包编译器模块。
 *
 * 子模块：
 * - types: ProfessionalScenePack, AssetPlan, CompiledAsset, AssetHashLedger 等类型
 * - asset-planner: 资产规划器（根据 SceneCompilationIR 规划资产列表）
 * - asset-boundary: 物理/派生资产边界守卫（SOURCE/DERIVED/GENERATED 严格区分）
 * - asset-ledger: SHA-256 资产哈希账本
 * - asset-compiler: 资产生成器框架（接口 + 模拟编译器）
 * - asset-validator: 资产验证器
 * - scene-pack-emitter: 场景包发射器
 *
 * 核心原则：
 * - Asset Truth Boundary: SOURCE / DERIVED / GENERATED 严格区分
 * - 物理资产完整性使用 SHA-256
 * - 每个资产必须携带完整溯源链
 * - 不支持的能力显式 BLOCKED，禁止静默回退
 * - 不偷渡 HeartMirror 业务语义
 */

export * from "./types";
export * from "./asset-planner";
export * from "./asset-boundary";
export * from "./asset-ledger";
export * from "./asset-compiler";
export * from "./asset-validator";
export * from "./scene-pack-emitter";
export * from "./standard-asset-compiler";
export * from "./golden-pack-compiler";
export * from "./evidence";
