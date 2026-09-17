# B4: Expand ZERO DIFF protection matrix to include chinese-aesthetic/scene-contract/

## Goal

审查席 B4 P0 指令：A 轨 `chinese-aesthetic/scene-contract/` 作为跨仓数据交接的 schema 权威来源（B 轨 cross-repo-binding.json 锚定的目标），未纳入 ZERO DIFF 保护矩阵。将其追加至 harness 的 SOURCE_FREEZE_VERIFIED_BY 路径列表，确保未来 binding JSON 记录该区域零差异。

## Requirements

- R1: 在 `playbooks/verification/rev13-r311-verification-harness.sh` line 247 的 `SOURCE_FREEZE_VERIFIED_BY` git diff 路径列表中追加 `chinese-aesthetic/scene-contract/`
- R2: 不修改其他任何逻辑、版本号或行为
- R3: shellcheck 通过
- R4: 保护区（compiler-core/ evaluation/ schemas/）零差异

## Acceptance Criteria

- [ ] AC1: harness line 247 包含 `chinese-aesthetic/scene-contract/`
- [ ] AC2: shellcheck -x RC=0
- [ ] AC3: 保护区零差异
- [ ] AC4: trellis 完整流程

## Constraints

- 仅修改 line 247 一行，不触碰其他逻辑
- 不修改活跃脚本版本号（此为保护矩阵配置变更，非逻辑变更）
- 追加提交模式，禁止 amend
