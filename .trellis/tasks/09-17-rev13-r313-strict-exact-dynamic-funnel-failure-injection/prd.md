# PRD: REV-13 R3.13

## 目标

1. Harness Golden Frame 阶段使用 `--strict-exact`（0 LSB），非默认 2 LSB
2. `funnel_verdict` 动态计算：所有 STATUS_* == PASS 才为 PASS，禁止硬编码
3. 故障注入证据：故意让某阶段失败，确认 binding 中 funnel_verdict=FAIL 且 harness exit 非零

## 验收标准

| # | 标准 | 验证 |
|---|---|---|
| 1 | Harness 调用 verify-golden-frame.js 带 --strict-exact | grep 源码确认 |
| 2 | binding JSON 中 funnel_verdict 由 jq --arg 动态注入，非硬编码 | 检查源码 |
| 3 | 正常运行：10 阶段全 PASS，funnel_verdict=PASS，exit 0 | 隔离 Worktree |
| 4 | 故障注入：篡改 golden bin → golden_frame=FAIL → funnel_verdict=FAIL → exit 1 | 隔离 Worktree |
| 5 | Delta 审计 T4 外部门禁通过 | Freeze→Evidence |

## 约束

- trellis 工作流
- 禁止 git stash
- 保护区 ZERO DIFF
