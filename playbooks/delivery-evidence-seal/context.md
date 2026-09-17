# Context: 交付证据与版本封签

## 背景

design-compiler 采用法医级软件工程纪律：无物理执行物证不封签。历史上多次出现"提交信息声明测试通过但无独立日志"、"commit-hash 与实际 HEAD 不一致"、"远程未推送但声称已交付"、"声称全域 TypeScript PASS 但实际存在基线错误"等问题。本 Playbook 建立标准化的交付证据采集和版本封签流程。

## 核心原则

1. **无物证不封签**：测试数字必须有真实 stdout/stderr 日志支撑
2. **可追溯**：每个结论绑定具体 commit SHA 和证据文件路径
3. **可复核**：第三方可独立重新执行验证命令
4. **不自我声明**："已核验"必须有对应命令输出留档
5. **口径精确**：区分 Scoped TypeScript PASS 与 Repository-wide zero-error FAIL

## 封签层级

| 层级 | 含义 | 所需证据 |
|---|---|---|
| 代码提交 | 代码已写入 git | commit SHA、git status |
| 测试通过 | 测试实机执行通过 | 完整测试日志、exit code、commit-hash 一致 |
| TS 门禁 | 双轨门禁通过 | GATE-A 0 错误、GATE-B 3/3 匹配、口径分层 |
| 证据完整 | 所有验收项有物证 | 证据文件清单、SHA-256 |
| 版本封签 | 可交付的稳定版本 | 封签报告 JSON、远程同步确认 |

## TypeScript 双轨门禁口径

| 门禁 | 范围 | 通过标准 | 表述 |
|---|---|---|---|
| GATE-A | Scoped（本次变更范围） | 0 错误 | "Scoped TypeScript PASS" |
| GATE-B | Baseline（历史遗留） | 恰好 3 项，全部匹配白名单，0 新增 | "Baseline matching PASS" |
| 全域 | Repository-wide | 存在基线错误，零错误 FAIL | "Repository-wide zero-error FAIL" |

**严禁**声称"全域 TypeScript PASS"。全域存在基线错误是设计状态，必须分层表述。

## 保护区

以下目录为生产代码保护区，playbook 审查任务不得修改：

| 保护区 | 内容 |
|---|---|
| `compiler-core/` | 编译器核心逻辑 |
| `evaluation/` | 评估框架 |
| `schemas/` | Schema 定义 |

任一保护区文件出现在 `git diff` 中即判定 FAIL (`PROTECTED_AREA_VIOLATION`)。

## 约束

- 不得将 Trellis 日志中的 [OK] 作为测试通过依据
- 不得将 commit message 中的数字作为测试结果
- 不得在证据缺失时标记 PASS
- 不得伪造 commit-hash 或测试数字
- 本地提交不等于远程推送，必须分别确认
- 不得自动提交未提交的变更（提交是用户决策）
- 不得在封签后删除或修改证据文件

## 术语

- **封签（SEALED）**：经过完整验证和证据采集的稳定版本
- **物证**：可独立复核的命令输出原始记录（非摘要、非截图）
- **基线错误（baseline）**：已确认的历史遗留问题，有白名单和指纹锁定
- **Scoped**：本次变更涉及的文件范围
- **GATE-A**：Scoped TypeScript 错误检查（必须 0 错误）
- **GATE-B**：Baseline 匹配检查（必须 3/3 匹配，0 新增）

## 前置条件

1. 代码已提交到本地 git
2. 测试已执行并捕获完整 stdout/stderr 日志
3. 工作区状态可检查
4. 远程仓库可访问（如需确认推送状态）
5. 工具链（git / jq / sha256sum / stat / mktemp）均可用
6. TS 门禁脚本 `scripts/verify-baseline-ts.mjs` 存在（可选，不存在时记录 NOT_RUN）
