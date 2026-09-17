# PRD: REV-13 R3.18 统一 T4 证据 + 版本字符串同步

## 目标

1. **统一 T4 证据链**：在单次执行上下文中生成 Delta Audit 和 Final Audit 日志，两者引用相同的 SOURCE_FREEZE_COMMIT 和 FINAL_HEAD_COMMIT（执行瞬间真实 HEAD）。日志作为新提交追加，不使用 amend 循环。
2. **版本字符串同步**：verify-pipeline-artifacts.sh 的头注释（1.5.0-R3.1）和运行时输出（1.6.0-R3.5）更新为当前版本，消除历史残留。
3. **完整证据链重跑**：版本更新后重新运行 harness + 故障注入，生成一致的 binding + 日志 + T4。

## 验收标准

| # | 标准 |
|---|---|
| 1 | Delta Audit 日志与 Final Audit 日志引用相同的起止 SHA |
| 2 | 日志中的 FINAL_HEAD_COMMIT = 执行瞬间 git rev-parse HEAD |
| 3 | 日志作为新提交追加，不 amend 覆盖 |
| 4 | self-test 脚本头注释与运行时版本一致，均为当前版本 |
| 5 | Binding 的 stdout/stderr SHA 与实际日志文件匹配 |
| 6 | 从源码冻结到最终提交，排除 evidence/+.trellis/ 后零源码差异 |

## 约束
- trellis 工作流
- .log 需 git add -f
- 禁止 git stash，用 worktree 隔离
