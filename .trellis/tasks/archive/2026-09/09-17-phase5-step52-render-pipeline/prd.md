# Phase 5 Step 5.2: WebGL Render Pipeline & Degradation Framework

## Goal

以 Step 5.1 的严格 Manifest 与 Runtime Loader 作为唯一安全输入，实现 WebGL 渲染管线与四级降级框架。生产模块落地于 `chinese-aesthetic/render/`（与 `chinese-aesthetic/runtime/` 平级），全量 RENDER-01~22 规范性验收测试通过，双轨 TypeScript 门禁通过，只读保护区零 diff。

**本任务为补档归档**：代码已在 e157492（初始实现）与 780e64e（全量测试整改）提交中完成，此处建立 trellis 任务记录与证据链。

## Requirements

### 7 个生产模块（chinese-aesthetic/render/）

1. **degradation-ladder.ts** — 四级能力全序格偏序算子与不可逆封顶矩阵
   - CapabilityTier: WEBGL2 > WEBGL1 > STATIC > DOM_NEUTRAL
   - capTierToSession: meet 算子，单调不可逆
   - DegradationLadder: sessionCap 单调降级，reconcileHardware 尊重会话上限

2. **power-manager.ts** — 7 状态 × 11 输入 = 77 格全函数状态机
   - 状态: UNINITIALIZED/ACTIVE/THROTTLED/DORMANT/FROZEN/RESTORING/TERMINAL
   - 严重性上确界合并（joinFreezeSeverity）
   - Guard [10] RESTORING 自循环跃迁副作用（pendingFreeze := true）
   - Guard [11] 优先级决议（pendingFreeze 优先于 visibility）
   - 64 条遥测环形缓冲

3. **raf-engine.ts** — 全局单例 RAF 调度器与租约隔离
   - Symbol.for 全局键，不可枚举属性注册（物理级防探测）
   - 强引用租约（acquireLease），同 Realm 冲突抛 RAF_LEASE_CONFLICT
   - 异常双轨分流：同步 API 立即 rethrow，异步 tick 异常漏斗吸收并驱逐故障订阅者
   - destroy() 零泄漏：cancelAnimationFrame + 清空回调 Map + 释放租约

4. **camera-evaluator.ts** — 刚体相机数学与代数硬防护
   - 标准行主序输入 → 列主序 Float32Array(16) 输出
   - 四阶奇异性防护：数值溢出 → 视线重合（|e-t| < 1e-6）→ Up 共线
   - ZERO_VIEWPORT 判别：零视口返回单位矩阵，无 DrawCall
   - VP = P × V 列主序矩阵乘法

5. **gl-context-tracker.ts** — 硬件状态寄存器与多槽位全解绑
   - 深度测试/LEQUAL/depthMask/clearDepth 默认值
   - CCW 正面 + BACK 背面剔除
   - 多边形偏移（POLYGON_OFFSET_FILL）
   - VAO 架构分派：WebGL2 原生 bindVertexArray / WebGL1 OES_vertex_array_object / 降级解绑 VBO
   - 全纹理单元扫描解绑（动态查询 MAX_COMBINED_TEXTURE_IMAGE_UNITS，钳制 8-32），归位 TEXTURE0
   - disposeAll: 逐资源 deleteBuffer/deleteTexture/deleteProgram，零泄漏

6. **ast-firewall.ts** — 基于 TypeScript Compiler API 的静态语法防火墙
   - AST_RULE_SET_ATTRIBUTE_STYLE: 拦截 setAttribute/setAttributeNS('style', ...)
   - AST_RULE_SET_PROPERTY: 拦截 style.setProperty(...)
   - AST_RULE_STYLE_CSSTEXT: 拦截 style.cssText = ...
   - AST_RULE_STYLE_TRANSFORM: 拦截 style.transform / style.webkitTransform / style['transform']
   - AST_RULE_OBJECT_ASSIGN_STYLE: 拦截 Reflect.set(el, 'style', ...) / Object.assign(el, { style: ... })

