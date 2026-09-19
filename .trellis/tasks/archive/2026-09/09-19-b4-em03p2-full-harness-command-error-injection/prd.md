# B4-EM-03P2 Full-Harness Command-Error Injection

## Goal

审查席 STEP 5.2-B 重评裁定：隔离函数测试 ≠ 完整 Harness 内部验证，`full_harness_command_error_replay: NOT_PROVEN`。本任务通过**选择性故障注入**（fake git shim）在完整 Harness 内部物理触发 Git 命令错误，闭环审查席 4 项要求。

## 审查席 4 项要求 → 本任务映射

| # | 要求 | 本任务验证方法 |
|---|---|---|
| 1 | git diff 返回码>1 → BLOCKED_ENV_COMMAND_ERROR | fake git 拦截 `git -C <root> diff --quiet` 返回 128 → 完整 harness 内断言 STATUS=FAIL(BLOCKED_ENV_COMMAND_ERROR) |
| 2 | git ls-files 非零 → 不误判 clean | fake git 拦截 `git -C <root> ls-files --others` 返回 128 → 断言进入 COMMAND_ERROR 而非 PASS |
| 3 | 与最终 Funnel 状态映射一致 | 断言 exit=2 且 FINAL_EXIT_CODE 消息携带 BLOCKED_ENV_COMMAND_ERROR |
| 4 | 限制明确标注，不宣称全链路 | 探针输出中保留 P5 限制声明 + 新增"选择性注入 vs 全局失效"的方法论说明 |

## 方案设计：选择性故障注入（突破 P5 限制）

P5 原声明"完整 Harness 无法注入 command-error"基于**全局 git 失效**（harness 开头 `git rev-parse --show-toplevel` 先失败 exit 1，到不了 check_protected_zones）。

**选择性注入**方案：fake git shim 仅拦截 `diff --quiet` 或 `ls-files --others` 子命令返回 128，其余（rev-parse / cat-file / diff --name-status 等）透传真实 git。harness 正常启动并执行到首个阶段 check_protected_zones()，在该函数内部真实触发 command-error 路径。

```
真实 git 调用链:
  git -C <root> diff --quiet HEAD -- <zone>      → shim 拦截 → rc=128 → diff_rc=128 → COMMAND_ERROR
  git -C <root> ls-files --others ... -- <zone>  → shim 拦截 → rc=128 → if ! 捕获 → COMMAND_ERROR
  其他 git 调用                                   → 透传真实 git → 正常
```

## 三场景矩阵

| 场景 | 注入变量 | 预期 exit | 预期 STATUS_PROTECTED_ZONE |
|---|---|---|---|
| S1: clean-control | 无注入 | 0 | PASS |
| S2: inject-diff | INJECT_DIFF=1 | 2 | FAIL(BLOCKED_ENV_COMMAND_ERROR) |
| S3: inject-ls-files | INJECT_LSFILES=1 | 2 | FAIL(BLOCKED_ENV_COMMAND_ERROR) |

## 探针脚本要求

- `playbooks/verification/rev13-b4-em03-command-error-injection-probe.sh`
- 自包含：创建临时 shim 目录 → 生成 fake git → 以 PATH 前置方式运行完整 harness → 断言 exit code + STATUS → 清理
- 每个场景输出：EXPECTED_EXIT / ACTUAL_EXIT / STATUS / PASS/FAIL
- 捕获 harness 完整 stdout+stderr 到场景日志
- 输出保存至 `tests/chinese-aesthetic/render/evidence/rev13-b4-em03-command-error-injection-probe.log`

## Acceptance Criteria

- AC1: 脚本 bash -n PASS, shellcheck RC=0
- AC2: S1 clean-control: harness exit 0（证明 shim 不破坏正常路径）
- AC3: S2 inject-diff: harness exit 2, STATUS=FAIL(BLOCKED_ENV_COMMAND_ERROR), 输出含 FAKE_GIT 触发消息 + PROTECTED_ZONE_COMMAND_ERROR(git diff rc=128)
- AC4: S3 inject-ls-files: harness exit 2, STATUS=FAIL(BLOCKED_ENV_COMMAND_ERROR), 输出含 FAKE_GIT 触发消息 + PROTECTED_ZONE_COMMAND_ERROR(git ls-files)
- AC5: Funnel 映射一致：FINAL_EXIT_CODE=2 (FAIL(BLOCKED_ENV_COMMAND_ERROR))
- AC6: 限制声明保留：输出含 P5 限制 + 选择性注入方法论说明
- AC7: 日志提交 evidence/（git add -f），脚本+日志+trellis 全链提交推送

## Constraints
- 追加提交模式，禁止 amend
- trellis 完整流程
- fake git shim 仅拦截目标子命令，必须透传其余调用
- 场景间必须清理（恢复 evidence/ 工作区）
- 不修改 harness / lib / 保护区任何文件
