# Implement Plan: REV-13 R3.16

## Phase 1: 源码
- [ ] 1.1 harness: 增加 binding_generation_context 字段
- [ ] 1.2 版本号 → 1.7.5-REV-13-R3.16，日志文件名 r316-*

## Phase 2: 执行 + 证据
- [ ] 2.1 隔离 worktree 正常运行
- [ ] 2.2 故障注入：立即复制 golden-frame-stderr.log 为 failure- 前缀
- [ ] 2.3 恢复 bin，重新正常运行恢复干净 binding
- [ ] 2.4 复制全部证据回主工作区

## Phase 3: 提交 + 收尾
- [ ] 3.1 提交证据
- [ ] 3.2 以最终 HEAD 为终点重新运行 T4，覆盖日志，amend 提交
- [ ] 3.3 trellis finish + archive + 推送
