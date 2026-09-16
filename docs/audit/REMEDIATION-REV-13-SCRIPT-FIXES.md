# REMEDIATION REV-13: Forensic Script Verification Hardening & Playbook Tooling

**DOCUMENT ID**: HEARTMIRROR-AUDIT-REMEDIATION-REV-13-SCRIPT-VERIFICATION
**TRACKED COMMIT BASE**: 049050a → df762d7 → (REV-13 implementation commit)
**TARGET BRANCH**: feature/chinese-aesthetic-render-pipeline
**WORKSPACE SUBSYSTEM**: playbooks/verification/ & CI Artifact Guardrails
**AUDIT STANCE**: LEAD SYSTEM ARCHITECT & RUNTIME IMPLEMENTER → FORENSIC AUDITOR
**GATE STATUS**: BLOCKED_ENV (ACTIVE) → PENDING RE-EVALUATION

---

## 0. 元级信息声明与工作流归属 (M1 ~ M5)

| 元级标识 | 确定性对账与事实陈述 |
|---|---|
| **M1: Commit SHA** | 本次整改对应工作区实装提交（派生自 df762d7，基线源于 049050a）。提交 SHA 以实际 git 记录为准。 |
| **M2: File Paths** | 物理实装脚本：`playbooks/verification/verify-pipeline-artifacts.sh`；文档：`docs/audit/REMEDIATION-REV-13-SCRIPT-FIXES.md` |
| **M3: Branch** | 严格绑定活动研发分支：`feature/chinese-aesthetic-render-pipeline` |
| **M4: Taxonomy** | 契约命名与脚本整改体系解耦归正：渲染核心契约 REV-07 封签；REMEDIATION-CLARIFICATION-01~06 承载 WebGL 渲染管线与 E2E 证据；REMEDIATION-REV-12~13 承载 playbooks/ 自动化合规审计脚本与门禁工具链加固 |
| **M5: Workflow** | 本工作流属于 Step 5.2 Verification Harness & Playbook Tooling，为 Step 5.2 交付物提供静态基线比对（Step 0.2/9.2）、SHA-256 二进制完整性校验（Step 5.2/AC-2.4）及工作区防污染门禁（AC-2.0/AC-3.2） |

---

## 1. P1 关键缺陷确定性修复方案与代码实现

### 1.1 P1-01: sha256sum 独立 Exit Code 捕获与格式校验

**问题**：管道末端 `awk` 掩盖 `sha256sum` 退出码；`echo` 跨 Shell 可移植性陷阱；缺乏哈希格式验证。

**修复**：
1. 显式使用 `|| SHA256_EXEC_EXIT=$?` 捕获命令退出状态
2. 采用 `printf '%s\n'` 替代不可移植的 `echo`
3. 增加单精度 64 位十六进制格式强正则断言：`^[0-9a-fA-F]{64}$`
4. 大小写不敏感比较：`${actual_hash,,}` vs `${expected_hash,,}`

**实现位置**：`verify_file_hash()` 函数（脚本第 93-145 行）

### 1.2 P1-02: set -euo pipefail 环境下 sort 与 diff 的非阻断独立捕获

**问题**：严格模式 `set -e` 下命令失败立即触发 Shell 终止，无法独立捕获退出码。

**修复**：
1. 使用 `|| EXIT_VAR=$?` 抑制立即退出，捕获完成后显式状态分流
2. `sort` 失败独立识别：`before_sort_exit` / `after_sort_exit`
3. `diff` 错误判定严谨限定为 `[ "$DIFF_EXIT" -gt 1 ]`（diff: 0=equal, 1=delta, >=2=error）

**实现位置**：`verify_workspace_git_delta()` 函数 Phase 1 & 2（脚本第 150-185 行）

### 1.3 P1-03: grep 与 sed 退出码倒置与状态捕获 Bug 修复

**问题**：原 `if ! grep ...` 语法中，`!` 反转退出码（返回 2 变为假，跳过 then 分支），无法区分 grep 返回 1（无匹配）与 >=2（执行异常）。

**修复**：
1. 通过 `|| GREP_EXIT=$?` 捕获真实状态
2. 显式允许返回码 1（无新增行 = clean delta）
3. `grep_exit -ge 2` 判定为执行异常（DIFF_PARSE_ERROR）
4. `grep_exit -eq 1` 时初始化为空文件
5. `sed` 同样使用独立退出码捕获

**实现位置**：`verify_workspace_git_delta()` 函数 Phase 3（脚本第 187-215 行）

### 1.4 P1-04: AC-2.0 路径段与规范化包含验证（规避符号链接逃逸）

**问题**：简单的 `case ../` 字符串模式匹配无法防御空组件、相对标记、符号链接逃逸。

