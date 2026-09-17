# PRD: REV-13 R3.12 残留修复

## 目标

修复审查席指出的 R3.11 三项残留：Git 错误吞噬、SHA 清单非严格解析、Delta/Golden Frame 未纳入主 Harness。

## 验收标准

| # | 标准 | 验证 |
|---|---|---|
| 1 | verify-freeze-evidence-delta.sh 移除所有 `\|\| true`，git 命令失败直接 exit 非零 | 传入无效 SHA → exit 非零 |
| 2 | SHA 清单严格解析：64 位十六进制 + 文件名匹配 + 单条记录 | 篡改清单 → exit 1 |
| 3 | Harness 集成 delta audit（STATUS_DELTA）和 golden frame（STATUS_GOLDEN_FRAME） | harness 输出 11 阶段全 PASS |
| 4 | 隔离纯净 Worktree 全量验证通过 | 11 阶段 + 故障注入 |

## 约束

- trellis 工作流
- 禁止 git stash
- .log 需 git add -f
- 保护区 ZERO DIFF
