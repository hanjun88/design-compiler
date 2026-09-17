# Verification: 交付证据与版本封签

> 本 Playbook 是交付前的最终质量门禁。所有判定必须基于物理执行证据（git 命令原始输出、测试日志、TS 门禁输出、证据文件 SHA-256），不得以猜测或自我声明替代。
>
> README 中的 SC-N（Success Criteria）与本表的 AC-N.x 一一对应：SC-1 → AC-1.x，SC-2 → AC-2.x，依此类推。

## 代码块性质声明（与 procedure.md 一致）

本文档中的所有 shell 命令示例均为**可执行模板**：

- `<test-log>`、`<base-commit>`、`<branch>` 等尖括号占位符必须替换为实际值后执行
- 失败处理统一使用 `echo "ERROR_CODE" && exit 1`（或 `exit 2` 表示 BLOCKED_ENV）形式，**不再使用 `FAIL (ERROR_CODE)` 伪代码**；验收标准表格中的 `FAIL (ERROR_CODE)` 为状态说明，不是可执行命令
- 所有命令的退出码、stdout 和 stderr 必须原始留存

## 验收标准（Acceptance Criteria）

### AC-1: 代码提交状态（对应 SC-1）

| ID | 检查项 | PASS 条件 | FAIL 条件 | 错误码 |
|---|---|---|---|---|
| AC-1.1 | Commit SHA 已记录 | `git rev-parse HEAD` 已执行，SHA 已写入封签报告 | 未记录或 git 执行失败 → BLOCKED_ENV | GIT_REVPARSE_FAILED (BLOCKED_ENV) |
| AC-1.2 | 工作树状态已记录 | `git status --porcelain=v1` 已执行，变更文件数已统计 | 未记录或执行失败 → BLOCKED_ENV | GIT_STATUS_FAILED (BLOCKED_ENV) |
| AC-1.3 | 提交历史已记录 | `git log --oneline -5` 已执行并留存 | 未记录（非阻断，仅证据缺失） | — |

> AC-1.2 纪律：有未提交变更时必须记录 `UNCOMMITTED_CHANGES`，不得自动提交（提交是用户决策）。
> 未提交变更不阻断封签，但必须在报告中明确标注。

### AC-2: 远程同步状态（对应 SC-2）

| ID | 检查项 | PASS 条件 | FAIL 条件 | 错误码 |
|---|---|---|---|---|
| AC-2.1 | 远程 HEAD 已记录 | `git ls-remote origin <branch>` 已执行，远程 SHA 已记录 | 远程不可访问 → BLOCKED_ENV | REMOTE_INACCESSIBLE (BLOCKED_ENV) |
| AC-2.2 | fetch 已执行 | `git fetch origin <branch>` 退出码 0 | fetch 失败 → BLOCKED_ENV | GIT_FETCH_FAILED (BLOCKED_ENV) |
| AC-2.3 | 领先/落后数已计算 | `git rev-list --count` 双向计数已执行 | 计数失败 → 记录 UNKNOWN，不阻断 | REVLIST_FAILED (记录) |
| AC-2.4 | 推送状态如实标注 | 本地领先远程时标注 `NOT_PUSHED`，不得声称"已推送" | 声称已推送但实际未推送 → FAIL | FALSE_PUSH_CLAIM (FAIL) |

> AC-2.4 纪律：本地提交不等于远程推送。封签报告必须如实标注领先/落后数。
> "已交付"必须有远程 SHA 与本地 SHA 一致的物证。

### AC-3: 测试证据（对应 SC-3）

