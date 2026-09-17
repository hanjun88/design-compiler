# B4-EM-03 Command Error Semantics Hardening

## Goal

修复 `check_protected_zones()` 中 Git 命令错误处理未闭环问题。审查席 P0-SEC 发现：两条核心检测命令 (`git diff --quiet`, `git ls-files`) 抑制 stderr 且未显式区分命令执行错误与检测结果。特别是 `git ls-files` 失败时输出为空，会被 `[[ -n "$untracked" ]]` 误判为 clean（fail-open 安全漏洞）。

## 问题分析

### 修复前代码（B4 主动阻断门 1f76322）

```bash
if ! git -C "$WORKSPACE_ROOT" diff --quiet HEAD -- "$zone" 2>/dev/null; then
  # 篡改检测 — 但 git diff 命令本身失败也会进入这里 (rc!=0)
  tampered=1
fi
untracked="$(git -C "$WORKSPACE_ROOT" ls-files --others --exclude-standard -- "$zone" 2>/dev/null)"
if [[ -n "$untracked" ]]; then
  # 未跟踪文件检测 — 但 git ls-files 失败时空输出 = 误判 clean
fi
```

### 缺陷

| 命令 | 退出码语义 | 修复前处理 | 风险 |
|---|---|---|---|
| `git diff --quiet` | 0=无差异, 1=有差异, 其他=命令错误 | `if !` 把 rc!=0 全当作篡改 | 命令错误被误报为篡改（fail-closed，但语义错误） |
| `git ls-files` | 0=成功(可能空输出), 非零=命令错误 | 仅检查输出非空 | 命令错误→空输出→误判 clean（**fail-open，P0-SEC**） |

## Requirements

- R1: `git diff --quiet` 退出码显式三态处理：0=CLEAN, 1=TAMPERING, 其他=COMMAND_ERROR
- R2: `git ls-files` 退出码显式检查：非零=COMMAND_ERROR，不再仅依赖输出非空
- R3: 三种状态明确区分：`PASS` / `FAIL(PROTECTED_ZONE_TAMPERING)` / `FAIL(BLOCKED_ENV_COMMAND_ERROR)`
- R4: COMMAND_ERROR 优先于 TAMPERING（命令出错时检测结果不可信，直接 BLOCKED_ENV）
- R5: funnel exit 2 消息动态反映实际状态（不再硬编码 PROTECTED_ZONE_TAMPERING）
- R6: 故障注入测试验证异常路径（git 命令失败 → BLOCKED_ENV_COMMAND_ERROR → exit 2）

## 提交策略（两阶段，同 B4-EM-02）

```
阶段 1: 提交 harness 修改 (check_protected_zones + funnel)
  → HEAD 推进至 commit-H
阶段 2: 在 commit-H 干净状态上重跑 harness
  → 重新生成 binding JSON (head_commit=commit-H)
  → 提交 regenerated binding 为证据提交 commit-E
```

## Acceptance Criteria

### AC1: 代码修改正确
- `git diff` 退出码显式捕获到变量 `diff_rc`，三态判断
- `git ls-files` 退出码显式检查 `$?`
- `STATUS_PROTECTED_ZONE` 可设为三种值之一
- bash -n PASS, shellcheck RC=0, git diff --check PASS

### AC2: 正常路径 — 干净工作树
- 保护区无修改 → STATUS_PROTECTED_ZONE="PASS" → harness exit 0

### AC3: 正常路径 — 篡改检测
- 保护区文件修改 → STATUS_PROTECTED_ZONE="FAIL(PROTECTED_ZONE_TAMPERING)" → harness exit 2
- 输出包含被篡改文件路径

### AC4: 异常路径 — Git 命令故障注入
- 模拟 git 命令失败（WORKSPACE_ROOT 指向不存在目录或 GIT_DIR 无效）
- STATUS_PROTECTED_ZONE="FAIL(BLOCKED_ENV_COMMAND_ERROR)"
- harness exit 2
- 不得被误判为 clean（fail-open 已修复）

### AC5: funnel 退出消息动态化
- exit 2 时输出实际 STATUS_PROTECTED_ZONE 值（TAMPERING 或 BLOCKED_ENV_COMMAND_ERROR）

### AC6: binding JSON 重新生成
- head_commit_at_source_freeze = 阶段 1 提交 SHA
- verification_matrix.protected_zone = "PASS"
- 11 字段全 PASS, funnel_verdict=PASS

### AC7: AC8 联合探针重跑
- B2: PASS
- B4 干净: exit 0
- B4 篡改: exit 2
- B4 命令故障: exit 2 (BLOCKED_ENV_COMMAND_ERROR)
- DC-PB-004 一致性: PASS
- 双仓 Git 对账: PASS

### AC8: 变更范围
- 阶段 1: 仅 harness.sh 1 文件
- 阶段 2: 仅 evidence/ 目录下的 binding + logs

## Constraints
- 追加提交模式，禁止 amend
- trellis 完整流程
- 不修改保护区内任何文件
- 不修改 DC-PB / B2 内容
- 故障注入测试必须在隔离环境中执行，不得污染 design-compiler 工作区
