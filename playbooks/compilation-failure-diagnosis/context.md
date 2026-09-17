# Context: 编译失败诊断与恢复

## 背景

design-compiler 的编译管线涉及多阶段处理（资产校验、图像处理、深度估计、遮罩生成、清单写入、原子落盘）。任何阶段失败都可能导致部分输出。历史教训表明：失败时若不保护已有产物，可能造成不可逆的数据丢失；若静默吞错，可能留下看似成功实则损坏的输出。本 Playbook 建立物理门禁，确保失败时根因可定位、产物可保护、恢复可决策。

## 失败分类（FC-1 ~ FC-6）

| ID | 类别 | 典型场景 | grep 诊断模式 | 恢复策略 | 可重试 |
|---|---|---|---|---|---|
| FC-1 | 输入校验失败 | Schema 不匹配、缺字段、格式错误 | `SCHEMA_` / `schema.*mismatch` / `missing.*field` | 修复输入后重试 | 是 |
| FC-2 | 资源缺失 | 资产文件不存在、路径错误 | `MISSING_` / `file not found` / `ENOENT` | 补充资产后重试 | 是 |
| FC-3 | 资产格式错误 | 编码不支持、损坏文件 | `FORMAT_` / `unsupported.*codec` / `corrupt` | 转换格式或替换资产 | 是 |
| FC-4 | 输出目录异常 | 权限不足、磁盘满、路径冲突 | `EACCES` / `ENOSPC` / `permission denied` | 解决环境问题后重试 | 是 |
| FC-5 | 原子写入失败 | rename 失败、跨设备 EXDEV | `rename.*failed` / `EXDEV` / `staging.*fail` | 清理临时目录后重试 | 是 |
| FC-6 | 内部错误 | 未捕获异常、依赖崩溃 | `exception` / `stack trace` / `panic` / `TypeError` | 需人工排查，不可自动重试 | **否** |

## 约束

- 失败时不得覆盖已有有效产物（必须先创建 `.protected-*` 备份）
- 不得静默吞掉错误（禁止 `|| true`、禁止关键路径 `2>/dev/null`）
- 不得用伪造输出（空文件、占位符）替代失败结果
- 未经验证不得标记 PASS
- 根因不明确时不得猜测，必须标记 BLOCKED_ENV
- 内部错误（FC-6）不得自动重试
- 临时目录（`.staging-*`、`.backup-*`）必须清理或明确记录；仅空 `.staging-*` 可自动删除

## 工具链

| 工具 | 用途 | 最低要求 |
|---|---|---|
| `grep` | 根因定位（6 类诊断，`-cE` 计数模式） | 支持扩展正则 |
| `find` | 临时目录扫描、输出目录枚举 | GNU find |
| `stat` | 文件大小、权限检查（`-c %s`） | GNU stat |
| `git` | commit SHA 与工作树状态记录 | — |
| `jq` | 诊断报告 JSON 生成、manifest 读取 | ≥ 1.6 |
| `mktemp` | 隔离证据文件路径 | — |
| `cp` / `mkdir` / `rmdir` | 备份、归档、空目录清理 | — |

## 术语

- **原子写入**：先写临时目录（`.staging-*`），校验后 rename，失败时回滚（`.backup-*`）
- **有效产物**：已通过完整验证（DC-PB-001 PASS）的编译输出，通过 manifest.json 可解析性 + commit-hash.txt 差异识别
- **可重试失败**（FC-1~FC-5）：输入或环境问题，修复后可重新执行编译
- **不可重试失败**（FC-6）：内部错误或未知异常，需人工介入
- **根因定位**：通过 6 类顺序 grep 诊断在归档日志中匹配错误模式，匹配到第一类即停止
- **诊断报告**：`failure-diagnosis.json`，包含根因、置信度、恢复类别、可重试性、原始诊断日志

## 前置条件

1. 编译失败已被识别（退出码非 0 或校验失败）
2. 错误日志（stdout/stderr）已捕获，至少一个存在
3. 输出目录状态可检查
4. git 可用（用于记录 commit SHA 和工作树状态）
5. 工具链（grep/find/stat/git/jq/mktemp）均可用