| ID | 检查项 | PASS 条件 | FAIL 条件 | 错误码 |
|---|---|---|---|---|
| AC-3.1 | 测试日志存在且非空 | stdout/stderr 日志文件存在，`stat -c %s` > 0 | 缺失或为空 → BLOCKED_ENV | TEST_LOG_MISSING / TEST_LOG_EMPTY (BLOCKED_ENV) |
| AC-3.2 | 测试通过/失败数可核对 | 日志中可解析出 passed/failed/total 数字 | 数字无法解析 → 记录 UNKNOWN | — |
| AC-3.3 | 测试失败数为 0 | `TEST_FAILED=0` | 失败数 > 0 → FAIL | TEST_FAILURES_DETECTED (FAIL) |
| AC-3.4 | commit-hash 一致 | 日志中捕获的 commit SHA == 当前 HEAD | 不一致且未重跑 → FAIL | COMMIT_HASH_MISMATCH (FAIL) |

> AC-3.1 纪律：测试日志必须是原始 stdout/stderr，不得是摘要或截图。
> 日志大小为 0 视为缺失。
>
> AC-3.4 纪律：日志捕获时的 commit SHA 必须与当前 HEAD 一致。
> 不一致意味着测试是在旧代码上跑的，必须在当前 HEAD 重跑。
> 日志中无 SHA 记录时，标注 `COMMIT_HASH_NOT_FOUND_IN_LOG`，不阻断但需人工确认。

### AC-4: TypeScript 双轨门禁（对应 SC-4）

| ID | 检查项 | PASS 条件 | FAIL 条件 | 错误码 |
|---|---|---|---|---|
| AC-4.1 | TS 门禁脚本已执行 | `node scripts/verify-baseline-ts.mjs` 已执行，stdout/stderr 已留存 | 脚本不存在 → 记录 NOT_RUN（不阻断） | TS_GATE_SCRIPT_MISSING (NOT_RUN) |
| AC-4.2 | GATE-A (Scoped) 0 错误 | scoped TypeScript 错误数 = 0 | 错误数 > 0 → FAIL | GATE_A_FAILED (FAIL) |
| AC-4.3 | GATE-B (Baseline) 3/3 匹配 | baseline 总数 = 3，全部匹配白名单，新增 = 0 | 总数 ≠ 3 或新增 > 0 → FAIL | GATE_B_COUNT_MISMATCH / GATE_B_NEW_ERRORS (FAIL) |
| AC-4.4 | 口径分层表述 | 报告明确区分：Scoped TS PASS / Baseline matching PASS / Repo-wide zero-error FAIL | 声称"全域 TypeScript PASS" → FAIL | TS_VERDICT_NOT_LAYERED (FAIL) |

> AC-4.4 纪律：严禁声称"全域 TypeScript PASS"。仓库存在基线错误（baseline），全域零错误是 FAIL 状态。
> 正确表述必须分层：Scoped（本次变更范围）PASS / Baseline（历史遗留）匹配 PASS / Repository-wide（全域）零错误 FAIL。

### AC-5: 变更范围与保护区（对应 SC-5）

| ID | 检查项 | PASS 条件 | FAIL 条件 | 错误码 |
|---|---|---|---|---|
| AC-5.1 | 变更文件清单已生成 | `git diff --stat <base>..HEAD` 和 `git diff --name-only` 已执行 | 执行失败 → BLOCKED_ENV | DIFF_STAT_FAILED / DIFF_NAME_FAILED (BLOCKED_ENV) |
| AC-5.2 | 保护区零变更 | compiler-core/、evaluation/、schemas/ 变更文件数 = 0 | 任一保护区有变更 → FAIL | PROTECTED_AREA_VIOLATION (FAIL) |
| AC-5.3 | 变更范围符合任务边界 | 变更文件均在 playbooks/ 或任务指定范围内 | 越界变更 → 记录，需人工确认 | — |

> AC-5.2 纪律：保护区（compiler-core/、evaluation/、schemas/）是生产代码区域，playbook 审查任务不得修改。
> 任一保护区文件出现在 diff 中即判定 FAIL，无论变更大小。

### AC-6: 证据文件完整性（对应 SC-6）

