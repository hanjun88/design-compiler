# REV-13 R3.19: Legacy Harness Archival & Entry Reachability Audit

## Goal

审查席 R3.18 终审裁定：`rev13-r34-isolated-audit.sh` 直接调用已废弃的 `rev13-r32-verification-harness.sh`（版本停留在 `1.6.4-REV-13-R3.9`），判定为 **FAIL/OPEN**，不得降级为 LOW 直接接受。

R3.19 采用审查席指定的**方案 B（正式归档旧入口）**，将 r34 隔离审计入口与 r32 旧 harness 正式标记为历史归档，添加防误调用守卫，执行入口可达性审计确认零活跃路径，并重新验证全仓版本残留清剿。

## Background

- `rev13-r34-isolated-audit.sh` 创建于 R3.4（commit c32e357），此后 14 轮从未更新。
- `rev13-r32-verification-harness.sh` 最后更新于 R3.9（commit 115c648），版本 `1.6.4-REV-13-R3.9`。
- 当前活跃 harness 为 `rev13-r311-verification-harness.sh`（`1.7.7-REV-13-R3.18`，11 阶段架构）。
- r34 的设计（简单 harness 调用 + 旧证据文件命名）与 r311 的 11 阶段复杂架构不兼容，升级成本高于归档价值。
- r34 无任何活跃代码引用；仅在 R3.5 历史 trellis 任务文档中被提及。
- 隔离 worktree 执行模式已由 R3.18 统一 T4 脚本（`/tmp/r318-unified-t4.sh`）替代。

## Requirements

### R1: 正式归档标记
- 在 `rev13-r34-isolated-audit.sh` 头部添加明确的 `DEPRECATED / ARCHIVED` 声明块，包含：归档日期、归档原因、替代工具（r311 harness）、禁止执行警告。
- 在 `rev13-r32-verification-harness.sh` 头部添加相同的归档声明块。

### R2: 防误调用守卫
- 在 r34 脚本的 `set -euo pipefail` 之后、任何实质性操作之前，插入 DEPRECATED 守卫：向 stderr 打印归档警告与替代指引，以退出码 `2`（`EDEPRECATED`）终止执行。
- 在 r32 harness 的相同位置插入相同守卫。
- 守卫必须在任何 git worktree 操作、文件写入或 harness 调用之前触发。

### R3: 入口可达性审计
- 执行全仓 grep 审计，确认无任何活跃脚本（`*.sh`、`*.py`、`*.js`）、配置文件或当前 trellis 任务引用 r34 或 r32。
- 历史 trellis 归档文档中的引用不计为活跃路径，但需在审计报告中明确列出。
- 输出结构化可达性审计结果：`ACTIVE_REFERENCES=0`，`HISTORICAL_REFERENCES=N`。

### R4: 版本残留重新验证
- 重新执行全仓版本残留搜索（`REV-13-R3.` 排除 `R3.18`）。
- 确认 r32 harness 中的 `1.6.4-REV-13-R3.9` 不再出现在任何可执行路径中（守卫使其不可达）。
- 确认活跃验证链（selftest + r311 harness + binding）版本完全同步至 R3.18。
- 残留 #3（registry_version `1.7.0-REV-13-R3.11`）继续递延，但在本任务中明确记录责任归属与目标版本。

### R5: 门禁维持
- 全程维持 STEP 5.2-B NOT APPROVED / STEP 5.2-C LOCKED / BLOCKED_ENV MAINTAINED。
- 保护区（compiler-core/ evaluation/ schemas/）零差异。
- 不单方面解除任何门禁。

## Acceptance Criteria

- [ ] AC1: r34 与 r32 均包含 DEPRECATED 归档声明块（头部注释）
- [ ] AC2: r34 与 r32 均包含防误调用守卫，执行时以 exit code 2 终止并打印归档警告
- [ ] AC3: 守卫在任何实质性操作（git worktree / 文件写入 / harness 调用）之前触发
- [ ] AC4: 入口可达性审计确认 ACTIVE_REFERENCES=0
- [ ] AC5: 版本残留重新验证通过，活跃链全部为 R3.18
- [ ] AC6: 保护区零差异（compiler-core/ evaluation/ schemas/）
- [ ] AC7: 所有变更通过 shellcheck（含 SC2015 disable 规则）
- [ ] AC8: 提交仅包含目标文件，不触碰预存 dirty 文件
- [ ] AC9: trellis 完整流程执行（create → prd → start → implement → check → commit → finish → archive）

## Constraints

- 禁止 git stash，隔离用 `git worktree add --detach`。
- 禁止删除用户预存 dirty 文件（playbooks/README.md 等）。
- `.log` 文件提交必须 `git add -f`。
- shellcheck-py 0.11.0 对 info 级 SC2015 返回 RC=1，新增 `A && B || { C; }` 模式时需在文件顶部 `# shellcheck disable=SC2015`。
- 提交真实源码差异，禁止设计片段。
- 双轨原则：RENDER-07C 独立开展，不反向证明 REV-13 封签。
