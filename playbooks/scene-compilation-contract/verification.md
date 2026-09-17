# Verification: Scene Compilation Contract 验收

> 本 Playbook 是 Step 5.x 契约的下游消费方，而非平行规范。所有判定必须基于物理执行证据，不得以静态推断替代。
>
> README 中的 SC-N（Success Criteria）与本表的 AC-N.x 一一对应：SC-1 → AC-1.x，SC-2 → AC-2.x，依此类推。
>
> 路径规范：`manifest.files[].path` 为相对于 output directory 的 POSIX 相对路径（如 `assets/scene.webp`、`scene.json`、`evidence/machine-provenance.json`），所有校验直接拼接 `<output-dir>/<path>`，不得额外加 `assets/` 前缀。

## 代码块性质声明

本文档中的所有 shell 命令示例均为**可执行模板**：

- `<output-dir>` 等尖括号占位符必须替换为实际值后执行
- 失败处理统一使用 `echo "ERROR_CODE" && exit 1`（或 `exit 2` 表示 BLOCKED_ENV）形式，**不再使用 `FAIL (ERROR_CODE)` 伪代码**；验收标准表格中的 `FAIL (ERROR_CODE)` 为状态说明，不是可执行命令
- 所有命令的退出码、stdout 和 stderr 必须原始留存

## 验收标准（Acceptance Criteria）

### AC-1: scene.json 单一事实源（对应 SC-1）

| ID | 检查项 | PASS 条件 | FAIL 条件 | 错误码 |
|---|---|---|---|---|
| AC-1.1 | 编译退出码 | 编译进程退出码为 0 | 退出码非 0 | COMPILE_EXIT_NONZERO |
| AC-1.2 | 旁路配置文件 | `find` 枚举 scene.json 同级目录，无 scene.local.json / scene.dev.json / scene.override.json / scene.*.json（排除 scene.json 本身），且 find 退出码为 0 | find 退出码非 0 → BLOCKED_ENV；找到旁路文件 → FAIL | BYPASS_CONFIG_DETECTED |
| AC-1.3 | Schema 完整性 | `jq -e '.sceneId and .manifestVersion and .packVersion'` 退出码 0（所有必填字段存在且非空） | 退出码 1 → 字段缺失或为空 → FAIL；退出码其他非 0 → JSON 解析失败 → BLOCKED_ENV | SCHEMA_INCOMPLETE |
| AC-1.4 | 无外部引用 | `command -v jq` 成功；三阶段 jq 全部退出码 0：①`jq '[paths \| select(...)]'` 生成 HITS_JSON ②`jq -r '.[] \| join(".")'` 生成 HITS_READABLE ③`jq -r 'length'` 返回 0 | 任一 jq 阶段退出码非 0 → BLOCKED_ENV；length > 0 → FAIL | EXTERNAL_REFERENCE |

> AC-1.2 纪律：必须使用 `find -maxdepth 1 -type f \( -name ... \) ! -name 'scene.json'` 显式枚举，
> 禁止使用 `ls 'scene.*.json'`（单引号阻止通配符展开）。find 退出码非 0 时判定 BLOCKED_ENV，
> 不得与"无匹配"混淆。

> AC-1.4 纪律：必须使用三阶段法，每阶段独立捕获退出码：
> - Phase 0：`command -v jq` 检查工具可用性 → 不可用 → BLOCKED_ENV
> - Phase 1：`jq '[paths | select(...)]'` 输出 JSON 数组格式（原始路径数组，如 `[["metadata","a.b","$ref"]]`，机器可精确复核，无 join 歧义）→ 退出码非 0 → BLOCKED_ENV（JQ_MATCH_ERROR）
> - Phase 2：`jq -r '.[] | join(".")'` 生成可读格式（仅用于人类展示）→ 退出码非 0 → BLOCKED_ENV（JQ_READABLE_ERROR）
> - Phase 3：`jq -r 'length'` 计算数组长度 → 退出码非 0 → BLOCKED_ENV（JQ_LENGTH_ERROR）
> - 三阶段全部成功后：length > 0 → FAIL（记录 HITS_JSON 原始数组 + HITS_READABLE 可读格式）；length == 0 → PASS
> 任一阶段失败立即 BLOCKED_ENV，不得进入 PASS/FAIL 判定。
> 不依赖 jq 退出码 4，不依赖字符串比较。
> 禁止使用 `grep -E` 子串匹配。此检查与 Step 5.2 AST 防火墙"废除字符串子串匹配"原则一致。

