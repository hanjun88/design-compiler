# DC-PB P1 Remediation: README Title Fix + Protection Zone Expansion

## Goal

修复审查席 DC-PB-001~004 内容审查发现的 3 项 P1 级缺陷：2 个 README 标题编号互相错位，1 个 DC-PB-004 保护区定义未同步 B4 扩张。

## Requirements

- R1: `playbooks/compilation-failure-diagnosis/README.md` 标题从 `DC-PB-003` 修正为 `DC-PB-002`
- R2: `playbooks/physical-asset-gate/README.md` 标题从 `DC-PB-002` 修正为 `DC-PB-003`
- R3: `playbooks/delivery-evidence-seal/context.md` 保护区表格增加 `chinese-aesthetic/scene-contract/` 行
- R4: `playbooks/delivery-evidence-seal/procedure.md` `PROTECTED_AREAS` 变量增加 `chinese-aesthetic/scene-contract/`
- R5: 仅修改上述 4 个文件，不得触碰验收逻辑、退出码语义或其他内容
- R6: 提交单一职责，不混入无关变更

## Acceptance Criteria

- [ ] AC1: DC-PB-002 README 首行为 `# DC-PB-002: 编译失败诊断与恢复`
- [ ] AC2: DC-PB-003 README 首行为 `# DC-PB-003: 物理资产门禁与真实视频验证`
- [ ] AC3: DC-PB-004 context.md 保护区表包含 `chinese-aesthetic/scene-contract/`
- [ ] AC4: DC-PB-004 procedure.md PROTECTED_AREAS 包含 `chinese-aesthetic/scene-contract/`
- [ ] AC5: `git diff --check` 无空白错误
- [ ] AC6: 变更范围仅 4 个文件
- [ ] AC7: trellis 完整流程（create → prd → start → implement → verify → commit → finish → archive）

## Constraints

- 轻量级文档修复，PRD-only
- 追加提交模式，禁止 amend
- 保护区扩张与 B4 (c9d48f7) harness 保护矩阵保持一致
