# playbooks: add DC-PB-001~004 all static PASS

## Goal

Add 4 project playbooks (DC-PB-001 scene-compilation-contract, DC-PB-002 physical-asset-gate, DC-PB-003 compilation-failure-diagnosis, DC-PB-004 delivery-evidence-seal) plus verification scripts and updated README index. All 4 playbooks pass static review (REV-3~17). Scope: playbooks/ directory only, excludes .trellis/tasks/ and __pycache__.

## Requirements

- 提交 4 个 playbook 目录（scene-compilation-contract / physical-asset-gate / compilation-failure-diagnosis / delivery-evidence-seal），每个含 README.md / context.md / procedure.md / verification.md
- 提交 playbooks/verification/ 下的验证脚本（rev13-*.sh / *.py，排除 __pycache__）
- 提交 playbooks/README.md 索引更新
- 排除 .trellis/tasks/ 旧任务目录和 playbooks/verification/__pycache__/
- commit message 标注各 playbook 最终版本和 PASS 状态

## Acceptance Criteria

- [ ] git status 显示仅 playbooks/ 相关文件被暂存
- [ ] commit 成功，commit message 含 DC-PB-001~004 版本号
- [ ] 提交后 git status 干净（playbooks 相关）
- [ ] trellis 任务 finish + archive

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
