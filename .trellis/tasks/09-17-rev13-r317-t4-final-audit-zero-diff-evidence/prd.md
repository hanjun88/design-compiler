# PRD: REV-13 R3.17 T4 终审物证提取

## 目标

在主工作树执行 T4 终审指令，固化真实输出为证据：
1. 记录真实 FINAL_HEAD_COMMIT
2. `git diff --stat f1eff6c HEAD` 排除 evidence/ 和 .trellis/ 后必须为空（0 files changed）
3. `git diff --name-status f1eff6c HEAD` 全部文件必须仅在 evidence/ 或 .trellis/ 下
4. 验证所有 SHA 可解析

## 验收标准

| # | 标准 |
|---|---|
| 1 | FINAL_HEAD_COMMIT 为真实 git rev-parse HEAD 输出 |
| 2 | 排除白名单后 diff --stat 为空 |
| 3 | name-status 列表仅含 evidence/ 和 .trellis/ 前缀 |
| 4 | f1eff6c 和 FINAL_HEAD_COMMIT 均可 git cat-file -t 解析为 commit |
| 5 | 原始输出保存为证据日志并提交 |

## 约束
- trellis 工作流
- 纯验证任务，无代码变更
- .log 需 git add -f
