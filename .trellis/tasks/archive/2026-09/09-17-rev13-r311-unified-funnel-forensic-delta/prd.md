# PRD: REV-13 R3.11 统一漏斗 Harness + 法医差异审计

## 目标

将 R3.10 的分散验证逻辑整合为带 EXIT trap 统一退出漏斗的 Harness，新增 Freeze→Evidence 差异白名单审计脚本，补齐 Git Blob 类型验证、几何探针容差隔离、注册表单次派发断言。

## 验收标准

| # | 标准 | 验证 |
|---|---|---|
| 1 | 新 harness `rev13-r311-verification-harness.sh` 带 trap EXIT 漏斗，所有阶段状态显式 NOT_RUN→PASS/FAIL | 意外退出时输出状态账本 + exit 1 |
| 2 | `verify-freeze-evidence-delta.sh`：仅允许 A/M，拦截 D/R/C，扩展名仅限 .json/.log，--summary 拦截 mode change | 构造 D/R/mode change 均 exit 1 |
| 3 | Git Blob 验证：`git cat-file -t HEAD:<path>` == blob，且 OID 对账 | harness 输出 blob type + OID |
| 4 | 几何探针容差隔离：清屏色/越界点 0 LSB 严格全等，中心插值点用 --tolerance | verify-golden-frame.js |
| 5 | 注册表 Counter 断言：每个 test_id 在源码中 run_one_test 派发次数 == 1 | registry-validator 输出 |
| 6 | closure analyzer 参数检查：len(sys.argv) < 4 → exit 2（非 IndexError） | 缺参数运行 |
| 7 | 版本统一：harness/registry/binding 均标 1.7.0-REV-13-R3.11 | grep 确认 |
| 8 | 隔离纯净 Worktree 全量验证通过 | bash -n / shellcheck / 33-33 / closure / registry / golden-frame / delta |
| 9 | Binding JSON 动态生成，含 source_freeze + current_head + blob OID | JSON 字段 |
| 10 | 故障注入：缺 jq / 注册表缺字段 / 差异含 D 均 exit 1 | 独立测试 |

## 非目标

- 不执行独立 WebGL 重渲染（RENDER-07D 递延 Phase 6）
- 不做 PNG IDAT 解码与 bin 逐字节比对（需 pngjs）
- 不解锁 STEP 5.2-B / 5.2-C / BLOCKED_ENV

## 约束

- trellis 工作流：建任务→artifacts→start→实现→检查→提交→归档
- 禁止 git stash，用 git worktree 隔离
- .log 需 git add -f
- 保护区 ZERO DIFF
