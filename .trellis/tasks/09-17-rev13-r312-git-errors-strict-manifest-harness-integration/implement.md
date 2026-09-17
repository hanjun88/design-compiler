# Implement Plan: REV-13 R3.12

## Phase 1: 修复
- [ ] 1.1 verify-freeze-evidence-delta.sh：移除 `|| true`，git 失败 → exit 1
- [ ] 1.2 verify-golden-frame.js：严格 SHA 清单解析（64-hex + 文件名 + 单条）
- [ ] 1.3 rev13-r311-verification-harness.sh：集成 golden frame 验证（STATUS_GOLDEN_FRAME），版本 → R3.12

## Phase 2: 验证
- [ ] 2.1 bash -n / shellcheck 全过
- [ ] 2.2 故障注入：无效 SHA → delta exit 非零；篡改清单 → golden frame exit 1
- [ ] 2.3 隔离 Worktree 运行 harness（10 阶段全 PASS）

## Phase 3: 证据 + 收尾
- [ ] 3.1 提交源码冻结 + 证据
- [ ] 3.2 delta audit Freeze→Evidence
- [ ] 3.3 trellis finish + archive + 推送
