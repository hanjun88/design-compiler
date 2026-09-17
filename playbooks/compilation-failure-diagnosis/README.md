# DC-PB-003: 编译失败诊断与恢复

## Purpose

在编译失败时快速定位根因，保护已有有效产物，建立可追溯的失败诊断和恢复流程。本 Playbook 是 DC-PB-001（Scene Compilation Contract 验收）的上游诊断方。

## Trigger

- 编译命令退出码非 0
- 输出目录不完整或损坏
- 资产校验失败
- 原子写入失败
- 任何标记为 FAIL 的编译节点

## Inputs

- 编译错误日志（stdout/stderr），位于 `<compile-log-stdout>` / `<compile-log-stderr>`
- 输入配置和资产清单（scene.json / manifest.json）
- 输出目录状态（`<output-dir>`）
- 历史成功产物（如有，通过 commit-hash.txt 识别）

## Preconditions

- 失败已被识别（退出码非 0 或校验失败）
- 错误日志已捕获（stdout/stderr 至少一个存在）
- 工作区状态可检查（git 可用）
- 工具链可用：grep / find / stat / git / jq / mktemp

## Success Criteria

| ID | 标准 | 对应 AC | 对应 Procedure Step |
|---|---|---|---|
| SC-1 | 失败状态已捕获（退出码、日志、git 状态、输出目录） | AC-1.1 ~ AC-1.4 | Step 1 |
| SC-2 | 已有有效产物未被覆盖或破坏（已备份保护） | AC-2.1 ~ AC-2.3 | Step 2 |
| SC-3 | 根因已定位（6 类诊断，非猜测） | AC-3.1 ~ AC-3.3 | Step 3 |
| SC-4 | 恢复条件明确（可重试/需修复输入/需人工介入） | AC-4.1 ~ AC-4.3 | Step 4 |
| SC-5 | 错误码和日志完整可追溯（诊断报告已归档） | AC-5.1 ~ AC-5.4 | Step 5 |
| SC-6 | 重试后走完整 DC-PB-001 验收（未跳过验证） | AC-6.1 ~ AC-6.4 | Step 6 |

## Outcome

PASS / FAIL / BLOCKED_ENV / NOT_RUN

- BLOCKED_ENV 和 NOT_RUN 永不报告为 PASS
- 内部错误（FC-6）永不自动重试
