# Implement Plan: REV-13 R3.8-R3.10

## 执行顺序

### Phase 1: RENDER-07C 验证器重写（R3.8 → R3.9 → R3.10）

- [x] **Step 1.1**：重写 `scripts/verify-golden-frame.js`
  - 实现 `--bin/--png/--tolerance/--compare-bin` CLI 参数解析
  - 差异 > tolerance → `process.exit(1)`（原 WARN-only）
  - 增加 4 角点清屏色断言 [13,26,38,255]
  - 退出码契约：0=pass, 1=fail, 2=usage error
  - Commit: `bf3aa09`

- [x] **Step 1.2**：恢复 SHA 清单 + PNG IHDR（R3.9）
  - 恢复 `.sha256` 清单独立读取与严格比对
  - PNG 二进制头校验：Magic bytes + IHDR chunk (320x240)，零外部依赖
  - `--sha256` 参数指定清单路径
  - 默认 tolerance = 2 LSB
  - Commit: `115c648`

- [x] **Step 1.3**：几何正向断言 + 精确计数（R3.10）
  - 新增 `TRIANGLE_CENTER_RENDERED`：(160,120) 必须 == [129,93,95,255]
  - 非背景像素计数：精确 == 1980（原 > 0）
  - Commit: `70a236d`

### Phase 2: REV-13 闭包分析器严格化

- [x] **Step 2.1**：expected_events 动态化（R3.8）
  - 注册表 33 项添加 `"expected_events": 3`
  - 闭包分析器：`total_expected_events = sum(t['expected_events'])`
  - Commit: `bf3aa09`

- [x] **Step 2.2**：移除默认回退 + 逐测试断言（R3.9）
  - 移除 `t.get('expected_events', 3)`，缺失即 `REGISTRY_STRUCTURE_MALFORMED`
  - 新增 `per_test_expected_events` 映射
  - 新增 `per_test_event_mismatches` 断言
  - `strictly_passed` 计数使用 `expected_test_count`（非硬编码 33）
  - Commit: `115c648`

- [x] **Step 2.3**：注册表类型防御（R3.8，R3.9 强化）
  - 顶层非 object / tests 非 list / 条目非 dict → 结构化错误 + exit 1
  - 3 类畸变实测全部 exit 1

### Phase 3: 子壳隔离证据

- [x] **Step 3.1**：独立隔离测试脚本
  - 创建 `playbooks/verification/rev13-r39-subshell-isolation-test.sh`
  - 父 EVENT_SEQ=42 → 子壳设 999999/1000000 → 父保持 42
  - 代码审计：grep 确认 4 赋值点全在父进程，0 在 t_* 函数
  - Commit: `115c648`

### Phase 4: Binding JSON 时效性

- [x] **Step 4.1**：方案 A 字段
  - `head_commit_at_source_freeze` + `current_head_at_binding`
  - `binding_staleness_declaration` + `source_freeze_verified_by`
  - `worktree_isolation` 四维声明
  - `sha256_manifest_history` 历史澄清
  - `png_validation_scope` 范围声明
  - `environment_baseline` 环境声明
  - Commit: `2a5ef9a`（证据）

### Phase 5: 隔离纯净 Worktree 验证

- [x] **Step 5.1**：每轮在源码冻结 commit 的 detached worktree 中运行
  - `git worktree add --detach /tmp/heartmirror-audit-<sha> <commit>`
  - bash -n / shellcheck / selftest / closure / registry / subshell / golden-frame
  - 生成 binding JSON（动态计算所有 SHA）
  - 复制证据回主仓库，`git add -f` 提交 .log 文件
  - `git worktree remove --force` 清理

## 验证命令

```bash
# 验证器退出码
node scripts/verify-golden-frame.js --bin <bin> --png <png> --sha256 <sha>  # exit 0
node scripts/verify-golden-frame.js --bin <bin> --compare-bin <corrupt>      # exit 1
node scripts/verify-golden-frame.js                                          # exit 2

# 闭包分析
python3 playbooks/verification/rev13-closure-analyzer.py \
  --stdout <out> --stderr <err> --registry <reg>

# 子壳隔离
bash playbooks/verification/rev13-r39-subshell-isolation-test.sh

# 注册表畸变
echo '[]' > /tmp/bad.json && python3 ... --registry /tmp/bad.json  # exit 1
```

## 回滚点

- 每个 Phase 独立 commit，可 `git revert` 单步回滚
- 证据提交（e5aa6e8, 3257a76, 2a5ef9a）不包含源码变更，回滚不影响功能
