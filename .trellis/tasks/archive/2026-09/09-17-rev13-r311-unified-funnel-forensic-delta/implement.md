# Implement Plan: REV-13 R3.11

## Phase 1: 新文件创建
- [ ] 1.1 创建 `playbooks/verification/rev13-r311-verification-harness.sh`（统一漏斗 + trap EXIT + 状态账本 + blob 类型验证 + 原子写入）
- [ ] 1.2 创建 `playbooks/verification/verify-freeze-evidence-delta.sh`（--name-status 白名单 + --summary 模式变更防线）

## Phase 2: 现有文件加固
- [ ] 2.1 `scripts/verify-golden-frame.js`：容差隔离（STRICT_ZERO_PROBES + TOLERATED_PROBES），--strict-exact
- [ ] 2.2 `playbooks/verification/rev13-registry-validator.py`：Counter 单次派发断言，版本 1.7.0-REV-13-R3.11
- [ ] 2.3 `playbooks/verification/rev13-closure-analyzer.py`：参数检查 len < 4 → exit 2
- [ ] 2.4 `tests/chinese-aesthetic/render/evidence/rev13-test-registry.json`：版本号更新

## Phase 3: 验证
- [ ] 3.1 bash -n 所有新/改脚本
- [ ] 3.2 shellcheck 零 warning
- [ ] 3.3 故障注入：缺 jq / 注册表缺字段 / 差异含 D → 均 exit 1
- [ ] 3.4 verify-freeze-evidence-delta.sh：正常 A/M 通过，D/R/mode change 拒绝

## Phase 4: 隔离 Worktree 证据
- [ ] 4.1 git worktree add --detach 源码冻结 commit
- [ ] 4.2 运行新 harness，生成 binding JSON
- [ ] 4.3 运行 verify-golden-frame.js（正常 + --strict-exact）
- [ ] 4.4 运行 verify-freeze-evidence-delta.sh
- [ ] 4.5 复制证据，git add -f，提交，推送

## Phase 5: trellis 收尾
- [ ] 5.1 提交 trellis artifacts
- [ ] 5.2 task.py finish + archive