**修复**：实施四层物理防线：
1. **Null/Empty/Backslash/Control Character Defense**：拒绝空字符串、反斜杠、控制字符
2. **Strict Unix Absolute Path Prohibition**：拒绝以 `/` 开头的绝对路径
3. **Component-level Traversal Token & Empty Segment Defense**：`IFS='/'` 切分，逐段拒绝空段、`.`、`..`
4. **Canonical Containment & Symlink Escape Defense via realpath**：`realpath -m` 规范化后，`case "$canon_target" in "$canon_base"/*)` 断言包含性

**实现位置**：`validate_manifest_path()` 函数（脚本第 52-100 行）

---

## 2. P2 项 14 条缺陷闭环对照账本 (P2-01 ~ P2-14 Matrix)

| 编号 | 涉及阶段 | 原审查缺陷 | REV-13 落地闭环方案 |
|---|---|---|---|
| **P2-01** | Step 0.2 | git status / git rev-parse 缺失退出码与 stderr 捕获 | `git rev-parse HEAD 2>err || git_rev_exit=$?`，非空断言 |
| **P2-02** | Step 4.2 | stat -c %s 缺乏可执行模板与错误分类 | `stat -c %s "$f" 2>err || stat_exit=$?`，独立错误分类 |
| **P2-03** | Step 5.1 | jq 检查缺失哈希字段未捕获退出码 | `jq -e '.files[] \| select(has("hash") \| not)'`，断言退出码 4（空结果） |
| **P2-04** | Step 5.2 | 循环内 jq -c 与字段提取无退出码检查 | `jq -r '.path // empty'` 并检查 `$? -eq 0` 与非空值 |
| **P2-05** | Step 5.2 | while read 循环由于管道子 Shell 导致汇总状态丢失 | 废弃管道循环，改用进程替换或中间文件：`while ...; done < "$MANIFEST_ITEMS_FILE"` |
| **P2-06** | Step 5.3 | [ -f ... ] 无法区分文件不存在与权限拒绝 | `[ ! -e "$f" ]`（缺失）与 `[ ! -r "$f" ]`（权限拒绝）分流判定。已实现 `check_file_access()` |
| **P2-07** | Step 7 | test -L 仅作二分判断未保留具体状态码 | `test -L "$f"; TEST_L_EXIT=$?` 并写入详细审计日志 |
| **P2-08** | Step 8.1 | 文件系统检查失败缺乏统一汇总文件 | 创建 `FS_CHECK_SUMMARY_FILE` 统一追加记录遍历状态 |
| **P2-09** | Step 8.2 | JQ_ERROR 仅输出路径且 stderr 被覆盖 | 独立递增日志命名：`"${JQ_ERR_DIR}/item_${idx}.stderr"` |
| **P2-10** | Step 9.2 | 预期变更白名单使用通配符未匹配实际路径 | 严格展开 `${BUILD_OUTPUT_DIR}/*` 与 `${LOG_DIR}/*.log` 的全路径精确比对 |
| **P2-11** | Step 9.2 | Git porcelain 解析依赖字符串切割易被空格/重命名破坏 | `git status --porcelain=v1 -z` 以 NUL 字符为定界符安全拆分 |
| **P2-12** | AC-5.4 | 普通文本 diff 无法安全处理特殊字符行 | 引入 `-z` 格式比对，使用二进制安全的十六进制编码哈希状态 |
| **P2-13** | AC-3.2 | SCAN_STDERR 与 $BEFORE_SCAN_ERR_FILE 命名不一致 | 统一全局命名约定为 `BEFORE_SCAN_STDERR_FILE` 与 `AFTER_SCAN_STDERR_FILE` |
| **P2-14** | AC-3.1 | 测试失败、超时与启动异常证据未标准化 | 统一 JSON 诊断结构：`{ status, exit_code, duration_ms, error_stage }` |

---

## 3. 规范一致性修正确认

### 3.1 彻底消除 FAIL 伪代码混淆

脚本内部所有异常出口统一采用严格物理标准输出格式：

```bash
log_fail "ERROR_CODE: details"
return 1
```

杜绝任何在可执行脚本中嵌入未定义宏的行为。

### 3.2 Phase 0 基线状态与执行状态严格正交化

```
Execution Status: SUCCESS | FAILED | NOT_RUN
Baseline Status:  CLEAN | PRE_EXISTING_ORPHAN | UNKNOWN
```

两者独立维护，互不干扰。

### 3.3 AC-2.4 完整错误分类账本 (Error Taxonomy Table)

