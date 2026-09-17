# Verification: 编译失败诊断与恢复

> 本 Playbook 是编译失败诊断的下游消费方，而非平行规范。所有判定必须基于物理执行证据（原始日志、grep 匹配结果、诊断报告），不得以猜测替代。
>
> README 中的 SC-N（Success Criteria）与本表的 AC-N.x 一一对应：SC-1 → AC-1.x，SC-2 → AC-2.x，依此类推。
>
> 本 Playbook 是 DC-PB-001（Scene Compilation Contract）的上游诊断方：重试成功后必须执行完整 DC-PB-001 验收，不得跳过。

## 代码块性质声明（与 procedure.md 一致）

本文档中的所有 shell 命令示例均为**可执行模板**：

- `<output-dir>`、`<compile-command>` 等尖括号占位符必须替换为实际值后执行
- 失败处理统一使用 `echo "ERROR_CODE" && exit 1`（或 `exit 2` 表示 BLOCKED_ENV）形式，**不再使用 `FAIL (ERROR_CODE)` 伪代码**；验收标准表格中的 `FAIL (ERROR_CODE)` 为状态说明，不是可执行命令
- 所有命令的退出码、stdout 和 stderr 必须原始留存

## 验收标准（Acceptance Criteria）

### AC-1: 失败状态捕获（对应 SC-1）

| ID | 检查项 | PASS 条件 | FAIL 条件 | 错误码 |
|---|---|---|---|---|
| AC-1.1 | 编译退出码已记录 | `COMPILE_EXIT_CODE` 非 0 且已写入诊断文件 | 退出码为 0（非失败场景）→ BLOCKED_ENV；未记录 → FAIL | LOG_NOT_CAPTURED (BLOCKED_ENV) |
| AC-1.2 | 编译日志已归档 | stdout/stderr 日志已通过 `cp` 归档到 mktemp 隔离路径，文件物理存在 | 任一日志缺失或归档失败 → BLOCKED_ENV | EVIDENCE_ARCHIVE_ERROR (BLOCKED_ENV) |
| AC-1.3 | git 状态已记录 | `git rev-parse HEAD` 和 `git status --porcelain=v1` 已执行，输出已保存 | git 执行失败 → BLOCKED_ENV | GIT_STATUS_ERROR (BLOCKED_ENV) |
| AC-1.4 | 输出目录状态已检查 | 输出目录存在性/可读性/manifest 存在性已检查并写入 `$DIAGNOSIS_FILE` | 目录不可访问 → BLOCKED_ENV | OUTPUT_DIR_INACCESSIBLE (BLOCKED_ENV) |

> AC-1.2 纪律：日志归档必须使用 `cp` 复制到 mktemp 隔离路径，不得仅引用原路径（原路径可能被后续操作覆盖）。
> 归档后必须通过 `stat -c %s` 记录文件大小，确认非空。

### AC-2: 已有产物保护（对应 SC-2）

| ID | 检查项 | PASS 条件 | FAIL 条件 | 错误码 |
|---|---|---|---|---|
| AC-2.1 | 有效产物已识别 | 通过 manifest.json 可解析性 + commit-hash.txt 与当前 HEAD 差异检测，确认是否存在上一次成功产物 | 检测失败 → BLOCKED_ENV | ARTIFACT_PROTECTION_FAILED (BLOCKED_ENV) |
| AC-2.2 | 有效产物已备份保护 | 若存在有效产物，已通过 `cp -r` 创建 `.protected-*` 备份目录 | 备份失败 → BLOCKED_ENV；有效产物被覆盖/删除 → FAIL | ARTIFACT_OVERWRITTEN / ARTIFACT_PROTECTION_FAILED |
| AC-2.3 | 临时目录已扫描记录 | `.staging-*` 和 `.backup-*` 目录已通过 `find` 扫描，数量和路径已记录 | 扫描未执行 → FAIL | STAGING_DIR_NOT_SCANNED |

