# B4-EM-03P1 Dedicated Command Error Probe

## Goal

审查席 GitHub 独立复核确认 `73f3685` 代码修复和 `7536c34` Binding 一致性，但裁定 `dedicated_command_error_probe: NOT_INDEPENDENTLY_CONFIRMED`。`rev13-r318-selftest-stdout.log` 记录 33 项测试 PASS 但未展示 B4-EM-03 专用的 git diff / git ls-files 保护区命令故障探针。

本任务创建正式的、可独立重放的专项探针脚本，运行并捕获完整 stdout/stderr，将脚本+日志提交为可追溯证据。

## Probe Coverage

### P1: 隔离函数三态测试（从 harness 提取 check_protected_zones）

| 场景 | 环境 | 预期 STATUS | 预期 rc |
|---|---|---|---|
| CLEAN | 临时空 git 仓库，保护区无文件 | `PASS` | 0 |
| TAMPERING (unstaged) | 临时仓库 + 保护区内未跟踪文件 | `FAIL(PROTECTED_ZONE_TAMPERING)` | 1 |
| TAMPERING (staged) | 临时仓库 + 保护区文件已 git add | `FAIL(PROTECTED_ZONE_TAMPERING)` | 1 |
| COMMAND_ERROR | WORKSPACE_ROOT=/nonexistent | `FAIL(BLOCKED_ENV_COMMAND_ERROR)` | 1 |

### P2: set -e 安全性验证

- 函数在 if-guard 中返回非零时，调用者不被 set -e 杀死
- 函数返回后 STATUS_PROTECTED_ZONE 保持正确值
- 验证 `|| diff_rc=$?` 模式在 set -e 下安全（git diff rc=1 不杀死脚本）

### P3: git ls-files fail-open 专项证明

- 修复前：git ls-files 失败 → 空输出 → `[[ -n ]]` false → 误判 clean
- 修复后：git ls-files 失败 → `if !` 捕获 → BLOCKED_ENV_COMMAND_ERROR
- 通过 WORKSPACE_ROOT=/nonexistent 场景证明 git ls-files 失败被正确检测

### P4: 完整 Harness 路径验证

| 场景 | 预期 |
|---|---|
| 干净工作树 | exit 0, 12 阶段全 PASS, protected_zone=PASS |
| 保护区篡改 (types.ts) | exit 2, PROTECTED_ZONE=FAIL(PROTECTED_ZONE_TAMPERING), fail-fast, 动态退出消息 |

### P5: 完整 Harness 命令故障路径说明

- 完整 harness 级别 git 命令故障注入不可行：harness 开头 `git rev-parse --show-toplevel` 会先失败并 exit 1，无法到达 check_protected_zones
- 命令错误语义由隔离函数测试（P1）权威证明
- 此限制在探针输出中明确声明

## Acceptance Criteria

- AC1: 探针脚本 `playbooks/verification/rev13-b4-em03-command-error-probe.sh` 存在，bash -n PASS, shellcheck RC=0
- AC2: 探针可独立重放（不依赖特定工作区状态，使用临时目录）
- AC3: 三态测试全部通过：CLEAN=PASS, TAMPERING=FAIL(PROTECTED_ZONE_TAMPERING), COMMAND_ERROR=FAIL(BLOCKED_ENV_COMMAND_ERROR)
- AC4: set -e 安全性验证通过
- AC5: 完整 harness 干净路径 exit 0
- AC6: 完整 harness 篡改路径 exit 2
- AC7: 探针完整 stdout/stderr 保存为 `tests/chinese-aesthetic/render/evidence/rev13-b4-em03-command-error-probe.log`
- AC8: 脚本和日志均提交并推送
- AC9: 探针输出包含每个场景的 ACTUAL_STATUS / ACTUAL_RC / EXPECTED 对比

## Constraints
- 追加提交模式，禁止 amend
- trellis 完整流程
- 探针使用临时目录，不污染 design-compiler 工作区
- 完整 harness 测试后必须恢复工作区（git checkout）
- 不修改 harness 或任何保护区文件
