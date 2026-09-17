# B4 Active Enforcement Gate — 保护区运行时主动阻断门

## Goal

在 `rev13-r311-verification-harness.sh` 中实现运行时保护区主动阻断门。当受保护目录相对于基线 HEAD 存在任何篡改（staged / unstaged / untracked）时，harness 必须在首个阶段主动 FAIL，并通过统一退出漏斗输出 distinct exit code 2 (PROTECTED_ZONE_TAMPERING)。

## 背景与问题

Probe 2 对抗性测试确凿证明：在 `chinese-aesthetic/scene-contract/types.ts` 被恶意篡改的情况下，harness 11 阶段全部 PASS 且 EXIT_CODE=0。根因是 B4 仅修改了 `SOURCE_FREEZE_VERIFIED_BY` 记录字符串（写入 binding JSON），未实现任何运行时主动检查。

## Scope

### 保护区范围（4 个目录）
- `compiler-core/`
- `evaluation/`
- `schemas/`
- `chinese-aesthetic/scene-contract/`

### 基线语义
- **baseline**: `HEAD`（当前提交）
- **target**: 实际工作树（actual worktree）
- **检测范围**: staged 修改 + unstaged 修改 + untracked 文件
- **检测命令**: `git diff --quiet HEAD -- <zone>`（staged+unstaged）+ `git ls-files --others --exclude-standard -- <zone>`（untracked）
- **适用范围声明**: 本检查为运行时工作树完整性检查，非供应链完整性检查（不对比远程签名基线）。harness 自身位于 `playbooks/verification/`，不在保护区范围内，因此本次修复修改 harness 不会触发误报。

### 退出码契约
| Exit Code | 语义 | 触发条件 |
|---|---|---|
| 0 | PASS | 所有阶段通过 |
| 1 | GENERAL_FAILURE | 任一非保护区阶段失败 |
| 2 | PROTECTED_ZONE_TAMPERING | 保护区主动阻断门检测到篡改 |

### 不在范围内
- 不修改 `SOURCE_FREEZE_VERIFIED_BY` 字符串（记录层保持不变）
- 不修改其他 11 个阶段的逻辑
- 不修改 DC-PB playbook 内容
- 不修改 B2 跨仓绑定

## Implementation Design

### 插入位置
- 函数定义: `atomic_write_binding()` 之后（line 164），Stage A 之前
- 函数调用: Stage A（bash -n）之前（line 166），作为首个执行阶段
- 原因: WORKSPACE_ROOT / RUN_DIR / EXIT trap 均已就绪；fail-fast 原则

### 修改点清单
1. 状态账本新增 `STATUS_PROTECTED_ZONE="NOT_RUN"`
2. 新增 `PROTECTED_ZONES` 常量 + `check_protected_zones()` 函数
3. 首个阶段调用 `check_protected_zones`
4. `cleanup_and_funnel()` 新增 exit 2 分支（当 STATUS_PROTECTED_ZONE=FAIL 时）
5. funnel_verdict AND 条件新增 `STATUS_PROTECTED_ZONE == "PASS"`
6. 最终通过检查新增 `STATUS_PROTECTED_ZONE == "PASS"`
7. funnel 阶段账本打印新增 PROTECTED_ZONE 字段

### set -e 安全性
- `git diff --quiet` 在有差异时返回非零，使用 `if ! git diff --quiet ...; then` 包裹，避免 set -e 误触发
- 函数返回 1 时 set -e 触发 EXIT trap → funnel 处理退出码
- `git ls-files --others` 始终返回 0，安全

## Acceptance Criteria

### AC1: 干净工作树 → PASS
- 保护区无修改时，check_protected_zones 返回 0，STATUS_PROTECTED_ZONE="PASS"
- 完整 harness 执行通过，EXIT_CODE=0

### AC2: 保护区 unstaged 修改 → FAIL (exit 2)
- 修改 `chinese-aesthetic/scene-contract/types.ts`（追加注释）
- harness 立即在首个阶段 FAIL
- 输出包含 "PROTECTED_ZONE_TAMPERING" 和被篡改文件路径
- EXIT_CODE=2
- 后续阶段不执行（SELFTEST=NOT_RUN 等）

### AC3: 保护区 staged 修改 → FAIL (exit 2)
- `git add` 一个保护区文件的修改
- harness 检测到并 FAIL，EXIT_CODE=2

### AC4: 非保护区修改 → 不误报保护区违规
- 修改 `README.md`（非保护区）
- check_protected_zones 通过（STATUS_PROTECTED_ZONE="PASS"）
- 完整 harness 退出码由其他阶段决定，不因保护区检查误报

### AC5: 多保护区同时修改 → FAIL (exit 2)
- 同时修改 `schemas/` 和 `chinese-aesthetic/scene-contract/` 下的文件
- harness 检测到所有篡改并列出，EXIT_CODE=2

### AC6: 恢复工作树 → PASS
- AC2 后 `git checkout` 恢复篡改文件
- 重新运行 harness，全部通过，EXIT_CODE=0

### AC7: 命令错误传播 → BLOCKED_ENV
- 所有 git 调用使用 `git -C "$WORKSPACE_ROOT"`，异常时 set -e 触发 funnel

### AC8: shellcheck 通过
- 修改后 `shellcheck -x` 对 harness 返回 RC=0（顶部已有 disable=SC2015）

### AC9: 变更范围单一职责
- `git diff --stat` 仅包含 harness 一个文件
- `git diff --check` 无空白错误

## Constraints
- 追加提交模式，禁止 amend
- 仅修改 `playbooks/verification/rev13-r311-verification-harness.sh`
- 不修改保护区内任何文件
- 对抗性测试中产生的临时修改必须在测试后恢复
- trellis 完整流程: create → prd → start → implement → verify → commit → finish → archive
