# Design: REV-13 R3.8-R3.10

## 1. RENDER-07C 验证器架构

### 1.1 退出码契约
- `exit 0`：全部断言通过
- `exit 1`：验证失败（SHA 不匹配、像素差异、清屏色违规、PNG 头损坏、字节不匹配）
- `exit 2`：用法错误（缺参数、文件不存在、非法 tolerance）

### 1.2 断言层级（从结构到语义）
1. **文件存在性**：`--bin` 必填，`--png`/`--sha256`/`--compare-bin` 可选
2. **字节长度**：必须 == 320*240*4 = 307200
3. **SHA 清单**：独立读取 `golden-frame-sha256.txt`，与实时计算严格比对
4. **PNG 头**：Magic bytes (89 50 4E 47 0D 0A 1A 0A) + IHDR chunk (320x240)，零外部依赖
5. **清屏色四角点**：(2,2)/(317,2)/(2,237)/(317,237) 必须 == [13,26,38,255]（源码 clearColor(0.05,0.1,0.15)）
6. **几何正向断言**：(160,120) 必须 == [129,93,95,255]（实测 RGB 三角形插值色，证明图元渲染）；(10,10) 必须 == 清屏色（证明无越界泄漏）
7. **非背景精确计数**：必须 == 1980（原 > 0， catches 渲染不确定性）
8. **逐字节对账**（`--compare-bin`）：差异 > tolerance 则 exit 1

### 1.3 Tolerance 契约
- 单位：LSB（Least Significant Bit，整数 [0,255]）
- 默认：2 LSB（绑定卷宗 §2 理论误差上界 2/255 ≈ 0.007843 NDC）
- 换算：Δ_byte ≤ N LSB ⟺ Δ_NDC ≤ N/255

## 2. REV-13 闭包分析器架构

### 2.1 expected_events 严格化
- R3.8：`t.get('expected_events', 3)` — 有默认回退（审查席否决：硬编码换皮）
- R3.9：移除回退，字段必须显式存在且为正整数，缺失即 `REGISTRY_STRUCTURE_MALFORMED`
- 注册表 33 项逐项声明 `"expected_events": 3`

### 2.2 逐测试事件数独立断言
- 新增 `per_test_expected_events` 映射（test_id → expected_events）
- 闭包分析中校验每个 test_id 的实际事件数 == 声明值
- 不匹配 → `per_test_event_mismatches` 非空 → closure_verdict=FAIL

### 2.3 注册表类型防御（P1-2）
- 顶层非 object → `registry_is_object=false`
- tests 非 list → `registry_tests_is_array=false`
- 条目非 dict → `malformed_registry_entries`
- 全部 → 结构化错误 + exit 1，零未捕获异常

## 3. 子壳隔离证明架构

### 3.1 独立测试脚本（`rev13-r39-subshell-isolation-test.sh`）
- 父进程设 EVENT_SEQ=42
- 子壳 `( EVENT_SEQ=999999; EVENT_SEQ=$((EVENT_SEQ+1)) )`
- 断言父进程 EVENT_SEQ 仍为 42
- 代码审计：grep -n 'EVENT_SEQ=' 确认 4 个赋值点全在父进程函数（record_test_result/run_one_test/main），0 个在 t_* 测试函数

### 3.2 单写者模型（Single-Writer Principle）
- EVENT_SEQ 仅在父进程修改
- 子壳 `( ... )` 执行测试函数，仅通过退出码 $? 与父进程通信
- 子壳内变量修改天生不影响父壳（Bash COW 语义）

## 4. Binding JSON 时效性方案（方案 A）

### 4.1 字段设计
```json
{
  "head_commit_at_source_freeze": "<源码冻结 commit>",
  "current_head_at_binding": "<绑定时 HEAD>",
  "binding_staleness_declaration": "evidence commit only; no source change in source_freeze..evidence_commit",
  "source_freeze_verified_by": "git diff --stat (expected: 0 source files changed)"
}
```

### 4.2 两阶段提交协议
- 阶段 1（代码冻结）：提交源码，记录 freeze commit
- 阶段 2（物证捕获）：在 freeze commit 的隔离 worktree 中运行 harness，生成 binding JSON
- 阶段 3（审计留痕）：提交证据，binding JSON 记录 freeze commit，证据提交仅追加 .log/.json

### 4.3 零源码变更验证
`git diff --stat <freeze>..<evidence> -- playbooks/ scripts/ tests/.../registry.json` 必须为空

## 5. .sha256 清单历史澄清

| 阶段 | Commit | 状态 |
|---|---|---|
| 引入 | 4a6f777 | 原始版本含 SHA 清单校验 |
| 丢失 | bf3aa09 (R3.8) | 重写验证器时移除，改为仅打印 SHA |
| 恢复 | 115c648 (R3.9) | 恢复为 `--sha256` 参数 + 严格比对 |
| 影响 | — | 丢失期间 golden-frame 资产未变，证据不受影响 |

## 6. Detached Worktree 四维防线

1. **checkout_commit**：严格绑定源码冻结提交
2. **file_source**：100% git tree object，不复制主工作区未跟踪文件
3. **isolation**：/tmp 目录，无符号链接，`git status --porcelain` 必为空
4. **cleanup**：`git worktree remove --force` 物理销毁
