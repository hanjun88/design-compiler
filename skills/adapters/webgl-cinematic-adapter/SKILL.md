---
name: webgl-cinematic-adapter
description: WebGL 电影感适配器 — 将 ExecutionPlan 适配为 WebGL2 可执行渲染指令。HeartMirror 参考运行时的适配器层，负责能力探测、Shader 编译、离屏渲染。
version: 0.1.0
---

# WebGL Cinematic Adapter

> 运行时适配器 — 将编译产物翻译为 WebGL2 渲染指令并执行离屏渲染。

## 职责

1. WebGL2 上下文创建与能力探测
2. Shader 编译与 Program 链接
3. 纹理 / Buffer / Framebuffer 资源管理
4. 执行 ExecutionPlan 的渲染步骤
5. 离屏渲染产出与哈希计算
6. 资源释放（dispose 闭环）

## 渲染管线

```
setup-context → load-assets → compile-shaders → apply-patches
→ render-frame → post-process (film-grain / color-grading / dithering)
→ composite → output
```

## 后处理通道

- 胶片颗粒（Film Grain Overlay，3-6%，Overlay/Soft Light）
- 色彩分级（Color Grading）
- 去色带（De-banding / Dithering）
- 泛光（Bloom）

## AI 伪影消除

- 环状颗粒感检测与消除
- 塑料油润感检测与消除
- 数码过拟合味检测与消除

## 资源安全

- 所有 WebGL 资源严格闭环（create ↔ delete）
- webglcontextlost / webglcontextrestored 捕获与恢复
- dispose() 递归释放全部句柄，零内存/显存泄漏

## 框架占位

本文件为框架占位，具体渲染逻辑待实现。
