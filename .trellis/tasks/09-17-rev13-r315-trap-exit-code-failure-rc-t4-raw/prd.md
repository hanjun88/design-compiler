# PRD: REV-13 R3.15 退出码日志修复

## 目标

1. Trap 函数明确打印最终退出码（区分 trap 入口 $? 与最终 exit code）
2. 故障注入运行时捕获并记录 FINAL_EXIT_CODE=$?
3. 提供 T4 Delta 审计原始输出

## 验收标准

| # | 标准 | 验证 |
|---|---|---|
| 1 | trap 失败分支打印 `FINAL_EXIT_CODE=1` | 故障注入日志中可见 |
| 2 | 故障注入日志含 `FINAL_EXIT_CODE=1` | grep 日志 |
| 3 | 故障注入日志含 golden verifier 失败原因 | golden-frame-stderr.log 内容 |
| 4 | T4 Delta 审计原始输出提交为证据 | git ls-files |
| 5 | 正常路径 11/11 PASS | 隔离 Worktree |

## 约束

- trellis 工作流
- .log 需 git add -f
- 禁止 git stash
