# DC-PB-001: Scene Compilation Contract 验收

## Purpose

验证场景编译契约是否满足规定要求，确保 scene.json 作为单一事实源、资产路径结构合规、编译输出完整、原子写入安全。

## Trigger

- Phase 编译完成后
- Golden Scene Pack 产出后
- 任何声称"编译通过"的交付节点

## Inputs

- 编译输出目录（含 scene.json、assets/、evidence/、manifest.json）
- 编译命令与执行日志
- 输入场景配置

## Preconditions

- 编译进程已退出
- 输出目录存在且可读取
- 工作区无未提交的编译产物干扰

## Success Criteria

- scene.json 为唯一运行时配置来源
- 所有声明资产物理存在且 SHA-256 匹配
- 原子写入未遗留破损中间态
- 验收结论绑定真实测试日志，非静态推断

## Outcome

PASS / FAIL / BLOCKED_ENV / NOT_RUN