7. **gl-pipeline.ts** — 全域运行时管线编排入口
   - 整合 DegradationLadder + PowerManager + RafDispatcher + CameraEvaluator + GlContextTracker
   - 上下文初始化自动降级：WEBGL2 失败 → WEBGL1 → STATIC
   - renderFrame: 视口 DPR 整型对齐（clamp 1.0-2.0）+ 全资源解绑扫描
   - dispose(): PowerManager DISPOSE → GlContextTracker.disposeAll → 引用置空

### 测试套件（tests/chinese-aesthetic/render/）

- pipeline-acceptance.test.ts: RENDER-01 ~ RENDER-22 全量规范性验收
- evidence/render-tests-22.txt: 物理执行 stdout 日志

## Acceptance Criteria

- [x] 7 个生产模块全部落地于 chinese-aesthetic/render/，零占位符，零 TODO/FIXME
- [x] RENDER-01 ~ RENDER-22 全量 22 项测试通过，exit code 0
- [x] GATE-A Scoped TypeScript: 0 diagnostics，exit 0
- [x] GATE-B Repository-wide Baseline: 3/3 matched，0 新增错误
- [x] 只读保护区 compiler-core/、evaluation/、schemas/ 自基线 86df17e 以来 ZERO DIFF
- [x] 测试环境沙箱隔离：beforeEach/afterEach 强制清理 globalThis Symbol 键
- [x] Mock GPU 上下文（createMockGlContext）提供确定性状态寄存器断言

## 测试真实性分类（法医级标注）

| 分类 | 用例 | 说明 |
|---|---|---|
| REAL_JS_RUNTIME | RENDER-01, 20, 22 | 直接操作真实 globalThis/Symbol/Object.freeze，无 mock |
| STATE_MACHINE_UNIT | RENDER-02,03,04,05,17,19,21 | 生产代码 PowerManager 真实状态转移逻辑 |
| PURE_ALGEBRAIC | RENDER-06,11E,12,13,14 | 生产代码纯数学函数求值，无外部依赖 |
| MOCK_GPU_REGISTER | RENDER-08,09,10,11A-D,18 | createMockGlContext 检验寄存器状态与调用路径 |
| AST_STATIC_COMPILER | RENDER-15 | 真实 TypeScript Compiler API 扫描语法树 |
| DOM_PROXY_MEMBRANE | RENDER-16 | 生产级 Proxy 阻断非法样式写入 |
| CRYPTO_STUB | RENDER-07A | TypedArray 缓冲区校验逻辑模拟 |
| JSON_CANONICAL | RENDER-07B | 状态向量序列化一致性 |
| NOT_RUN_IN_UNIT (DEFERRED) | RENDER-07C, 07D | 必须由独立 Playwright/SwiftShader E2E 执行，单元测试中仅为逻辑规格 |

## 已知限制与后续

- **RENDER-07C（SwiftShader 逐字节比对）**：需独立 Playwright + Chromium --use-angle=swiftshader 环境执行，不在 Jest/Node 单元测试范围内
- **RENDER-07D（异构驱动 SSIM 容差）**：需物理 GPU 驱动的 macOS/Windows Nightly 节点，不作为 PR CI 同步阻断
- **真实 WebGL 端到端渲染循环**：当前 GlPipeline 已实现上下文初始化与视口对齐，但完整着色器编译/绘制调用/帧缓冲读取需 Step 5.2-C 阶段
- **STEP 5.2-B 状态**: NOT_APPROVED（BLOCKED_ENV — 生产实现证据不足，测试通过 ≠ 真实光栅化验证完成）
- **STEP 5.2-C 状态**: LOCKED

## 提交链

- 基线: 86df17e (Phase 5 Step 5.1 forensic reconciliation)
- 中间: 4df3f14 (playbooks 初始化，零生产代码影响)
- 初始实现: e157492 (7 模块 + 10 测试)
- 全量测试整改: 780e64e (RENDER-01~22 全量 22 项)
