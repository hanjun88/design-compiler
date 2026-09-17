# Context: Scene Compilation Contract 验收

## 背景

design-compiler 的场景编译管线从输入配置生成 Golden Scene Pack，包含 scene.json、assets/、evidence/、manifest.json。编译成功不等于契约合规——必须验证输出结构、资产完整性、原子写入安全和证据可追溯性。

## 约束

- scene.json 是唯一运行时配置来源，不得有旁路配置
- 资产必须物理存在，不得伪造或占位
- 原子写入失败时不得破坏已有有效产物
- 验收必须基于真实执行日志，禁止静态推断冒充实机结果
- 保护区 compiler-core/、evaluation/、schemas/ 零修改

## 术语

- **Golden Scene Pack**：经过完整编译和验证的场景包，可作为下游运行时输入
- **原子写入**：先写入临时目录，校验通过后原子重命名替换目标目录
- **单一事实源**：运行时只从 scene.json 读取配置，不依赖其他隐式来源

## 前置条件

1. 编译命令已执行完毕，进程退出码已知
2. 输出目录路径已确认
3. 编译日志已捕获（stdout/stderr）
4. 工作区状态已记录（git status --short）
