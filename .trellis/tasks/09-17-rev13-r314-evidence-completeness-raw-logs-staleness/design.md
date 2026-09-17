# Design: REV-13 R3.14

## 1. 恢复 Binding 时效性字段

在 harness 的 jq 模板中恢复：
```json
"current_head_at_binding": "<git rev-parse HEAD at binding write time>",
"binding_staleness_declaration": "evidence commit only; no source change in <freeze>..<current>",
"source_freeze_verified_by": "git diff <freeze> <current> -- <source paths>"
```

在 atomic_write_binding 前计算 `CURRENT_HEAD_AT_BINDING=$(git rev-parse HEAD)`。

## 2. 固化原始日志

harness 运行后，将 `$RUN_DIR/raw_stdout.log` 和 `raw_stderr.log` 复制到 evidence 目录：
- `tests/chinese-aesthetic/render/evidence/rev13-r314-selftest-stdout.log`
- `tests/chinese-aesthetic/render/evidence/rev13-r314-selftest-stderr.log`

提交时用 `git add -f`（.log 被 .gitignore 忽略）。

## 3. 日志 SHA 验证

提交后独立计算：
```bash
sha256sum evidence/rev13-r314-selftest-stdout.log
# 与 binding.evidence_telemetry.stdout_sha256 比对
```

## 4. 故障注入日志

在隔离 Worktree 中篡改 golden bin 后运行 harness，将失败日志保存为：
- `rev13-r314-failure-injection-stdout.log`
- `rev13-r314-failure-injection-stderr.log`

## 5. T4 Delta 审计

源码冻结提交 → 证据提交，运行 verify-freeze-evidence-delta.sh。
