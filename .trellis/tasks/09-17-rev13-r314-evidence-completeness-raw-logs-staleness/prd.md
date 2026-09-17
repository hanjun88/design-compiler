# PRD: REV-13 R3.14 证据完整性修复

## 目标

1. 恢复 Binding 时效性字段（R3.10 引入，R3.11 重写时丢失）：`current_head_at_binding` + `binding_staleness_declaration`
2. 固化原始 stdout/stderr 日志为受控证据（git add -f，绕过 .gitignore）
3. 验证日志 SHA 与 Binding 中记录一致
4. 固化故障注入原始日志
5. 重新执行 T4 Delta 审计

## 验收标准

| # | 标准 | 验证 |
|---|---|---|
| 1 | Binding 含 `current_head_at_binding` 和 `binding_staleness_declaration` | jq 检查 |
| 2 | 正常路径 stdout/stderr 日志提交到 evidence 目录 | git ls-files |
| 3 | 日志 SHA256 与 Binding 中 stdout_sha256/stderr_sha256 一致 | sha256sum 比对 |
| 4 | 故障注入日志提交 | git ls-files |
| 5 | T4 Delta 审计通过 | verify-freeze-evidence-delta.sh |

## 约束

- trellis 工作流
- .log 需 git add -f
- 禁止 git stash
- 保护区 ZERO DIFF
