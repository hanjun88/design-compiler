# B4-EM-02 Evidence Binding Synchronization

## Goal

修复 binding JSON (`tests/chinese-aesthetic/render/evidence/rev13-r3-version-binding.json`) 与 B4 主动阻断门修复后的 harness 状态不同步问题。审查席 GitHub 远程核验发现 4 项证据缺口：protected_zone 字段缺失、head_commit 过时、source_freeze_verified_by 未含 scene-contract/、verification_matrix 未含 B4 状态。

## 问题根因

binding JSON 是 harness 运行时由 `atomic_write_binding()` 动态生成的工件。最后一次生成是 R3.18 期间（HEAD=4417c4f），此后 B4 (c9d48f7) 和 B4 主动阻断门 (1f76322) 两次修改了 harness，但未重新运行 harness 以刷新 binding JSON。因此 binding 工件停留在 R3.18 状态，与当前 harness 不一致。

## Requirements

- R1: `atomic_write_binding()` 的 jq 模板增加 `--arg status_protected_zone "$STATUS_PROTECTED_ZONE"` 参数
- R2: binding JSON 的 `verification_matrix` 增加 `protected_zone: $status_protected_zone` 字段
- R3: `source_freeze_verified_by` 已含 `chinese-aesthetic/scene-contract/`（B4 c9d48f7 已加入 harness 代码），重新生成后 binding 工件将自动同步
- R4: 在干净提交状态（harness 修改已提交）上重跑 harness，重新生成 binding JSON + evidence logs
- R5: 提交 regenerated binding + evidence logs 为独立证据提交（追加模式，不 amend）
- R6: 验证 `head_commit_at_source_freeze`、`current_head_at_binding` 与提交链关系正确

## 提交策略（两阶段）

```
阶段 1: 提交 harness 修改 (atomic_write_binding 增加 protected_zone)
  → HEAD 推进至 commit-H
阶段 2: 在 commit-H 干净状态上重跑 harness
  → binding JSON 记录 head_commit=commit-H, current_head=commit-H
  → 提交 regenerated binding + logs 为证据提交 commit-E
  → HEAD 推进至 commit-E
  → binding 诚实记录执行瞬间 HEAD=commit-H，后续 commit-E 为证据-only 追加
```

此模式与 R3.18 SOP（追加提交 + 独立 delta 审计）一致。

## Acceptance Criteria

### AC1: harness 修改正确
- `atomic_write_binding()` 包含 `--arg status_protected_zone`
- jq 模板 `verification_matrix` 包含 `protected_zone`
- bash -n PASS, shellcheck RC=0, git diff --check PASS

### AC2: binding JSON 包含 protected_zone
- 重新生成的 binding JSON 中 `verification_matrix.protected_zone` 存在且值为 "PASS"
- `jq '.verification_matrix.protected_zone' binding.json` 输出 "PASS"

### AC3: source_freeze_verified_by 含 scene-contract/
- `jq '.source_freeze_verified_by' binding.json` 输出包含 `chinese-aesthetic/scene-contract/`

### AC4: head_commit 与提交链一致
- `head_commit_at_source_freeze` = harness 修改提交的 SHA (commit-H)
- `current_head_at_binding` = commit-H（执行瞬间 HEAD，证据提交前）
- 证据提交 (commit-E) 在 binding 生成之后，binding 不声称覆盖 commit-E

### AC5: verification_matrix 完整
- 包含 12 个状态字段：protected_zone, bash_n, shellcheck, registry_validator, selftest, closure_analyzer, golden_frame, log_archive, script_blob, harness_blob, temporal_invariance
- 全部为 "PASS"

### AC6: funnel_verdict = PASS
- `jq '.funnel_verdict' binding.json` = "PASS"

### AC7: 变更范围
- 阶段 1 提交：仅 harness.sh 1 文件
- 阶段 2 提交：仅 evidence/ 目录下的 binding JSON + evidence logs

### AC8: 联合探针重跑通过
- B2 跨仓绑定：PASS
- B4 主动阻断：干净工作树 exit 0，篡改 exit 2
- DC-PB-004 保护区一致性：harness / 004 procedure / 004 context 三处一致
- 双仓 Git 对账：LOCAL=REMOTE

## Constraints
- 追加提交模式，禁止 amend
- trellis 完整流程：create → prd → start → implement → verify → commit → finish → archive
- 不修改保护区内任何文件
- 不修改 DC-PB playbook 内容
- 不修改 B2 跨仓绑定
- harness 运行产生的 evidence logs 覆盖旧 R3.18 日志（预期行为，反映当前 harness 状态）