> AC-2.2 纪律：有效产物保护是硬约束。备份必须在任何清理/重试操作之前完成。
> `cp -r` 失败时必须立即 `exit 2`，不得继续执行可能覆盖产物的操作。
>
> AC-2.3 纪律：`.staging-*` 和 `.backup-*` 目录扫描后仅记录，不得自动删除。
> 清理必须在 Step 5 经过安全性检查（空目录检测）后执行。

### AC-3: 根因定位（对应 SC-3）

| ID | 检查项 | PASS 条件 | FAIL 条件 | 错误码 |
|---|---|---|---|---|
| AC-3.1 | 6 类诊断已执行 | 输入校验/资源缺失/格式错误/输出目录异常/原子写入失败/内部错误 6 类 grep 诊断全部执行 | 任一 grep 执行失败（退出码 >1）→ BLOCKED_ENV | DIAGNOSIS_GREP_ERROR (BLOCKED_ENV) |
| AC-3.2 | 根因已明确 | 6 类中至少一类匹配，`ROOT_CAUSE` 已设为具体类别（非 UNKNOWN） | 6 类全部无匹配 → BLOCKED_ENV，不得猜测 | ROOT_CAUSE_UNCLEAR (BLOCKED_ENV) |
| AC-3.3 | grep 退出码三态处理 | 每个 grep 诊断均处理退出码 0（有匹配）/1（无匹配）/>1（执行错误） | 使用 `\|\| true` 或管道末端 `$?` → 违反纪律 | DIAGNOSIS_GREP_ERROR |

> AC-3.1 纪律：6 类诊断按顺序执行，匹配到第一类后停止后续诊断（避免多根因混淆）。
> 每类 grep 使用 `-cE` 计数模式，匹配数 > 0 即认定该类。
> grep 模式必须同时兼容 errno 宏名（EACCES/ENOSPC/EXDEV）和文本描述（permission denied/no space left）。
>
> AC-3.2 纪律：根因不明确时必须标记 BLOCKED_ENV，不得猜测或选择"最可能"的类别。
> 6 类全部无匹配可能是日志不完整或错误信息未输出到 stdout/stderr，需人工介入。

### AC-4: 恢复决策（对应 SC-4）

| ID | 检查项 | PASS 条件 | FAIL 条件 | 错误码 |
|---|---|---|---|---|
| AC-4.1 | 恢复类别已映射 | `ROOT_CAUSE` 已映射到 FC-1~FC-6 恢复类别，`RECOVERY_ACTION` 已明确 | 映射缺失或类别为 UNKNOWN → FAIL | RECOVERY_CATEGORY_UNKNOWN |
| AC-4.2 | 可重试性判定正确 | FC-1~FC-5 标记为 RETRYABLE=true，FC-6（内部错误）标记为 RETRYABLE=false | 内部错误被标记为可重试 → FAIL（违反"禁止自动重试内部错误"） | INTERNAL_ERROR_RETRY_ATTEMPTED |
| AC-4.3 | 内部错误已阻断 | FC-6 内部错误执行 `exit 2`（BLOCKED_ENV），不进入重试流程 | 内部错误继续执行重试 → FAIL | INTERNAL_ERROR (BLOCKED_ENV) |

> AC-4.2 纪律：可重试性是安全约束，不是建议。FC-6（未捕获异常、依赖崩溃、panic）必须不可重试。
> 自动重试内部错误可能导致无限循环或掩盖根本问题。

### AC-5: 清理与诊断归档（对应 SC-5）

| ID | 检查项 | PASS 条件 | FAIL 条件 | 错误码 |
|---|---|---|---|---|
| AC-5.1 | staging 目录安全清理 | 仅空 `.staging-*` 目录被 `rmdir` 删除；非空目录记录但不删除 | 非空目录被删除 → FAIL；清理失败未记录 → FAIL | STAGING_DIR_NOT_CLEANED |
| AC-5.2 | backup 目录已保留 | `.backup-*` 目录全部保留（不自动删除），已记录数量 | backup 目录被删除 → FAIL | BACKUP_DIR_DELETED |
| AC-5.3 | 诊断报告已生成 | `failure-diagnosis.json` 已通过 `jq -n` 生成，含 compileExitCode/rootCause/recoveryCategory/retryable 等字段 | 生成失败 → BLOCKED_ENV | DIAGNOSTIC_REPORT_MISSING (BLOCKED_ENV) |
| AC-5.4 | 证据已归档到 evidence/ | 编译日志、git status、诊断报告已复制到 `<output-dir>/evidence/` | 归档失败 → BLOCKED_ENV | EVIDENCE_ARCHIVE_ERROR (BLOCKED_ENV) |

