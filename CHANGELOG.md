# Changelog

本文件记录 Design Compiler（design-compiler）的版本变更。
格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。

## [Unreleased]

## [0.3.0] — P2（美学集成收尾 + 文档完善）

### Added
- `docs/api/aesthetic-integration.md`、`docs/api/compiler-core.md`、`docs/quick-start.md`。
- 新增 `CHANGELOG.md`；README 补充 aesthetic-integration 章节与目录结构。

### Changed
- README 重写：补充美学集成模块、真实 PipelineRunner 集成、与 CAS 集成说明。

### Fixed
- 无代码改动（本版本仅文档）。

## [0.2.0] — P1（美学集成模块）

### Added
- `aesthetic-integration/` 模块（不改 compiler-core/、不改 schemas/）：
  - `aesthetic-sheet-adapter.ts`：DC 侧独立移植契约 A——`sheetToCangjieIR`，剥离 `/value` 后缀、补 paramId/source/calibration；
  - `aesthetic-pipeline-runner.ts`：`AestheticPipelineRunner` 端到端编排（adapter → normalizeIntent → 真实 PipelineRunner）；
  - 自动加载 `config/g1-policy.json` / `grammar-rules.json` / `tier-mapping.json` 生产配置。
- `config/grammar-rules.json` 扩展至 42 条 chinese-aesthetic 规则。
- `tests/aesthetic-integration/pipeline.test.ts`。

### Design 铁律
- 时间戳由调用方 `capturedAt` 传入，runner 不在语义路径调 new Date()；
- aestheticScore 只进 metadata，不改参数 confidence；
- adapter 不 import CAS 代码，独立类型镜像。

## [0.1.0] — P0（编译内核闭环）

### Added
- `compiler-core/` 确定性编译内核：
  - `data-gate.ts` G1：置信度重写 + requiredPaths 门禁；
  - `patch-engine.ts` G2：RFC 6902 补丁，按 ruleId ASCII 升序幂等；
  - `capability-negotiator.ts` G3：TIER_A/B/C 能力协商与降级；
  - `execution-planner.ts` G4：确定性执行计划与依赖图；
  - `pipeline-runner.ts`：G1→G2→G3 编排 + 4 元 hashChain；
  - 支撑：contracts / hash-policy（RFC8785+SHA256）/ json-pointer（RFC6901）/ scoring / semantic-gate / error-codes / deep-equal。
- `DesignCompiler` 异步包装层（输入校验 + 编译上下文 + 终止态）。
- `config/g1-policy.json`、`config/tier-mapping.json`。
- 契约测试 180+：contracts / hash-policy / json-pointer / design-compiler / execution-planner / governance。

### FROZEN
- `schemas/evaluation-result.schema.json` v1.0.0（FROZEN 1.0.0）。
