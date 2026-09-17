# Design: REV-13 R3.16

## 1. Binding HEAD 语义字段

在 harness 的 jq 模板中增加：
```json
"binding_generation_context": "generated inside isolated worktree checked out at head_commit_at_source_freeze; current_head_at_binding records worktree HEAD at execution time, NOT the eventual evidence commit"
```

## 2. Golden frame 错误日志捕获

执行流程修正：
1. 隔离 worktree 中运行正常 harness → 归档正常日志 + binding
2. 篡改 golden bin → 运行故障注入 harness → **立即**将 evidence 目录中的 golden-frame-stderr.log 复制为 failure-golden-frame-stderr.log（此时包含失败原因）
3. 恢复 bin → 运行正常 harness → 恢复干净 binding（覆盖正常日志，但 failure-golden-frame-stderr.log 不受影响）

## 3. T4 审计范围

证据提交后，以 `git rev-parse HEAD` 为终点重新运行 T4，覆盖日志文件。

## 4. 版本号
1.7.5-REV-13-R3.16，日志文件名 r316-*
