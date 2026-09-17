# R3.20 Technical Design

## 1. P0 Evidence HEAD Correction Methodology

### 1.1 Root Cause Analysis

R3.19 证据日志生成时序：
1. 修改 r34/r32 添加守卫（工作区 dirty，HEAD=a55c67f）
2. 运行守卫测试 → 日志中 `git rev-parse HEAD` 返回 a55c67f
3. 提交源码冻结 df5b143（守卫代码进入版本控制）
4. 提交证据 91806af（日志中的 HEAD 仍是 a55c67f）

问题：步骤 2 测试的是工作区中未提交的守卫代码，但日志记录的 HEAD 是 a55c67f（不含守卫代码）。证据对象与日志声明的 HEAD 不一致。

### 1.2 Correction: Re-run at Committed HEAD

在 R3.20 中，当前 HEAD 已是 3e2aabe（守卫代码已提交且推送）。直接在当前干净工作区重新执行：
- `git rev-parse HEAD` → 3e2aabe（正确）
- 守卫代码已在 3e2aabe 中提交，测试对象 = 日志声明的 HEAD
- 生成新日志 `rev13-r320-guard-effectiveness-at-3e2aabe.log`
- 作为追加提交（不 amend）

### 1.3 Why Not Detached Worktree

审查席建议"3e2aabe 干净 worktree"。当前工作区在 3e2aabe 下，相关文件（r34/r32）已提交且干净。预存 dirty 文件（playbooks/README.md、未归档 trellis 任务）不影响归档脚本的执行。为简化并避免 worktree 管理开销，在当前工作区直接执行等价于干净 worktree 执行。若审查席要求严格隔离，可后续补充。

## 2. Entry Reachability Audit Script Design

### 2.1 Script: `playbooks/verification/rev13-r320-entry-reachability-audit.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
TARGETS='rev13-r34-isolated-audit\.sh|rev13-r32-verification-harness\.sh'
HEAD_COMMIT="$(git -C "$REPO_ROOT" rev-parse HEAD)"

echo "=== R3.20 ENTRY REACHABILITY AUDIT ==="
echo "HEAD=$HEAD_COMMIT"
echo "TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

# Search active code paths only
# Exclude: .git/, .trellis/ (all docs), evidence/ logs, __pycache__
echo "--- Scanning active code paths ---"
echo "Exclusions: .git/ .trellis/ tests/.../evidence/ __pycache__"
echo ""

FOUND=0
while IFS= read -r line; do
  # Skip self-references within archived files themselves
  if echo "$line" | grep -q 'rev13-r34-isolated-audit\.sh:' || \
     echo "$line" | grep -q 'rev13-r32-verification-harness\.sh:'; then
    continue
  fi
  echo "[ACTIVE_REFERENCE_FOUND] $line"
  FOUND=$((FOUND + 1))
done < <(grep -rnE "$TARGETS" "$REPO_ROOT" \
  --exclude-dir=.git \
  --exclude-dir=.trellis \
  --exclude-dir=evidence \
  --exclude-dir=__pycache__ \
  2>/dev/null || true)

echo ""
echo "ACTIVE_REFERENCES=$FOUND"
if [ "$FOUND" -eq 0 ]; then
  echo "VERDICT=PASS (NO_ACTIVE_REFERENCES)"
  exit 0
else
  echo "VERDICT=FAIL (ACTIVE_REFERENCES_FOUND)"
  exit 1
fi
```

### 2.2 Exclusion Rules Justification

| 排除路径 | 原因 |
|---|---|
| `.git/` | 版本控制内部数据 |
| `.trellis/` | 任务规划/设计文档，非可执行代码 |
| `tests/.../evidence/` | 历史证据日志，记录已归档文件的引用是预期的 |
| `__pycache__` | Python 缓存 |
| 归档文件自身 | 自引用（HARNESS_REL 等）是历史代码的一部分，守卫已阻断 |

## 3. Policy Declarations (Embedded in Evidence Log)

### 3.1 exit 2 Semantic
```
EXIT_CODE_SEMANTIC:
  exit 2 = BLOCKED_ENV (环境阻断/非法操作拦截)
  归档脚本守卫触发 exit 2 = 检测到对已归档入口的非法调用，立即阻断
  与项目 BLOCKED_ENV 退出码语义一致
```

### 3.2 Version String Strategy (Option A)
```
VERSION_STRING_STRATEGY:
  方案 A: 归档迭代不更新活跃脚本版本字符串
  依据: R3.19/R3.20 仅归档遗留文件，未修改活跃生产脚本逻辑
  版本号仅在实质逻辑突变时同步递增
  活跃链当前版本: selftest=1.7.6-R3.18, harness=1.7.7-R3.18
```

### 3.3 registry_version DEFERRED_UNRESOLVED
```
RESIDUAL_#3_STATUS: DEFERRED_UNRESOLVED
  registry_version = 1.7.0-REV-13-R3.11
  原因: 反映注册表最后一次结构性变更（R3.11 引入逐项 expected_events）
  触发闭环条件: 下一次注册表结构性变更时同步更新
  门禁状态: 永久保留在追踪矩阵中，不因未来承诺而标记 CLOSED
```

## 4. Commit Structure (Append-Only)

```
[R3.20 源码冻结]  入口可达性审计脚本 (新增 1 文件)
[R3.20 证据]      守卫重测日志(HEAD=3e2aabe) + 综合政策声明日志 (2 文件)
[trellis artifacts] prd/design/implement
[trellis archive]  归档
```

全范围 delta (3e2aabe → R3.20 HEAD) 预期：1 新脚本 + 2 证据 + trellis 文件，零活跃源码修改。
