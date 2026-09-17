# PRD: REV-13 R3.16 证据一致性修复

## 目标

1. Golden frame 错误日志：故障注入时 golden-frame-stderr.log 必须包含真实失败原因，不被后续正常运行覆盖
2. T4 Delta 审计范围：日志终点必须是最终证据提交 SHA
3. Binding HEAD 语义：增加字段说明 current_head_at_binding = 隔离 worktree 执行时的 HEAD（即源码冻结点）
4. 重新核验变更清单

## 验收标准

| # | 标准 | 验证 |
|---|---|---|
| 1 | 故障注入 golden-frame-stderr.log 含 SHA256_MANIFEST_MISMATCH | grep 日志 |
| 2 | T4 日志终点 = 最终证据提交 SHA | 比对日志与 git rev-parse HEAD |
| 3 | Binding 含 binding_generation_context 字段 | jq 检查 |
| 4 | git diff --name-status 清单与 T4 报告一致 | 人工比对 |

## 约束
- trellis 工作流
- .log 需 git add -f