### AC-2: 资产完整性（对应 SC-2）

| ID | 检查项 | PASS 条件 | FAIL 条件 | 错误码 |
|---|---|---|---|---|
| AC-2.0 | 原始路径格式合法 | 所有 `manifest.files[].path` 经 jq 读取后满足：非空字符串、不以 `/` 开头（非绝对路径）、不包含 `..` 路径段、使用 POSIX `/` 分隔符、不含 `\` 反斜杠 | 任一条件不满足 | PATH_FORMAT_INVALID |
| AC-2.1 | 路径无逃逸 | 所有声明路径经 `realpath` 后位于输出目录内（case 边界感知匹配）；文件不存在时先判定 ASSET_INVALID，不进入路径逃逸判定 | 文件不存在 → ASSET_INVALID；存在但路径逃逸 → PATH_ESCAPE | PATH_ESCAPE / ASSET_INVALID |
| AC-2.2 | 资产物理存在 | 所有声明路径存在且文件大小 > 0（`stat -c %s`） | 不存在或空文件 | ASSET_INVALID |
| AC-2.3 | 无重复物理资产 | 所有声明路径的 realpath 无重复（`sort \| uniq -d` 输出为空） | 不同声明路径指向同一物理文件（含硬链接） | DUPLICATE_PHYSICAL_ASSET |
| AC-2.4 | SHA-256 匹配 | ①所有 `manifest.files[].sha256` 字段存在且非空；②全部资产 `sha256sum "<output-dir>/<path>"` 退出码 0；③实际哈希与 `manifest.files[].sha256` 逐一一致；④所有比较结果（HASH_MATCH/HASH_MISMATCH/ERROR）原始留存 | manifest 项缺失 sha256 字段 → FAIL (MISSING_HASH_FIELD)；sha256sum 执行失败 / 哈希解析失败 / 哈希格式无效 / jq 读取失败（统一 ERROR_COUNT > 0）→ BLOCKED_ENV (SHA256_VERIFICATION_ERROR)；哈希不匹配 → FAIL (HASH_MISMATCH) | HASH_MISMATCH / MISSING_HASH_FIELD / SHA256_VERIFICATION_ERROR(BLOCKED_ENV) |
| AC-2.5 | fileCount 一致 | `manifest.fileCount == manifest.files | length` 且 `== $(find <output-dir> -type f ! -path '<output-dir>/manifest.json' | wc -l)`（仅排除根目录 manifest.json，与 Step 4.4 实现完全一致） | 三者不一致 | FILE_COUNT_MISMATCH |

> AC-2.0 纪律（第七次修正：原始路径格式校验）：必须使用 jq 读取 `manifest.files[].path` 原始字符串，
> 再进行路径段判定，不得仅依赖 realpath 规范化后的结果。realpath 会规范化路径，
> `a/../b` 可能规范化后位于合法目录内，但原始 manifest 路径仍然违反"不含 .."约束。
> 检查项：①非空 ②不以 `/` 开头 ③不包含 `..` 路径段（`/../` 或以 `..` 结尾）④不含 `\` 反斜杠。

> AC-2.1 纪律：必须先检查文件是否存在（`[ ! -e ]`）。文件不存在时判定 `ASSET_INVALID`，
> 不调用 realpath（避免 realpath 对不存在路径的未定义行为）。文件存在时才做 realpath 规范化
> 和 case 边界感知前缀匹配。

> AC-2.3 说明：SHA-256 冲突只能检测内容相同的文件，但两个不同声明路径指向同一物理文件（如硬链接）不会触发哈希冲突，仍属于路径逃逸的一种形式，必须用 realpath 检测。

> AC-2.5 说明（fileCount 语义证据 + 排除层级，第七次修正）：
> - `disk-emitter.ts:384` 设置 `fileCount: manifestFiles.length`；
> - manifestFiles 包含 assets/* + scene.json + evidence/*，不包含 manifest.json 本身；
> - `disk-validator.ts:272` 校验 `fileCount === files.length`；
> - `disk-emitter.test.ts:232` 断言 `diskFiles.length === fileCount + 1`（+1 for manifest.json）。
> - **排除层级（方案 A）**：仅排除 output directory 根目录下的 `manifest.json`，
>   其他层级的同名文件（如 `assets/manifest.json`）不排除，应被报告为未声明文件（AC-4.2）。
> - 因此磁盘统计必须精确排除根目录 manifest.json，且必须同时验证 manifest 内部一致性和磁盘一致性。

### AC-3: 原子写入与回滚安全（对应 SC-3）

| ID | 检查项 | PASS 条件 | FAIL 条件 | 错误码 |
|---|---|---|---|---|
| AC-3.1 | 原子写入与回滚（进程内验证） | `npx jest disk-emitter.test.ts`（DISK-01）+ `disk-security.test.ts`（DISK-SEC-02/05）+ `disk-hardening.test.ts`（DISK-HARD-04）全部 PASS | 任一测试 FAIL | NON_ATOMIC_WRITE |
| AC-3.2 | 编译前基线扫描成功 | Phase 0 的 `find` 退出码为 0，`$BEFORE_SCAN_FILE`、`$SCAN_EXIT`、`$BEFORE_SCAN_ERR_FILE` 均已保存；输出为空 → PASS；输出非空 → PASS + PRE_EXISTING_ORPHAN 记录 | find 退出码非 0 → BLOCKED_ENV；输出文件存在但无退出码证据 → BLOCKED_ENV；Phase 0 未执行 → NOT_RUN | PRE_EXISTING_ORPHAN |
| AC-3.3 | 编译后无孤儿 | Step 7 的 `find` 退出码为 0，`comm -13` 差分（$NEW_ORPHAN_FILE）为空，即无编译后新出现的 `*.staging-*` / `*.backup-*` 目录（Phase 0 = PASS 时正常判定；Phase 0 = NOT_RUN 时 AC-3.3 = NOT_RUN，扫描结果仅为 REFERENCE_ONLY） | find 或 comm 退出码非 0 → BLOCKED_ENV；差分文件非空 → FAIL；Phase 0 = NOT_RUN → NOT_RUN | ORPHAN_DIR_AFTER_COMPILE |
| AC-3.4 | 孤儿已清理 | `comm -12` 差分（$UNCLEANED_ORPHAN_FILE）为空，即编译前已存在的孤儿目录在编译后已清除（Phase 0 = PASS 时正常判定；Phase 0 = NOT_RUN 时 AC-3.4 = NOT_RUN） | 差分文件非空 → FAIL；Phase 0 = NOT_RUN → NOT_RUN | ORPHAN_DIR_NOT_CLEANED |
| AC-3.5 | 输出目录非符号链接 | Step 2 已验证目录存在；`test -L <output-dir>` 返回非 0（不是符号链接） | `test -L` 返回 0（是符号链接）→ FAIL | OUTPUT_DIR_IS_SYMLINK |

> AC-3.1 执行方式（方案 C）：见 procedure.md Step 6。
> **测试性质**：进程内单元/集成测试——直接调用 `emitter.emit()` / `compileAndEmitToDisk()`，
> 通过 `jest.mock("node:fs")` 替换 `renameSync` / `rmSync` 模拟失败。
> **覆盖范围**：
> - DISK-01（disk-emitter.test.ts）：失败不创建目标、已有目标不被破坏、临时目录清理
> - DISK-SEC-02（disk-security.test.ts）：rename(staging→target) 失败时回滚、原目录哈希不变、无残留
> - DISK-SEC-05（disk-security.test.ts）：失败/成功后均无 staging/backup 残留
> - DISK-HARD-04（disk-hardening.test.ts）：5 种崩溃场景恢复决策、symlink 攻击拦截、清理失败审计
> **不覆盖**：真实进程崩溃（SIGKILL / 断电）在 rename 窗口中的行为。
> `crash-recovery.ts` 明确声明"非严格崩溃安全（不提供 WAL）"，此边界必须在交付报告中声明。
> 测试文件不存在或 npx jest 不可用时 → BLOCKED_ENV 或 NOT_RUN，不得伪造结果。
> 静态审查两阶段提交机制不替代测试执行。

> AC-3.2 纪律（REV-12 修正：EXECUTION_STATUS 与 BASELINE_STATUS 分离）：
> "文件已记录"不等于"扫描成功"。Phase 0 的状态分为两个维度：
>
> **EXECUTION_STATUS（执行状态）**：
> - `SUCCESS`：find 退出码 0，扫描成功
> - `FAILED`：find 退出码非 0 → BLOCKED_ENV
> - `NOT_RUN`：Phase 0 未执行
>
> **BASELINE_STATUS（基线状态）**（仅 EXECUTION_STATUS=SUCCESS 时有意义）：
> - `CLEAN`：扫描输出为空
> - `PRE_EXISTING_ORPHAN`：扫描输出非空（需记录，但不直接 FAIL）
> - `UNKNOWN`：EXECUTION_STATUS 非 SUCCESS 时
>
> 必须同时保存：①`$BEFORE_SCAN_FILE`（扫描输出）②`$SCAN_EXIT`（退出码）③`$BEFORE_SCAN_ERR_FILE`（标准错误）
> ④扫描时间 ⑤扫描目标目录。
>
> 状态映射：
> - EXECUTION_STATUS=SUCCESS + BASELINE_STATUS=CLEAN → PASS
> - EXECUTION_STATUS=SUCCESS + BASELINE_STATUS=PRE_EXISTING_ORPHAN → PASS + PRE_EXISTING_ORPHAN 记录
> - EXECUTION_STATUS=FAILED → BLOCKED_ENV
> - EXECUTION_STATUS=NOT_RUN → NOT_RUN
> - 输出文件存在但没有退出码证据 → BLOCKED_ENV

> AC-3.3 / AC-3.4 纪律（第七次修正：状态闭环）：
> - Phase 0 = PASS → AC-3.3/AC-3.4 正常判定
> - Phase 0 = NOT_RUN → AC-3.2 = NOT_RUN，AC-3.3 = NOT_RUN，AC-3.4 = NOT_RUN
> - Phase 0 = NOT_RUN 时，Step 7 扫描结果仅作为 `REFERENCE_ONLY` 附加证据，**不得转换为 PASS**
> - Phase 0 = NOT_RUN 时，最终判定**不得为 PASS**（必须为 NOT_RUN 或 BLOCKED_ENV）
> - 五种状态区分：①Phase 0 无法执行 ②Phase 0 成功但发现已有孤儿 ③Step 7 执行失败 ④Step 7 成功且扫描为空 ⑤Step 7 成功但存在新孤儿

### AC-4: Manifest 正确性（对应 SC-4）

| ID | 检查项 | PASS 条件 | FAIL 条件 | 错误码 |
|---|---|---|---|---|
| AC-4.1 | manifest 项均有对应文件 | `jq -r '.files[].path'` 遍历的每个路径在输出目录中存在 | manifest 引用了不存在的文件 | MANIFEST_REFERENCES_MISSING_FILE |
| AC-4.2 | 输出文件均在 manifest 中 | `find <output-dir> -type f ! -path '<output-dir>/manifest.json' -printf '%P'` 的每个文件在 `manifest.files` 中可查到（仅排除根目录 manifest.json，其他层级同名文件不排除） | 存在未声明的输出文件 | UNMANIFESTED_FILE |

> AC-4.2 说明（第七次修正：排除层级明确为方案 A）：
> - `find ! -path '<output-dir>/manifest.json'` 仅排除 output directory 根目录下的 `manifest.json`
> - 其他层级的同名文件（如 `assets/manifest.json`、`evidence/manifest.json`）不排除，应被报告为未声明文件
> - `find -printf '%P'` 从 output-dir 根目录开始，输出 `assets/scene.webp`、`scene.json`、
>   `evidence/machine-provenance.json` 等相对路径，与 manifest.files[].path 格式直接匹配，
>   无需额外拼接 `assets/` 前缀。

### AC-5: 证据完整性（对应 SC-5）

| ID | 检查项 | PASS 条件 | FAIL 条件 | 错误码 |
|---|---|---|---|---|
| AC-5.1 | 编译日志已归档 | stdout/stderr 已用 `mktemp` 隔离路径保存，编译命令通过 `> "$LOG_STDOUT" 2> "$LOG_STDERR"` 重定向写入；两个文件物理存在且路径已记录；编译失败时 stderr 非空 | 日志文件缺失或路径未记录 | EVIDENCE_LOG_MISSING |
| AC-5.2 | commit-hash 一致 | `$(cat commit-hash.txt) == $(git rev-parse HEAD)` | 不一致 | COMMIT_HASH_MISMATCH |
| AC-5.3 | git status 已归档 | `git status --short` 输出已保存（编译前和编译后各一份） | 缺失 | EVIDENCE_GIT_STATUS_MISSING |
| AC-5.4 | 编译未引入未预期变更 | 采用基线-增量模型：①编译前基线状态（$GIT_STATE_BEFORE_FILE）已记录，可能为 Dirty；②编译引入的增量变更（diff 结果）全部在预期变更白名单或排除范围内；③编译目标范围内无未预期增量变更 | 编译目标范围存在未预期的增量变更 | WORKTREE_NOT_CLEAN |

> AC-5.1 纪律：`mktemp` 只创建空文件，必须在编译命令中通过 shell 重定向（`>` 和 `2>`）
> 将 stdout/stderr 写入文件。仅创建 mktemp 文件而不重定向 = 证据缺失。
> 编译成功时 stdout 允许为空，但文件必须存在；编译失败时 stderr 必须非空。

> AC-5.4 纪律（第八次修正：基线-增量模型，消除 Clean 语义冲突）：
>
> **核心模型**：本检查不要求编译前工作树 Clean，也不要求编译后工作树 Clean。
> 它只验证一个命题：**编译过程没有引入白名单之外的未预期变更**。
>
> **两阶段状态**：
> - 编译前基线（Baseline）：`$GIT_STATE_BEFORE_FILE`，可能为 Dirty（已有未提交变更），只需记录
> - 编译后状态（After）：`$GIT_STATE_AFTER_FILE`
> - 编译引入的增量（Delta）：`diff Baseline After` 的结果，即编译过程中新产生的变更
>
> **编译目标范围**：`chinese-aesthetic/`、`tests/chinese-aesthetic/`、`scripts/`（编译相关脚本）。
>
> **预期变更白名单**（编译过程中允许产生的增量变更）：
> - 输出目录下的编译产物（由 `<output-dir>` 指定，通常在仓库外或 `dist/` 下）
> - 证据日志文件（`$LOG_STDOUT`、`$LOG_STDERR`，若位于仓库内需显式声明路径）
> - 测试临时文件（若位于仓库内，必须在 `.gitignore` 中或显式声明）
>
> **排除范围**（不计入编译项目工作树污染的增量变更）：
> - `playbooks/` 目录（Playbook 开发本身的预期状态）
> - `.trellis/` 目录（Trellis 工作流管理）
> - `node_modules/`（依赖目录）
>
> **差分计算规则**：
> 1. 编译前保存 `git status --short` 到 `$GIT_STATE_BEFORE_FILE`（Phase 0.2）
> 2. 编译后保存 `git status --short` 到 `$GIT_STATE_AFTER_FILE`（Step 9.2）
> 3. 计算增量：`diff <(sort "$GIT_STATE_BEFORE_FILE") <(sort "$GIT_STATE_AFTER_FILE")` > `$GIT_DIFF_FILE`
> 4. 增量中新增的变更行（即 After 中有但 Baseline 中没有的行），按路径分类：
>    - 路径在排除范围内 → 预期（PASS）
>    - 路径在预期变更白名单内 → 预期（PASS，需记录）
>    - 路径在编译目标范围内且不在白名单内 → 未预期（FAIL）
>    - 路径在编译目标范围外且不在排除范围内 → 需人工判定（BLOCKED_ENV）
> 5. 未跟踪文件（`??` 前缀）与已修改文件（` M` 前缀）分别处理，均适用上述分类
> 6. Baseline 中已存在的变更（即 diff 中被删除的行或两边都有的行）不判定为编译引入的变更
>
> **状态分类标签（REV-10 补强：明确四态，避免逻辑混淆）**：
> - `BASELINE_DIRTY`：编译前基线（$GIT_STATE_BEFORE_FILE）非空，即编译前已有未提交变更。此状态**不导致 AC-5.4 FAIL**，只需在证据中声明。
> - `EXPECTED_DELTA`：编译引入的增量变更中，路径在排除范围或预期变更白名单内的变更。此状态**不导致 FAIL**，需记录。
> - `UNEXPECTED_DELTA`：编译引入的增量变更中，路径在编译目标范围内且不在白名单内的变更。此状态**导致 AC-5.4 FAIL**，错误码 `WORKTREE_NOT_CLEAN`。
> - `NO_NEW_UNEXPECTED_DELTA`：编译引入的增量变更中不存在 `UNEXPECTED_DELTA`（可能有 `EXPECTED_DELTA`，也可能无任何增量）。此状态为 AC-5.4 PASS 的唯一条件。
>
> **禁止逻辑**：不得因 `BASELINE_DIRTY` 而直接报告 `WORKTREE_NOT_CLEAN`。
> `WORKTREE_NOT_CLEAN` 的语义已重定义为"编译引入了未预期变更"（即存在 `UNEXPECTED_DELTA`），
> 而非"工作树不 Clean"。编译前已有的脏状态属于 `BASELINE_DIRTY`，不触发此错误码。
>
> **Clean 语义澄清**：
> - "编译前工作树 Dirty" 不导致 AC-5.4 FAIL，只需在证据中声明 Baseline 状态
> - "编译后工作树 Dirty" 不导致 AC-5.4 FAIL，只要 Dirty 的原因全部在白名单或排除范围内
> - AC-5.4 FAIL 的唯一条件是：编译引入了编译目标范围内且不在白名单内的未预期增量变更
> - 错误码 `WORKTREE_NOT_CLEAN` 的语义为"编译引入了未预期变更"，而非"工作树不 Clean"
>
> **可执行实现（REV-11 补强）**：以上分类规则已落实为 procedure.md Step 9.2 的可执行差分分类流程，
> 包括：①diff 退出码三态捕获（0=无差异，1=有差异，>1=执行失败，禁止 `|| true` 抹平）
> ②从 diff 输出提取 After 新增变更行 ③解析 git status --short porcelain 格式（含重命名 R old->new）
> ④路径提取与分类匹配 ⑤生成 `$EXPECTED_DELTA_FILE` / `$UNEXPECTED_DELTA_FILE` / `$BLOCKED_DELTA_FILE`
> ⑥分类结果判定（BLOCKED_DELTA→BLOCKED_ENV，UNEXPECTED_DELTA→FAIL，无 UNEXPECTED_DELTA→PASS）。

## 证据要求（Evidence Requirements）

必须保留以下原始命令输出，不得使用摘要或截图替代：

1. **Git 状态**：`git status --short`（编译前 + 编译后）、`git rev-parse HEAD`、编译前后 `diff` 差分结果的原始输出（含 diff 退出码：0=无差异，1=有差异，>1=执行失败）、增量分类结果文件（`$EXPECTED_DELTA_FILE`、`$UNEXPECTED_DELTA_FILE`、`$BLOCKED_DELTA_FILE`）
2. **Scene source 验证**：AC-1.2 的 find 命令原始输出（含退出码 + stderr）、AC-1.4 的 jq 三阶段输出（HITS_JSON 原始数组 + HITS_READABLE + HIT_COUNT + 三个退出码）
3. **资产验证**：AC-2.0 ~ AC-2.5 的原始路径格式检查 / realpath / sha256sum / find 命令原始输出（含退出码）；manifest 哈希字段存在性检查结果（MISSING_HASH_FIELD 列表）；SHA-256 逐项比较结果（每个文件的 HASH_MATCH / HASH_MISMATCH / ERROR，含 expected 和 actual 哈希值；ERROR 子类型含 sha256sum_exec_failed / hash_parse_failed / invalid_hash_format / jq_read_failed，统一 ERROR_COUNT > 0 → BLOCKED_ENV）
4. **原子写入与回滚测试**：Step 6 的 `npx jest disk-emitter.test.ts`（DISK-01）、`disk-security.test.ts`（DISK-SEC-02/05）、`disk-hardening.test.ts`（DISK-HARD-04）完整输出（含用例名、PASS/FAIL、exit code）；三个测试日志文件（`$JEST_DISK_EMITTER_LOG`、`$JEST_DISK_SECURITY_LOG`、`$JEST_DISK_HARDENING_LOG`）及各自退出码
5. **孤儿目录扫描**：Phase 0（编译前）和 Step 7（编译后）的 `find` 输出、退出码、stderr；`comm -13` 差分结果（$NEW_ORPHAN_FILE，绑定 AC-3.3）；`comm -12` 差分结果（$UNCLEANED_ORPHAN_FILE，绑定 AC-3.4）；两个 comm 命令的退出码
6. **Manifest 双向验证**：AC-4.1 和 AC-4.2 的 jq / find 命令原始输出（仅排除根目录 manifest.json）
7. **编译日志**：`$LOG_STDOUT` 和 `$LOG_STDERR` 的实际文件路径和内容（编译失败时必须包含 stderr）

## 判定规则（Verdict Rules）

- **PASS**：全部 AC 项通过，证据完整可独立复核
- **FAIL**：任一 AC 项不通过，记录具体错误码（错误码封闭，不得新增未定义码）
- **BLOCKED_ENV**：工具不可用（jq / sha256sum / realpath / mktemp / npx jest / find 缺失）、find 或 jq 执行失败、证据缺失但代码可能正确、commit-hash 文件缺失或读取失败——不得标记 PASS
- **NOT_RUN**：编译未执行、输出目录不存在、Phase 0 编译前基线不可用、或 AC-3.1 单元测试未执行

**绝不因任何前序步骤为 FAIL / BLOCKED_ENV / NOT_RUN 而发出 PASS。**

## 禁止行为（Forbidden Actions）

- 禁止以静态推断（"应该没问题"）替代实际校验
- 禁止使用 `grep -E` 子串匹配替代 `jq` 结构化 JSON 判定
- 禁止使用 `ls 'scene.*.json'` 等通配符失效命令替代 `find` 枚举
- 禁止伪造 SHA-256 或测试数字
- 禁止在证据缺失时标记 PASS
- 禁止修改编译产物后再校验（必须校验原始输出）
- 禁止将摘要（Summary）或截图（Screenshot）作为证据——原始命令输出才是证据
- 禁止把 BLOCKED_ENV 或 NOT_RUN 报告为 PASS
- 禁止在 AC-3.1 单元测试未执行时声称原子写入验证通过
- 禁止在 Phase 0 编译前基线不可用时将 AC-3.3 作为独立 FAIL 依据
- 禁止将进程内 Jest mock 测试称为真实进程崩溃安全测试
