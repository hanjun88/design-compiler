/**
 * Phase 4-A: Scene Compilation Contract
 *
 * 场景编译契约模块。
 *
 * 子模块：
 * - types: SceneCompilationIR, SceneAssetManifest, SceneCapabilityBlocked 等类型
 * - contract-validator: 契约验证器（结构校验 + 溯源合法性 + 确定性摘要）
 * - capability-guard: 能力阻断看门狗（SCENE_CAPABILITY_BLOCKED）
 *
 * Schema:
 * - scene-compilation-ir.schema.json: JSON Schema 契约
 */

export * from "./types";
export * from "./contract-validator";
export * from "./capability-guard";