| ID | 检查项 | PASS 条件 | FAIL 条件 | 错误码 |
|---|---|---|---|---|
| AC-6.1 | evidence/ 目录存在 | 目录存在且包含文件 | 目录缺失或为空 → BLOCKED_ENV | EVIDENCE_DIR_MISSING / EVIDENCE_DIR_EMPTY (BLOCKED_ENV) |
| AC-6.2 | 证据文件 SHA-256 可核对 | 每个证据文件已计算 SHA-256 并留存 | SHA-256 计算失败 → BLOCKED_ENV | SHA256_FAILED (BLOCKED_ENV) |
| AC-6.3 | 证据内容与声明一致 | 证据文件内容支持封签报告中的每项结论 | 证据缺失或不一致 → BLOCKED_ENV | EVIDENCE_INCOMPLETE (BLOCKED_ENV) |

> AC-6.1 纪律：evidence/ 目录必须包含物理文件，空目录视为缺失。
> 证据文件不得在封签后删除或修改。

### AC-7: 封签报告（对应 SC-7）

| ID | 检查项 | PASS 条件 | FAIL 条件 | 错误码 |
|---|---|---|---|---|
| AC-7.1 | 封签报告已生成 | `seal-report-*.json` 已通过 `jq -n` 生成，含所有字段 | 生成失败 → BLOCKED_ENV | SEAL_REPORT_GENERATION_FAILED (BLOCKED_ENV) |
| AC-7.2 | 每项结论绑定证据 | 报告中每个 PASS/FAIL 结论有对应证据文件路径 | 含"已核验"等无证据表述 → FAIL | SELF_DECLARATION_WITHOUT_EVIDENCE (FAIL) |
| AC-7.3 | 状态枚举正确 | 状态为 PASS/FAIL/BLOCKED_ENV/NOT_RUN 之一 | 状态缺失或非法 → FAIL | INVALID_SEAL_STATUS (FAIL) |
| AC-7.4 | 无自我声明替代证据 | 报告不含"已核验"、"确认通过"等无物证表述 | 含此类表述 → FAIL | SELF_DECLARATION_WITHOUT_EVIDENCE (FAIL) |

> AC-7.2 纪律：封签报告中的每项结论必须有对应的命令输出原始记录或证据文件路径。
> "已核验"、"确认通过"等表述若无物证支撑，视为自我声明，判定 FAIL。

## 证据要求（Evidence Requirements）

必须保留以下原始命令输出，不得使用摘要或截图替代：

1. **Git 状态**：`git rev-parse HEAD` 输出、`git status --porcelain=v1` 完整输出、`git log --oneline -5` 输出
2. **远程同步**：`git ls-remote origin <branch>` 输出、`git fetch` 退出码、`git rev-list --count` 双向计数
3. **测试日志**：完整 stdout/stderr（非摘要），日志大小、测试通过/失败/总数、日志中捕获的 commit SHA
4. **TS 门禁**：`node scripts/verify-baseline-ts.mjs` 完整 stdout/stderr、GATE-A 错误数、GATE-B 总数/匹配/新增
5. **变更清单**：`git diff --stat <base>..HEAD` 输出、`git diff --name-only` 输出、保护区变更检查结果
6. **证据完整性**：evidence/ 目录文件清单、每个文件的 SHA-256 和大小
7. **封签报告**：`seal-report-*.json` 完整 JSON（含 sealLog 原始日志嵌入）

## 判定规则（Verdict Rules）

- **PASS**：全部检查项通过，证据完整可独立复核，可签发 SEALED
- **FAIL**：测试失败、commit-hash 不一致、保护区越界、GATE-A/GATE-B 失败、口径造假、自我声明无证据、虚假推送声称
- **BLOCKED_ENV**：证据缺失、git 命令失败、远程不可访问、工具缺失、测试日志缺失/为空、SHA-256 计算失败、封签报告生成失败——不得标记 PASS
- **NOT_RUN**：TS 门禁脚本不存在、测试未执行或日志未捕获

**绝不因任何前序步骤为 FAIL / BLOCKED_ENV / NOT_RUN 而发出 PASS。**

## 错误码封闭清单（Error Code Taxonomy）

