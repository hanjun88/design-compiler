# Phase 5 Step 5.2 Forensic Remediation & Clarification Dossier — 02

* **DOCUMENT ID**: `CHINESE-AESTHETIC-P5-S5.2-REMEDIATION-CLARIFICATION-02`
* **PARENT**: `REMEDIATION-CLARIFICATION-01`
* **TRACKED BASELINE**: `86df17e` → `049050a`
* **ACTIVE BRANCH**: `feature/chinese-aesthetic-render-pipeline`
* **GATE STATUS**: `BLOCKED_ENV (RENDER_GATE ACTIVE)`
* **SUBJECT**: #26-33 Resource RAII 逐项拆分表（取代"条件强证据"合称）

---

## 1. 澄清目的

应审查席要求，将原 42/42 物理检查中 #26-33 "Resource RAII" 大类从"条件强证据"合称拆解为逐项操作序列，并对每一项独立判定证据强度与防伪说明。

本文件取代 REMEDIATION-CLARIFICATION-01 §1.2 表格中 #26-33 行的"条件强证据"标注。

---

## 2. #26-33 逐项拆分表

### 总览

| 编号 | 资源类型 | 操作序列 | 证据强度 | 判定理由 |
|---|---|---|---|---|
| #26 | Buffer | createBuffer → isBuffer(true) → deleteBuffer → isBuffer(false) | **强证据** | 真实驱动句柄生命周期，isBuffer 查询驱动侧对象表 |
| #27 | Texture | createTexture → isTexture(true) → deleteTexture → isTexture(false) | **强证据** | 真实驱动句柄生命周期，isTexture 查询驱动侧对象表 |
| #28 | Program | createProgram → isProgram(true) → deleteProgram → isProgram(false) | **弱证据（平凡真值）** | 无 attachShader/linkProgram 前提下，program 对象未进入 GPU 管线；isProgram(false) 仅证明句柄已标记删除，不证明 shader 编译/链接/使用 |
| #29 | Framebuffer | createFramebuffer → isFramebuffer(true) → deleteFramebuffer → isFramebuffer(false) | **强证据（待补充）** | 真实驱动句柄生命周期；当前 E2E harness 未执行此项，需在生产实现阶段补充 |
| #30 | Renderbuffer | createRenderbuffer → isRenderbuffer(true) → deleteRenderbuffer → isRenderbuffer(false) | **强证据（待补充）** | 真实驱动句柄生命周期；当前 E2E harness 未执行此项，需在生产实现阶段补充 |
| #31 | Buffer 跟踪注册 | tracker.trackBuffer() → tracker.activeBufferCount === 1 | **逻辑证明** | GlContextTracker 内部 Set 计数，纯 JS 逻辑 |
| #32 | Texture 跟踪注册 | tracker.trackTexture() → tracker.activeTextureCount === 1 | **逻辑证明** | GlContextTracker 内部 Set 计数，纯 JS 逻辑 |
| #33 | Program 跟踪注册 | tracker.trackProgram() → tracker.activeProgramCount === 1 | **逻辑证明** | GlContextTracker 内部 Set 计数，纯 JS 逻辑 |

---

## 3. 逐项详细说明

### #26 Buffer 生命周期（强证据）

**操作序列**：
```javascript
const buf = gl.createBuffer();
gl.isBuffer(buf);        // → true
tracker.trackBuffer(buf);
tracker.disposeAll();    // 内部调用 gl.deleteBuffer(buf)
gl.isBuffer(buf);        // → false
```

**防伪说明**：
- `gl.createBuffer()` 向 GPU 驱动申请真实缓冲区句柄
- `gl.isBuffer(true)` 查询驱动侧对象表，确认句柄已注册
- `gl.deleteBuffer()` 向驱动发送删除指令
- `gl.isBuffer(false)` 确认驱动侧句柄已标记为已删除
- 排除了"仅调用函数不检查返回值"的假阳性
- 排除了"字面量硬编码 true/false"的 mock 假阳性

**E2E 物证**：`tests/chinese-aesthetic/render/evidence/e2e-real-webgl-execution.json` 中 `BUFFER_IS_DELETED: true`

---

### #27 Texture 生命周期（强证据）

**操作序列**：
```javascript
const tex = gl.createTexture();
gl.isTexture(tex);       // → true
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, tex);
tracker.trackTexture(tex);
tracker.disposeAll();    // 内部调用 gl.deleteTexture(tex)
gl.isTexture(tex);       // → false
```

**防伪说明**：
- 同 #26，真实驱动句柄生命周期
- 额外验证了 bindTexture → unbindAllResources 后 `gl.getParameter(gl.TEXTURE_BINDING_2D) === null`
- 排除了"删除但仍绑定"的资源泄漏

**E2E 物证**：`TEXTURE_IS_DELETED: true`，`TEXTURE_2D_BOUND_AFTER_UNBIND: null`

---

### #28 Program 生命周期（弱证据 — 平凡真值）

**操作序列**：
```javascript
const prog = gl.createProgram();
gl.isProgram(prog);      // → true
tracker.trackProgram(prog);
tracker.disposeAll();    // 内部调用 gl.deleteProgram(prog)
gl.isProgram(prog);      // → false
```

**证据强度判定：弱证据（平凡真值）**

**判定理由**：
1. 当前 E2E harness 中，`gl.createProgram()` 创建的 program 对象**未执行** `attachShader`、`linkProgram`、`useProgram`
2. 未链接的 program 对象仅是驱动侧的空壳句柄，未进入 GPU 着色器管线
3. `gl.isProgram(true)` 仅证明空壳句柄已创建
4. `gl.isProgram(false)` 仅证明空壳句柄已标记删除
5. **不能证明** shader 编译成功、链接成功、program 可用于绘制

