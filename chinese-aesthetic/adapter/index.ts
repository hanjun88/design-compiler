/**
 * Aesthetic-to-Runtime Adapter — Phase 3.4.1
 *
 * 将 AestheticExecutionPlan 转换为 AestheticRuntimePlan。
 *
 * 模块：
 * - types: 类型定义（RuntimeInstruction, AestheticRuntimePlan, BlockedOperation）
 * - plan-adapter: 适配器实现（16算子映射, Range Guard, 显式BLOCKED, 溯源透传）
 */

export * from "./types";
export * from "./plan-adapter";
