# R3.19 Implementation Plan

## Phase 1: Pre-implementation Verification

1. 确认当前 HEAD = a55c67f，工作区状态（预存 dirty 文件不触碰）
2. 读取 r32 harness 完整头部，确认 shellcheck disable 规则位置
3. 确认 r34 和 r32 的当前行数与结构

## Phase 2: Implementation

### Step 2.1: Archive r34-isolated-audit.sh
- 在 shebang 后插入 DEPRECATED 归档声明块
- 在 `set -euo pipefail` 后插入 DEPRECATED 守卫（echo >&2 + exit 2）
- 原始代码完整保留，变为不可达

### Step 2.2: Archive r32-verification-harness.sh
- 同上模式
- 注意保留已有的 `# shellcheck disable=SC2015`（如存在）

### Step 2.3: Guard Effectiveness Test
- 执行 `bash rev13-r34-isolated-audit.sh`，确认 exit code = 2
- 执行 `bash rev13-r32-verification-harness.sh`，确认 exit code = 2
- 确认守卫消息包含归档警告与替代指引
- 确认执行后无 git worktree 残留、无文件写入

## Phase 3: Verification

### Step 3.1: Shellcheck
- `shellcheck -x playbooks/verification/rev13-r34-isolated-audit.sh`
- `shellcheck -x playbooks/verification/rev13-r32-verification-harness.sh`
- 确认 RC=0（或仅有已知的 SC2015 info 且已 disable）

### Step 3.2: Entry Reachability Audit
- 全仓 grep r34/r32 引用
- 确认 ACTIVE_REFERENCES=0
- 记录 HISTORICAL_REFERENCES（trellis archive/ 中的引用）

### Step 3.3: Version Residual Re-verification
- 全仓版本残留搜索（排除 R3.18）
- 确认活跃链全部为 R3.18
- 确认 r32 的 1.6.4-R3.9 仅存在于不可达代码中

### Step 3.4: Protected Zone
- `git diff --name-status 86df17e HEAD -- compiler-core/ evaluation/ schemas/`
- 确认零差异

### Step 3.5: Diff Scope
- `git diff --name-status` 确认仅修改目标 2 个文件 + trellis 任务文件
- 不触碰 playbooks/README.md 等预存 dirty 文件

## Phase 4: Commit & Trellis Finish

### Step 4.1: Source Freeze Commit
- `git add playbooks/verification/rev13-r34-isolated-audit.sh playbooks/verification/rev13-r32-verification-harness.sh`
- 提交信息：`R3.19 源码冻结 (legacy harness archival + DEPRECATED guards)`

### Step 4.2: Evidence Generation
- 生成守卫有效性测试日志
- 生成入口可达性审计日志
- 生成版本残留重新验证日志
- `git add -f` 所有 .log 文件
- 提交信息：`R3.19 证据 (guard effectiveness + reachability audit + version residual)`

### Step 4.3: Trellis Artifacts
- `git add .trellis/tasks/09-17-rev13-r319-legacy-harness-archival/`
- 提交信息：`trellis R3.19 artifacts`

### Step 4.4: Trellis Finish & Archive
- `python3 .trellis/scripts/task.py finish`
- `python3 .trellis/scripts/task.py archive`
- `git add .trellis/tasks/archive/2026-09/09-17-rev13-r319-legacy-harness-archival/`
- 提交信息：`trellis archive R3.19`

### Step 4.5: Push
- `git push origin feature/chinese-aesthetic-render-pipeline`

## Phase 5: Final Report

- 汇总所有验证结果
- 明确门禁状态（维持）
- 提交 R3.19 终审证据摘要供审查席复核
