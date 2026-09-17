# REV-13 R3.20: P1 Evidence HEAD Correction + Policy Declarations

## Goal

修复审查席 R3.19 裁定中升级为 P1 的"发现 A"：R3.19 证据日志记录 `HEAD_AT_TEST=a55c67f`，但归档守卫代码在 `df5b143`（R3.19 源码冻结）才引入——a55c67f 时守卫不存在，日志无法证明 R3.19 提交内容被测试。这是 R3.17 式"证据对象错误"回归。

R3.20 在最终 HEAD `3e2aabe` 的干净状态下重新执行归档守卫测试，生成 HEAD 正确的证据日志，作为追加提交（不 amend）。同时补齐审查席要求的 P1/P2 政策声明与审计脚本。

## Requirements

### R1: P0 — 证据 HEAD 修正（发现 A 方案 1）
- 在 HEAD=3e2aabe 状态下重新执行两个归档脚本（r34 + r32）
- 生成新证据日志，记录 `HEAD_AT_TEST=3e2aabe`（而非 a55c67f）
- 日志包含：执行时间戳、HEAD、两个脚本的 exit code（均应为 2）、stdout/stderr 内容、无 worktree/tmp 残留验证
- 作为追加提交（不 amend），遵循 R3.18 确立的"追加提交 + 独立 delta 审计"模式

### R2: P1 — 入口可达性审计脚本完整实现
- 创建独立可执行脚本 `playbooks/verification/rev13-r320-entry-reachability-audit.sh`
- 搜索范围：全仓活跃代码（排除 .git/、.trellis/、tests/.../evidence/）
- 搜索目标：`rev13-r34-isolated-audit.sh` 和 `rev13-r32-verification-harness.sh` 的直接引用
- 排除规则：归档文件自身的自引用、trellis 文档中的规划引用、evidence 日志中的历史记录
- 输出格式：结构化 `[ACTIVE_REFERENCE_FOUND]` 或 `NO_ACTIVE_REFERENCES`
- 退出码：0 = 零活跃引用，1 = 发现活跃引用

### R3: P1 — exit 2 语义定义
- 声明 exit 2 = BLOCKED_ENV（环境阻断/非法操作拦截）
- 归档脚本触发守卫返回 exit 2 符合"发现非法调用立即阻断"语义
- 在证据日志中明确记录此语义定义

### R4: P1 — 版本字符串策略声明
- 确立方案 A：归档迭代不更新活跃脚本版本字符串
- 依据：R3.19 仅归档遗留文件，未修改活跃生产脚本；强制更新版本号会导致下游签名校验假性失效
- 版本号仅在实质逻辑发生突变时同步递增
- 在证据日志中记录此策略

### R5: P2 — registry_version DEFERRED_UNRESOLVED 登记
- 将残留 #3（registry_version `1.7.0-REV-13-R3.11`）正式标记为 DEFERRED_UNRESOLVED
- 触发条件：下一次注册表结构性变更时同步更新 registry_version
- 在门禁追踪矩阵中永久保留，不用"未来承诺"掩盖"当前未解决"

### R6: 门禁维持
- 全程维持 STEP 5.2-B NOT APPROVED / STEP 5.2-C LOCKED / BLOCKED_ENV MAINTAINED
- 保护区零差异

## Acceptance Criteria

- [ ] AC1: 新证据日志记录 HEAD_AT_TEST=3e2aabe（非 a55c67f）
- [ ] AC2: 两个归档脚本在 3e2aabe 下均返回 exit code 2
- [ ] AC3: 入口可达性审计脚本存在且可执行，输出 ACTIVE_REFERENCES=0
- [ ] AC4: exit 2 语义在证据日志中明确定义为 BLOCKED_ENV
- [ ] AC5: 版本字符串策略（方案 A）在证据日志中声明
- [ ] AC6: registry_version 标记为 DEFERRED_UNRESOLVED
- [ ] AC7: 新证据作为追加提交（不 amend），全范围 delta 审计零源码越界
- [ ] AC8: 保护区零差异
- [ ] AC9: trellis 完整流程执行

## Constraints

- 追加提交模式，禁止 amend（R3.18 SOP）
- 禁止 git stash
- .log 文件提交必须 git add -f
- 不修改活跃验证链脚本（selftest / r311 harness）
- 双轨原则维持