> AC-5.1 纪律：staging 目录清理必须先检查内容（`find -type f | wc -l`），仅空目录可 `rmdir`。
> 非空 staging 目录可能包含未完成的原子写入数据，删除可能导致数据丢失。
>
> AC-5.3 纪律：诊断报告必须是合法 JSON，包含所有关键字段。使用 `jq -n` 生成而非手动拼接字符串。
> 诊断日志（`$DIAGNOSIS_FILE` 原始内容）必须作为 `diagnosisLog` 字段嵌入 JSON。

### AC-6: 重试验证（对应 SC-6）

| ID | 检查项 | PASS 条件 | FAIL 条件 | 错误码 |
|---|---|---|---|---|
| AC-6.1 | 重试编译已执行 | RETRYABLE=true 时已重新执行编译命令，退出码已捕获 | 未执行重试 → FAIL | RETRY_NOT_EXECUTED |
| AC-6.2 | 重试退出码已记录 | 重试编译退出码已写入诊断文件，日志已归档 | 退出码未记录 → FAIL | RETRY_EXIT_NOT_RECORDED |
| AC-6.3 | DC-PB-001 验收已触发 | 重试成功（退出码 0）后已标注 `RETRY_VALIDATION_REQUIRED=true`，明确要求执行 DC-PB-001 | 重试成功后跳过 DC-PB-001 → FAIL | RETRY_VALIDATION_SKIPPED |
| AC-6.4 | 重试失败已报告 | 重试退出码非 0 时标记 FAIL，记录重试日志路径 | 重试失败被静默 → FAIL | RETRY_COMPILE_FAILED |

> AC-6.3 纪律：重试编译成功不等于验收通过。必须执行完整 DC-PB-001（Scene Compilation Contract 验收）。
> 不得因"上次差不多成功"或"重试退出码 0"就跳过验证。
> 诊断报告中必须明确标注 `retryValidationStatus: "REQUIRED"`。

## 证据要求（Evidence Requirements）

必须保留以下原始命令输出，不得使用摘要或截图替代：

1. **失败状态**：编译命令、退出码、执行时间、归档后的 stdout/stderr 日志（mktemp 隔离路径）
2. **git 状态**：`git rev-parse HEAD` 输出、`git status --porcelain=v1` 完整输出
3. **输出目录状态**：目录存在性/可读性检查结果、manifest.json 存在性、顶层内容枚举
4. **产物保护**：有效产物检测结果（manifest 可解析性 + commit-hash 差异）、`.protected-*` 备份目录路径
5. **根因诊断**：6 类 grep 的匹配计数（DIAG1_MATCH~DIAG6_MATCH）、最终 ROOT_CAUSE 和置信度
6. **临时目录**：`.staging-*` 和 `.backup-*` 扫描结果（数量、路径、内容文件数）、清理记录
7. **诊断报告**：`failure-diagnosis.json` 完整 JSON（含 diagnosisLog 原始日志嵌入）
8. **重试证据**：重试编译命令、退出码、stdout/stderr 日志、`RETRY_VALIDATION_REQUIRED` 标注

## 判定规则（Verdict Rules）

- **PASS**：根因已定位（非 UNKNOWN）、产物已保护、恢复决策明确、诊断报告已归档、可重试失败的重试已执行且 DC-PB-001 验收已触发
- **FAIL**：有效产物被覆盖/删除、错误被静默吞掉、用伪造输出替代失败、重试验证被跳过、非空 staging 目录被误删
- **BLOCKED_ENV**：日志未捕获、根因不明确（6 类无匹配）、内部错误需人工介入、环境不可用（工具缺失/磁盘满/权限不足）、诊断报告生成失败、证据归档失败——不得标记 PASS
- **NOT_RUN**：失败未被识别（编译退出码为 0）、日志未捕获、或 Phase 0 未完成