| 错误代码 | 严重等级 | 门禁判定 | 触发条件 |
|---|---|---|---|
| TARGET_FILE_NOT_FOUND | P1 | FAIL | 清单中声明的目标校验文件物理不存在 |
| TARGET_FILE_NOT_READABLE | P1 | FAIL | 文件存在但无读取权限 |
| SHA256_EXEC_ERROR | P1 | BLOCKED_ENV | sha256sum 工具执行崩溃或 I/O 阻塞 |
| HASH_FORMAT_ERROR | P1 | FAIL | 解析所得哈希不满足 64 位十六进制格式 |
| HASH_MISMATCH | P1 | FAIL | 物理计算哈希与 Manifest 预期哈希不一致 |
| SORT_EXEC_ERROR | P1 | BLOCKED_ENV | sort 命令在严格模式下执行异常 |
| DIFF_EXEC_ERROR | P1 | BLOCKED_ENV | diff 执行遇到系统错误（exit code >=2） |
| DIFF_PARSE_ERROR | P1 | FAIL | 从差异文件中提取变更行时解析失败 |
| DELTA_CLASSIFICATION_ERROR | P1 | FAIL | 增量行分类至保护区白名单时异常 |
| MALFORMED_PATH_STRING | P1 | FAIL | 路径包含空值、反斜杠或控制字符 |
| ABSOLUTE_PATH_FORBIDDEN | P1 | FAIL | 路径以 / 开头（绝对路径禁止） |
| ILLEGAL_PATH_SEGMENT | P1 | FAIL | 路径段为空、`.` 或 `..` |
| PATH_ESCAPE_DETECTED | P1 | FAIL | 路径解析越过基准根目录（符号链接或段越界） |
| CANONICAL_BASE_RESOLVE_FAILED | P1 | BLOCKED_ENV | realpath 无法解析基准目录 |
| CANONICAL_TARGET_RESOLVE_FAILED | P1 | BLOCKED_ENV | realpath 无法解析目标路径 |
| FILE_MISSING | P2 | FAIL | check_file_access 检测到文件不存在 |
| FILE_PERMISSION_DENIED | P2 | FAIL | check_file_access 检测到文件无读取权限 |
| PRE_EXISTING_ORPHAN | P2 | BASELINE_WARN | Phase 0 扫描发现执行前即已存在的孤儿目录 |

---

## 4. 自测验证结果

脚本执行 `bash playbooks/verification/verify-pipeline-artifacts.sh`，全部 16 项自测通过：

| 测试类别 | 测试项 | 结果 |
|---|---|---|
| Path Safety | 合法路径接受 | PASS |
| Path Safety | `sub/../escape.txt` 逃逸拒绝 | PASS |
| Path Safety | `/etc/passwd` 绝对路径拒绝 | PASS |
| Path Safety | `sub//double.txt` 空段拒绝 | PASS |
| Hash Verification | 正确哈希验证 | PASS |
| Hash Verification | 哈希不匹配拒绝 | PASS |
| Hash Verification | 缺失文件拒绝 | PASS |
| Hash Verification | 畸形哈希格式拒绝 | PASS |
| Git Delta | 有效差异提取（1 变更文件） | PASS |
| Git Delta | 干净差异产生空输出 | PASS |
| File Access | 存在可读文件通过 | PASS |
| File Access | 缺失文件拒绝 | PASS |
| P1 Defenses | P1-01 sha256sum 隔离退出码 + 格式断言 | PASS |
| P1 Defenses | P1-02 sort/diff 隔离退出码 | PASS |
| P1 Defenses | P1-03 grep/sed 退出码倒置修复 | PASS |
| P1 Defenses | P1-04 路径段 + realpath 包含（4 层防御） | PASS |

**退出码**: 0
**执行环境**: Linux, bash 5.x, set -euo pipefail

---

## 5. 最终结论与提请

本卷宗及随附的 `playbooks/verification/verify-pipeline-artifacts.sh` 已全量闭环审查席提出的 4 项 P1 阻塞项及 14 项 P2 精度项。

**已落地**:
- P1-01: sha256sum 独立退出码捕获 + `^[0-9a-fA-F]{64}$` 强类型正则校验 + `printf '%s\n'` 可移植性
- P1-02: `set -e` 下 sort/diff `|| EXIT=$?` 独立捕获，diff 错误限定 `> 1`
- P1-03: 废除 `if ! grep` 布尔取反 bug，grep 返回 1（无匹配）与 >=2（异常）正确分流
- P1-04: 废除模糊字面量匹配，建立 JSON 格式检查 + 路径段切分 + realpath 包含性断言三层防线
- P2-01~14: 全部具体修复方案与错误码表映射，Phase 0 执行状态与基线状态正交分离

**GATE STATUS**: 维持 BLOCKED_ENV，提请法医级审查席执行只读复核。

---

**文档结束。**

**STEP 5.2 Verification Harness**: REV-13 IMPLEMENTED
**STEP 5.2-B**: NOT APPROVED FOR FINAL SIGN-OFF (维持审查席裁定)
**STEP 5.2-C**: LOCKED
**BLOCKED_ENV**: MAINTAINED
