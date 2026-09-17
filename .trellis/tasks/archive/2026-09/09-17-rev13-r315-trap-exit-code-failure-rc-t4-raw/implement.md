# Implement Plan: REV-13 R3.15

## Phase 1: 源码修改
- [ ] 1.1 trap 失败/成功分支打印 FINAL_EXIT_CODE
- [ ] 1.2 log_archive 阶段同时归档 golden-frame-stderr.log
- [ ] 1.3 版本号 → 1.7.4-REV-13-R3.15

## Phase 2: 验证 + 证据
- [ ] 2.1 bash -n / shellcheck
- [ ] 2.2 隔离 Worktree 正常运行（11 阶段 PASS）
- [ ] 2.3 故障注入：篡改 bin，捕获 FINAL_EXIT_CODE=$?，归档 golden frame 失败日志
- [ ] 2.4 T4 Delta 审计原始输出保存为 .log

## Phase 3: 提交 + 收尾
- [ ] 3.1 源码冻结提交
- [ ] 3.2 证据提交（binding + 日志 + T4 输出，git add -f）
- [ ] 3.3 trellis finish + archive + 推送
