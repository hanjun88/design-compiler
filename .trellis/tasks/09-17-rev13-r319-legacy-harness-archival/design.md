# R3.19 Technical Design — Legacy Harness Archival

## 1. Architecture Decision: Option B (Formal Archival)

### 1.1 Why not Option A (upgrade r34 to r311 harness)

| Factor | Analysis |
|---|---|
| Compatibility | r34 设计用于简单 harness（bash -n → shellcheck → selftest → binding），r311 为 11 阶段架构（含 golden frame JS 验证、blob OID 对账、temporal invariance、log archive、atomic binding write），r34 的证据复制逻辑（行 56-66，引用 `rev13-r3-bash-n.log` 等旧命名）与 r311 输出完全不匹配 |
| Maintenance cost | 升级需重写 r34 的证据收集、hash 计算、文件复制全部逻辑，并新增 node 运行时依赖检测 |
| Active usage | r34 自 R3.4 后 14 轮未被任何活跃代码调用；隔离 worktree 模式已由 R3.18 统一 T4 脚本替代 |
| Risk | 升级一个无人使用的工具引入新 bug 的风险 > 归档的零风险 |

### 1.2 Archival Pattern

采用**原地归档（in-place archival）**而非文件移动：

- **不移动文件**：保持 git 历史连续性，`git log --follow` 可追溯。
- **头部声明块**：明确标记 DEPRECATED，包含元数据。
- **早期退出守卫**：脚本被调用时立即终止，防止任何实质性操作。
- **退出码约定**：`2` = EDEPRECATED（区别于 `1` = 通用错误，`0` = 成功）。

## 2. File-Level Changes

### 2.1 `playbooks/verification/rev13-r34-isolated-audit.sh`

**变更前结构**（82 行）：
```
#!/usr/bin/env bash
# REV-13 R3.4 Isolated Clean Worktree Audit Runner
# Protocol: ...
set -euo pipefail
REPO_ROOT=...
... (worktree create → harness run → evidence copy → cleanup)
```

**变更后结构**：
```
#!/usr/bin/env bash
# ==============================================================================
# DEPRECATED / ARCHIVED — DO NOT EXECUTE
# ... (archival metadata block)
# ==============================================================================
set -euo pipefail

# DEPRECATED GUARD: terminate before any substantive operation
echo "..." >&2
exit 2

# --- 以下为历史归档代码，不可达 ---
REPO_ROOT=...
... (original code preserved for git history)
```

**关键设计点**：
- 守卫位于 `set -euo pipefail` 之后，确保 `set -e` 生效时 `exit 2` 正常传播。
- 守卫位于所有变量定义和 git 操作之前。
- 原始代码完整保留（不删除），仅变为不可达，便于 `git blame` 和历史追溯。
- 守卫消息包含：文件状态、归档轮次、替代工具、退出码。

### 2.2 `playbooks/verification/rev13-r32-verification-harness.sh`

相同模式：头部归档声明块 + `set -euo pipefail` 后的 DEPRECATED 守卫 + 原始代码保留为不可达。

**注意**：r32 harness 顶部已有 `# shellcheck disable=SC2015`（如果存在），归档声明块应在 shebang 之后、shellcheck disable 之前或之后保持一致。需先读取确认。

## 3. Entry Reachability Audit Methodology

```bash
# 活跃代码引用（排除 .git/、__pycache__、历史 trellis archive/）
grep -rn "r34-isolated-audit\|r32-verification-harness" \
  playbooks/ scripts/ tests/ schemas/ compiler-core/ evaluation/ \
  --include='*.sh' --include='*.py' --include='*.js' --include='*.ts' \
  --include='*.json' --include='*.yaml' --include='*.yml' \
  | grep -v '.trellis/tasks/archive/' \
  | grep -v '__pycache__'

# 历史引用（仅 trellis archive/）
grep -rn "r34-isolated-audit\|r32-verification-harness" \
  .trellis/tasks/archive/ 2>/dev/null
```

**判定规则**：
- 活跃目录（playbooks/ scripts/ tests/ 等）中出现 → ACTIVE_REFERENCE（FAIL）
- 仅 `.trellis/tasks/archive/` 中出现 → HISTORICAL_REFERENCE（PASS，需记录）
- 目标文件自身的自引用（r32 内部 `HARNESS_REL=...r32...`）不计为外部引用

## 4. Version Residual Re-verification

同 R3.18 物理核验第 4 项的搜索范围，但增加守卫有效性验证：

```bash
# 1. 全仓版本残留
grep -rn "REV-13-R3\." playbooks/ scripts/ tests/ schemas/ compiler-core/ evaluation/ \
  --include='*.sh' --include='*.js' --include='*.ts' --include='*.md' --include='*.json' \
  | grep -v 'R3.18' | grep -v '.git/' | grep -v '__pycache__'

# 2. 守卫有效性：执行 r34 和 r32，确认 exit code = 2 且无实质性操作
bash playbooks/verification/rev13-r34-isolated-audit.sh; echo "r34_exit=$?"
bash playbooks/verification/rev13-r32-verification-harness.sh; echo "r32_exit=$?"

# 3. 活跃链版本确认
grep -n "SCRIPT VERSION\|AUDIT_ENGINE_VERSION\|audit_engine_version" \
  playbooks/verification/verify-pipeline-artifacts.sh \
  playbooks/verification/rev13-r311-verification-harness.sh \
  tests/chinese-aesthetic/render/evidence/rev13-r3-version-binding.json
```

## 5. Registry Version Deferral Record

残留 #3（`registry_version: "1.7.0-REV-13-R3.11"`）继续递延，在本任务中记录：

- **责任归属**：注册表结构版本号反映最后一次结构性变更（R3.11 引入逐项 expected_events），后续轮次（R3.12-R3.18）均未改变注册表结构，仅修改验证脚本逻辑。
- **目标版本**：下一次注册表结构性变更时同步更新 `registry_version` 至对应轮次。
- **当前状态**：DEFERRED，不构成 R3.19 的阻断项。

## 6. Protected Zone Verification

```bash
git diff --name-status 86df17e HEAD -- compiler-core/ evaluation/ schemas/
# 预期：空输出（零差异）
```

## 7. Shellcheck Compliance

- r34 和 r32 新增守卫代码需通过 `shellcheck -x`。
- 若文件顶部无 `# shellcheck disable=SC2015`，且守卫代码不涉及 `A && B || { C; }` 模式，则无需添加。
- 守卫代码本身为简单的 `echo >&2` + `exit 2`，无 shellcheck 风险。
