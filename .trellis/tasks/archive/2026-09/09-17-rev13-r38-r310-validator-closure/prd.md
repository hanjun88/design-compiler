# PRD: REV-13 R3.8-R3.10 验证器加固与闭包严格化

## 背景

REV-13 R3.5-R3.7 经历多轮审查席 REQUEST CHANGES。R3.7 之后审查席指出 3 项 P0 缺口：tolerance 契约矛盾、P1-1 硬编码乘数换皮、P1-3 证据不成立。R3.8-R3.10 逐项闭环。

## 目标

1. **RENDER-07C 验证器**：修复 `scripts/verify-golden-frame.js` 的 P0 硬伤（差异不退出、虚假参数、无像素断言），恢复 SHA 清单校验，增加 PNG 头校验和几何正向断言。
2. **REV-13 闭包分析器**：移除 `expected_events` 默认回退，强制注册表逐项显式声明，增加逐测试事件数独立断言。
3. **子壳隔离证据**：提供独立隔离测试（非 grep 声明），证明子壳修改 EVENT_SEQ 不影响父进程。
4. **Binding JSON 时效性**：解决连续 3 轮的 head_commit 与当前 HEAD 不一致，采用方案 A（source_freeze + current_head + staleness_declaration）。

## 验收标准

| # | 标准 | 验证方式 |
|---|---|---|
| 1 | 验证器差异 > tolerance 时 exit 1 | 篡改 1 字节后运行，确认 exit=1 |
| 2 | `--bin/--png/--tolerance/--sha256/--compare-bin` 参数全部实现 | 缺参数 exit 2，正常 exit 0 |
| 3 | SHA 清单独立读取与严格比对 | 清单缺失 exit 1，不匹配 exit 1 |
| 4 | PNG Magic + IHDR 320x240 校验 | 损坏 PNG exit 1 |
| 5 | 几何正向断言：(160,120)==[129,93,95]，非背景精确==1980 | 验证器 PASS |
| 6 | 注册表缺 `expected_events` → REGISTRY_STRUCTURE_MALFORMED + exit 1 | 构造缺字段注册表运行 |
| 7 | 逐测试事件数断言：per_test_event_mismatches==0 | 闭包分析输出 |
| 8 | 子壳隔离测试：父 EVENT_SEQ=42，子壳设 999999，父保持 42 | 独立测试脚本 exit 0 |
| 9 | Binding JSON 含 head_commit_at_source_freeze + current_head_at_binding + staleness_declaration | JSON 字段检查 |
| 10 | 隔离纯净 Worktree 全量验证通过 | bash -n / shellcheck / 33/33 / 闭包 / 注册表 / 子壳 / 黄金帧 |

## 非目标

- 不执行独立 WebGL 重渲染对账（SwiftShader 软光栅为法定基准，RENDER-07D 递延至 Phase 6）
- 不执行 PNG IDAT 解码与 bin 逐字节比对（需 pngjs/pngtopnm）
- 不解锁 STEP 5.2-B / 5.2-C / BLOCKED_ENV（双轨原则）

## 约束

- 严格按 trellis 工作流：建任务 → PRD/设计/实现计划 → start → 实现 → 检查 → 提交
- 禁止 git stash，用 git worktree 隔离
- 禁止 binding JSON 硬编码 SHA，必须运行时动态计算
- `.log` 文件被 `.gitignore` 忽略，提交必须 `git add -f`
- 保护区（compiler-core/ evaluation/ schemas/）ZERO DIFF