| 错误码 | 判定 | 来源 Step |
|---|---|---|
| GIT_REVPARSE_FAILED | BLOCKED_ENV | Step 1 |
| GIT_STATUS_FAILED | BLOCKED_ENV | Step 1 |
| GIT_LOG_FAILED | 记录（不阻断） | Step 1 |
| REMOTE_INACCESSIBLE | BLOCKED_ENV | Step 2 |
| GIT_FETCH_FAILED | BLOCKED_ENV | Step 2 |
| REVLIST_FAILED | 记录（不阻断） | Step 2 |
| FALSE_PUSH_CLAIM | FAIL | Step 2（验证级检查） |
| TEST_LOG_MISSING | BLOCKED_ENV | Step 3 |
| TEST_LOG_EMPTY | BLOCKED_ENV | Step 3 |
| TEST_LOG_INVALID | BLOCKED_ENV | Step 3 |
| TEST_LOG_STAT_ERROR | BLOCKED_ENV | Step 3 |
| TEST_LOG_FORMAT_UNRECOGNIZED | BLOCKED_ENV | Step 3 |
| TEST_FAILURES_DETECTED | FAIL | Step 3 |
| COMMIT_HASH_MISMATCH | FAIL | Step 3 |
| COMMIT_HASH_NOT_FOUND_IN_LOG | 记录（不阻断） | Step 3 |
| TS_GATE_SCRIPT_MISSING | NOT_RUN | Step 4 |
| TS_GATE_EXECUTION_FAILED | FAIL | Step 4 |
| GATE_A_FAILED | FAIL | Step 4 |
| GATE_B_COUNT_MISMATCH | FAIL | Step 4 |
| GATE_B_MATCH_MISMATCH | FAIL | Step 4 |
| GATE_B_NEW_ERRORS | FAIL | Step 4 |
| TS_VERDICT_NOT_LAYERED | FAIL | Step 4（验证级检查） |
| DIFF_STAT_FAILED | BLOCKED_ENV | Step 5 |
| DIFF_NAME_FAILED | BLOCKED_ENV | Step 5 |
| PROTECTED_AREA_VIOLATION | FAIL | Step 5 |
| GREP_ERROR | BLOCKED_ENV | Step 5 |
| EVIDENCE_DIR_MISSING | BLOCKED_ENV | Step 6 |
| EVIDENCE_DIR_EMPTY | BLOCKED_ENV | Step 6 |
| EVIDENCE_FIND_FAILED | BLOCKED_ENV | Step 6 |
| SHA256_FAILED | BLOCKED_ENV | Step 6 |
| EVIDENCE_INCOMPLETE | BLOCKED_ENV | Step 6 |
| SEAL_REPORT_GENERATION_FAILED | BLOCKED_ENV | Step 7 |
| SELF_DECLARATION_WITHOUT_EVIDENCE | FAIL | Step 7（验证级检查） |
| INVALID_SEAL_STATUS | FAIL | Step 7 |
| TOOL_MISSING | BLOCKED_ENV | Phase 0 |
| REPO_ROOT_INACCESSIBLE | BLOCKED_ENV | Phase 0 |
| WC_ERROR | BLOCKED_ENV | 多步 |

## 禁止行为（Forbidden Actions）

- 禁止将 Trellis 日志 [OK] 作为测试通过依据
- 禁止将 commit message 中的数字作为测试结果
- 禁止在证据缺失时标记 PASS
- 禁止伪造 commit-hash 或测试数字
- 禁止声称"全域 TypeScript PASS"（必须分层表述）
- 禁止本地提交未推送时声称"已交付"
- 禁止用自我声明（"已核验"、"确认通过"）替代命令输出证据
- 禁止在封签后删除或修改证据文件
- 禁止自动提交未提交的变更（提交是用户决策）
- 禁止修改保护区（compiler-core/、evaluation/、schemas/）文件
- 禁止在 BLOCKED_ENV 状态下标记 PASS
- 禁止使用摘要或截图替代原始 stdout/stderr 日志