**正式承认**：交付方在此正式承认，在无 shader 管线阶段，`gl.isProgram() === false` 是平凡真值，不作为 Shader 正常工作的证据。此项在 COMPLETE_REAL_SHADER_AND_DRAW_PIPELINE 阶段升级为强证据的前提是：
- program 必须经过 `attachShader` + `linkProgram` + `getProgramParameter(LINK_STATUS) === true`
- program 必须经过 `useProgram` 实际绑定
- 删除后验证 `gl.getParameter(gl.CURRENT_PROGRAM) === null`

---

### #29 Framebuffer 生命周期（强证据 — 待补充）

**操作序列（计划）**：
```javascript
const fb = gl.createFramebuffer();
gl.isFramebuffer(fb);    // → true
gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
// 可选：attach texture/renderbuffer
gl.deleteFramebuffer(fb);
gl.isFramebuffer(fb);    // → false
```

**当前状态**：当前 E2E harness（049050a）**未执行** framebuffer 生命周期验证。

**补充计划**：在 COMPLETE_REAL_SHADER_AND_DRAW_PIPELINE 阶段的 E2E harness 升级中补充此项，验证：
- `createFramebuffer` → `isFramebuffer(true)`
- `bindFramebuffer` → `checkFramebufferStatus`
- `deleteFramebuffer` → `isFramebuffer(false)`

---

### #30 Renderbuffer 生命周期（强证据 — 待补充）

**操作序列（计划）**：
```javascript
const rb = gl.createRenderbuffer();
gl.isRenderbuffer(rb);   // → true
gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, 320, 240);
gl.deleteRenderbuffer(rb);
gl.isRenderbuffer(rb);   // → false
```

**当前状态**：当前 E2E harness（049050a）**未执行** renderbuffer 生命周期验证。

**补充计划**：同 #29，在生产实现阶段补充。

---

### #31-33 Tracker 内部计数（逻辑证明）

**操作序列**：
```javascript
tracker.trackBuffer(buf);
tracker.activeBufferCount === 1;   // #31
tracker.trackTexture(tex);
tracker.activeTextureCount === 1;  // #32
tracker.trackProgram(prog);
tracker.activeProgramCount === 1;  // #33
tracker.disposeAll();
tracker.isClean === true;
```

**证据强度判定：逻辑证明**

**判定理由**：
- `trackBuffer/trackTexture/trackProgram` 是 GlContextTracker 内部 `Set<WebGLBuffer>` 等的 `add()` 操作
- `activeBufferCount` 等是 `Set.size` 的读取
- 这是纯 JavaScript 逻辑，不涉及 GPU 驱动调用
- 但与 #26-28 结合后，可证明 tracker 跟踪的真实 GPU 资源在 disposeAll 时被真实删除

---

## 4. 修正后的 42 项检查分类汇总

| 大类 | 编号范围 | 项数 | 强证据 | 弱证据 | 逻辑证明 | 待补充 |
|---|---|---|---|---|---|---|
| Context & Caps | #01-06 | 6 | 6 | 0 | 0 | 0 |
| State Registers | #07-15 | 9 | 9 | 0 | 0 | 0 |
| Texture Binding | #16-25 | 10 | 10 | 0 | 0 | 0 |
| Resource RAII | #26-33 | 8 | 2 (#26,#27) | 1 (#28) | 3 (#31-33) | 2 (#29,#30) |
| Framebuffer | #34-38 | 5 | 5 | 0 | 0 | 0 |
| State Machine | #39-42 | 4 | 0 | 0 | 4 | 0 |
| **合计** | | **42** | **32** | **1** | **7** | **2** |

**强证据占比**：32/42 = 76.2%
**含待补充的强证据**：34/42 = 81.0%

---

## 5. 对审查席追加要求的响应

### 5.1 navigator.userAgent 与 gl.VERSION 原始字符串

审查席追加要求（非阻塞）：下一阶段 E2E 证据 JSON 中应显式记录 `navigator.userAgent` 与 `webgl.getParameter(gl.VERSION)` 原始字符串。

**响应**：已在 PLAN-02 §3.2 黄金帧生成步骤中纳入此要求。在 COMPLETE_REAL_SHADER_AND_DRAW_PIPELINE 阶段的 E2E harness 升级中，证据 JSON 将包含：
- `navigator.userAgent`: 原始字符串
- `gl.getParameter(gl.VERSION)`: 原始字符串
- `gl.getParameter(gl.VENDOR)`: 原始字符串
- `gl.getParameter(gl.RENDERER)`: 原始字符串
- `gl.getParameter(gl.SHADING_LANGUAGE_VERSION)`: 原始字符串

### 5.2 #26-33 逐项拆分

**响应**：本文档 §2 已完成逐项拆分，取代原"条件强证据"合称。

---

## 6. 门禁状态

```
REMEDIATION-CLARIFICATION-02:  SUBMITTED
#26-33 SPLIT:                  COMPLETE
STRONG_EVIDENCE:               32/42 (76.2%), 34/42 (81.0% with pending)
WEAK_EVIDENCE:                 1/42 (#28 program, no shader)
LOGIC_PROOF:                   7/42 (#31-33 + #39-42)
PENDING_SUPPLEMENT:            2/42 (#29 framebuffer, #30 renderbuffer)

STEP 5.2-B:                    AUTHORIZED (conditional, pending PLAN-02 review)
STEP 5.2-C:                    LOCKED
BLOCKED_ENV:                    MAINTAINED
```
