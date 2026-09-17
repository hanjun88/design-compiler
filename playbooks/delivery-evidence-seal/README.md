# DC-PB-004: 交付证据与版本封签

## Purpose

确保交付结果可追溯、可复核、可审计，建立从代码提交到测试验证到版本封签的完整证据链。无物理执行物证不封签。

## Trigger

- Phase 完成时
- Golden Case 完成时
- RC 验收时
- 版本封签时
- 跨代理交接时

## Inputs

- Git 提交历史和当前 HEAD
- 分支和远程状态
- 测试命令与执行结果（stdout/stderr 日志）
- 变更文件清单（base commit → HEAD）
- 证据文件（日志、报告、校验输出）

## Preconditions

- 代码已提交（本地或远程）
- 测试已执行并捕获完整日志
- 工作区状态可检查
- 工具链可用：git / jq / sha256sum / stat / mktemp / node（TS 门禁，可选）

## Success Criteria

| ID | 标准 | 对应 AC | 对应 Procedure Step |
|---|---|---|---|
| SC-1 | Commit SHA 可追溯，工作树状态已记录 | AC-1.1 ~ AC-1.3 | Step 1 |
| SC-2 | 本地与远程版本差异明确，推送状态如实标注 | AC-2.1 ~ AC-2.4 | Step 2 |
| SC-3 | 测试数字绑定真实执行日志，commit-hash 一致 | AC-3.1 ~ AC-3.4 | Step 3 |
| SC-4 | TS 双轨门禁通过，口径分层表述 | AC-4.1 ~ AC-4.4 | Step 4 |
| SC-5 | 变更文件清单完整，保护区零变更 | AC-5.1 ~ AC-5.3 | Step 5 |
| SC-6 | 证据文件完整且 SHA-256 可独立复核 | AC-6.1 ~ AC-6.3 | Step 6 |
| SC-7 | 封签结论绑定具体证据，非自我声明 | AC-7.1 ~ AC-7.4 | Step 7 |

## Outcome

PASS / FAIL / BLOCKED_ENV / NOT_RUN

- BLOCKED_ENV 和 NOT_RUN 永不报告为 PASS
- PASS 时可签发 SEALED
