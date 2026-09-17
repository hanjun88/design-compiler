# Implement Plan: REV-13 R3.13

## Phase 1: 源码修改
- [ ] 1.1 harness: golden frame 调用加 --strict-exact
- [ ] 1.2 harness: funnel_verdict 动态计算 + jq --arg 注入
- [ ] 1.3 版本号 → 1.7.2-REV-13-R3.13

## Phase 2: 验证
- [ ] 2.1 bash -n / shellcheck
- [ ] 2.2 隔离 Worktree 正常运行（10 阶段 PASS, funnel=PASS, exit 0）
- [ ] 2.3 隔离 Worktree 故障注入（篡改 bin → golden_frame=FAIL, funnel=FAIL, exit 1）

## Phase 3: 证据 + 收尾
- [ ] 3.1 提交源码冻结 + 正常证据 + 故障注入证据
- [ ] 3.2 Delta T4 审计
- [ ] 3.3 trellis finish + archive + 推送