**绝不因任何前序步骤为 FAIL / BLOCKED_ENV / NOT_RUN 而发出 PASS。**

## 错误码封闭清单（Error Code Taxonomy）

| 错误码 | 判定 | 来源 Step |
|---|---|---|
| ARTIFACT_OVERWRITTEN | FAIL | Step 2 |
| ARTIFACT_PROTECTION_FAILED | BLOCKED_ENV | Step 2 |
| STAGING_DIR_NOT_SCANNED | BLOCKED_ENV | Step 2 |
| BACKUP_DIR_NOT_SCANNED | BLOCKED_ENV | Step 2 |
| STAGING_DIR_NOT_CLEANED | FAIL | Step 5 |
| STAGING_CLEAN_FAILED | BLOCKED_ENV | Step 5 |
| BACKUP_DIR_DELETED | FAIL | Step 5 |
| ROOT_CAUSE_UNCLEAR | BLOCKED_ENV | Step 3 |
| DIAGNOSIS_GREP_ERROR | BLOCKED_ENV | Step 3 |
| RECOVERY_CATEGORY_UNKNOWN | FAIL | Step 4 |
| INTERNAL_ERROR_RETRY_ATTEMPTED | FAIL | Step 4 |
| INTERNAL_ERROR | BLOCKED_ENV | Step 4 |
| DIAGNOSTIC_REPORT_MISSING | BLOCKED_ENV | Step 5 |
| DIAGNOSTIC_REPORT_GENERATION_FAILED | BLOCKED_ENV | Step 5 |
| DIAGNOSTIC_REPORT_UPDATE_FAILED | BLOCKED_ENV | Step 6 |
| RETRY_NOT_EXECUTED | FAIL | Step 6 |
| RETRY_EXIT_NOT_RECORDED | FAIL | Step 6 |
| RETRY_VALIDATION_SKIPPED | FAIL | Step 6 |
| RETRY_COMPILE_FAILED | FAIL | Step 6 |
| LOG_NOT_CAPTURED | BLOCKED_ENV | Phase 0 |
| COMBINED_LOG_ERROR | BLOCKED_ENV | Step 1 |
| STDOUT_LOG_MISSING | BLOCKED_ENV | Step 1 |
| STDERR_LOG_MISSING | BLOCKED_ENV | Step 1 |
| GIT_STATUS_ERROR | BLOCKED_ENV | Step 1 |
| OUTPUT_DIR_INACCESSIBLE | BLOCKED_ENV | Step 1 |
| OUTPUT_DIR_MISSING | BLOCKED_ENV | Step 1 |
| OUTPUT_DIR_NOT_DIRECTORY | BLOCKED_ENV | Step 1 |
| EVIDENCE_ARCHIVE_ERROR | BLOCKED_ENV | Step 1/5/6 |
| EVIDENCE_DIR_CREATE_FAILED | BLOCKED_ENV | Step 5 |
| TOOL_MISSING | BLOCKED_ENV | Preconditions |
| ENVIRONMENT_UNAVAILABLE | BLOCKED_ENV | Preconditions |

## 禁止行为（Forbidden Actions）

- 禁止覆盖或删除已有有效产物（必须先创建 `.protected-*` 备份）
- 禁止静默吞掉错误（空 catch、`|| true`、`2>/dev/null` 掩盖关键错误）
- 禁止用空文件或占位符替代失败输出
- 禁止未验证就标记 PASS
- 禁止因"上次差不多成功"跳过重试后的 DC-PB-001 验收
- 禁止自动重试内部错误（未捕获异常、依赖崩溃、panic）
- 禁止在根因不明确时猜测或选择"最可能"的类别（必须 BLOCKED_ENV）
- 禁止删除非空 `.staging-*` 目录（仅空目录可 `rmdir`）
- 禁止自动删除 `.backup-*` 目录（必须人工确认内容后决定）
- 禁止使用管道末端 `$?` 代表 grep 状态（必须拆开独立捕获）
- 禁止子 shell 变量传递状态（循环内状态必须通过文件汇总）
- 禁止在 BLOCKED_ENV 状态下标记 PASS
