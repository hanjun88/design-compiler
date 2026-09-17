# Implement Plan: REV-13 R3.14

## Phase 1: 源码修改
- [ ] 1.1 harness: 恢复 current_head_at_binding + binding_staleness_declaration + source_freeze_verified_by
- [ ] 1.2 版本号 → 1.7.3-REV-13-R3.14

## Phase 2: 验证 + 证据固化
- [ ] 2.1 bash -n / shellcheck
- [ ] 2.2 隔离 Worktree 正常运行，复制 stdout/stderr 到 evidence
- [ ] 2.3 隔离 Worktree 故障注入，复制日志到 evidence
- [ ] 2.4 验证日志 SHA 与 binding 一致

## Phase 3: 提交 + 收尾
- [ ] 3.1 提交源码冻结
- [ ] 3.2 提交证据（binding + 4个日志，git add -f）
- [ ] 3.3 T4 Delta 审计
- [ ] 3.4 trellis finish + archive + 推送
