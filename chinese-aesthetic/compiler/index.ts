/**
 * Aesthetic-to-ExecutionPlan Compiler — Phase 3.4
 *
 * 将 AestheticIntentExtension 确定性编译为 AestheticExecutionPlan。
 *
 * 模块：
 * - types: 类型定义（AestheticExecutionPlan, PlanOperation, Provenance, ConflictResolution）
 * - operation-selector: 3.4-A 零隐式规则算子选择器
 * - period-constraints: 3.4-C 时代先验参数约束
 * - conflict-resolver: 3.4-D 显式优先级冲突解析器
 * - plan-emitter: 3.4-B 确定性计划发射器
 */

export * from "./types";
export * from "./operation-selector";
export * from "./period-constraints";
export * from "./conflict-resolver";
export * from "./plan-emitter";
