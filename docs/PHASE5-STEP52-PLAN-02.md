# PLAN-02 — COMPLETE_REAL_SHADER_AND_DRAW_PIPELINE

* **PLAN ID**: `CHINESE-AESTHETIC-P5-S5.2-PLAN-02`
* **BASELINE**: `049050a`
* **PARENT**: PLAN-01
* **SCOPE**: Step 5.2-B only
* **STATUS**: SUBMITTED_FOR_REVIEW
* **PRODUCTION_CODE**: NOT_STARTED
* **STEP 5.2-C**: LOCKED
* **BLOCKED_ENV**: MAINTAINED

---

## 0. 执行边界与不变量

### 允许变更

- `chinese-aesthetic/render/shader-source.ts` (新增)
- `chinese-aesthetic/render/geometry-builder.ts` (新增)
- `chinese-aesthetic/render/gl-pipeline.ts` (修改 renderFrame)
- `tests/chinese-aesthetic/render/e2e/` (新增黄金帧 fixtures 与测试)

### 禁止变更

- `compiler-core/`、`evaluation/`、`schemas/`
- 86df17e 基线已封签文件
- StrictRuntimeManifest / ImmutableAssetRegistry 契约

所有生产代码变更必须在本 PLAN-02 审查通过后进行。

---

## 1. 补充条件一：相机矩阵进入 GPU 的像素因果验证

### 1.1 技术修正

原建议"片段着色器直接输出 gl_Position.xy"不可直接实现：Fragment Shader 无法访问 Vertex Shader 的 gl_Position 内置变量。

采用以下可观测方案：

```
CPU 预计算顶点 NDC
    ↓
Vertex Shader:
  gl_Position = uViewProjection * vec4(aPosition, 1.0)
  vNdc = gl_Position.xy / gl_Position.w
    ↓
Fragment Shader: 编码插值后的 vNdc 到 RGBA
    ↓
readPixels
    ↓
CPU 解码并与预期 NDC 对比
```

为避免三角形插值掩盖单顶点误差，验证管线使用独立点图元或逐顶点可识别的验证绘制路径。该验证路径不得被当作最终场景渲染实现。

### 1.2 编码方案

对 NDC 范围 [-1, 1] 进行映射：

```
encoded = clamp((ndc + 1.0) * 0.5, 0.0, 1.0)
```

使用 RGBA 8-bit 编码，解码误差目标：

```
absolute_error ≤ 1 / 255
```

编码与解码函数必须是确定性的纯函数，并添加边界测试：-1.0, 0.0, +1.0。

### 1.3 相机姿态矩阵

至少验证以下三组确定性姿态：

| 姿态 | 相机位置 | 观察目标 | Up |
|---|---|---|---|
| 正对 | (0, 0, 5) | (0, 0, 0) | (0, 1, 0) |
| 侧偏 | (3, 0, 5) | (0, 0, 0) | (0, 1, 0) |
| 后偏 | (0, 0, -5) | (0, 0, 0) | (0, 1, 0) |

统一投影参数：
- FOV: 60°
- Aspect: 320 / 240
- Near: 0.1
- Far: 100.0

每种姿态：
- 至少验证 3 个顶点
- 对比 CPU 预期 NDC 与 GPU 回读结果
- 记录矩阵输入指纹、顶点输入指纹和回读原始字节
- 误差超过 1/255 时失败
- 不得仅通过 getUniform 断言认定 GPU 已消费矩阵

注意：NDC 编码验证应采用点图元或逐顶点可辨识的测试设计。普通三角形的插值像素不能单独证明三个顶点各自的精确输出。

---

## 2. 补充条件二：跨近裁剪面三角形

### 2.1 坐标约定

采用相机空间坐标，使用确定性透视矩阵：
- FOV: 90°
- Aspect: 1.0
- Near: 1.0
- Far: 10.0

在 OpenGL 约定下，摄像机朝 -Z 方向观察。

### 2.2 部分可见测试组

使用三角形：

```
A = (-0.5, -0.5, -0.5)
B = ( 0.5, -0.5, -2.0)
C = ( 0.0,  0.5, -2.0)
```

其中：
- A 位于近平面前方，投影后 w_c < 0
- B、C 位于有效可见范围，投影后 w_c > 0
- 三角形跨越近平面

预期：

```
EXPECTED: HARDWARE CLIPPING RETAINS VISIBLE PORTION
CPU PRE-CLIP: FORBIDDEN
```

验证不得在提交给 GPU 前删除 A 或自行切割三角形。原始顶点数据必须保留并记录指纹。

### 2.3 完全不可见对照组

```
A = (-0.5, -0.5, 0.5)
B = ( 0.5, -0.5, 0.5)
C = ( 0.0,  0.5, 0.5)
```

三个顶点均位于摄像机后方，预期：

```
EXPECTED: FULLY CLIPPED
EXPECTED_VISIBLE_FRAGMENT_COUNT: 0
```

### 2.4 证据限制

readPixels 的全画面非零值不能单独证明目标三角形产生了片段。测试必须：
- 使用独立背景色
- 使用目标图元专用颜色或标识区域
- 记录绘制前后的像素差异
- 验证部分可见组与完全不可见组结果不同
- 证明没有 CPU 预剔除或预裁剪

---

## 3. 补充条件三：黄金帧生命周期契约

### 3.1 文件布局

```
tests/chinese-aesthetic/render/
└── fixtures/
    ├── golden-frame.png
    ├── golden-frame.rgba.bin
    ├── golden-frame-sha256.txt
    ├── golden-frame-input-manifest.json
    └── golden-frame-review.md
```

黄金帧的原始 RGBA 字节必须保留。PNG 仅作为可视化审阅载体，不得取代原始像素证据。

### 3.2 生成步骤

生成脚本必须：
1. 启动固定版本的 Headless Chromium
2. 记录 navigator.userAgent 原始字符串
3. 记录 gl.VERSION 原始字符串
4. 记录渲染输入、viewport、DPR、shader 和几何指纹
5. 执行真实 shader 编译、链接和 draw call
6. 读取原始 RGBA 数据
7. 独立计算 SHA-256
8. 若目标黄金文件已存在，默认拒绝覆盖

示例命令由实现方在提交时提供，必须包含完整 stdout、退出码和环境摘要。

### 3.3 首次审阅流程

```
生成脚本 → 原始像素与 PNG
    ↓
独立审阅者检查
    ↓
审阅记录 + 输入指纹 + SHA-256
    ↓
批准后提交 fixtures
```

审阅标准：
- 图元位置符合预期
- 背景与图元边界清晰
- 无意外全屏填充
- 无 clear-only 假阳性
- 画面尺寸、DPR 和 viewport 符合契约
- SHA-256 与原始 RGBA 文件一致

黄金帧不能由生成脚本自动自签为批准状态。

### 3.4 更新策略

仅在以下情况下允许更新：
- shader 或几何契约有经批准的变更
- 渲染环境版本发生明确变更
- 预期输出发生有记录的变化
- 新旧黄金帧均保留
- 独立审阅记录完成

禁止：
- 测试失败 → 自动生成新黄金帧 → 覆盖旧黄金帧

黄金文件、SHA-256、输入清单和审阅记录必须在同一变更集中提交。

### 3.5 期望值读取

黄金帧 SHA-256 文件按原始字符串读取：

```javascript
readFileSync(path, 'utf8').trim()
```

禁止：`JSON.parse(expectedHash)`

---

## 4. 补充条件四：RENDER-07D 处理方案

### 选定方案

**RENDER-07D: NOT_RUN**

### 原因

当前证据材料未证明具备真实物理 Metal / D3D11 执行矩阵。SwiftShader 单环境不能代表跨驱动一致性。

### 处理计划

| 项目 | 处理 | 阶段 |
|---|---|---|
| SwiftShader 黄金帧 | 本阶段执行 | RENDER-07C |
| Metal 环境 | Step 5.3 或独立 Nightly 管线 | — |
| D3D11 环境 | Step 5.3 或独立 Nightly 管线 | — |
| SSIM | 真实渲染输出后计算 | — |
| ΔE₀₀ | 明确色彩空间及比较区域后计算 | — |
| Mock 替身 | 不得宣称 RENDER-07D PASS | — |

本阶段报告必须明确记录：

```
RENDER-07D: NOT_RUN
REASON: REQUIRED PHYSICAL DRIVER MATRIX UNAVAILABLE
```

---

## 5. 实施前置检查

在第一批生产代码提交前，必须完成：

- [x] PLAN-02 四项条件均已定义
- [ ] REMEDIATION-CLARIFICATION-02 已提交
- [ ] #26-33 资源生命周期逐项拆分
- [ ] 保护区状态已记录
- [ ] 86df17e 基线差异已记录
- [ ] 生产模块修改范围已确认
- [ ] 不存在自动覆盖黄金帧逻辑

---

## 6. 提交物清单

### 文档阶段（本提交）

- PLAN-02.md (本文档)
- REMEDIATION-CLARIFICATION-02.md

### 生产实现阶段（PLAN-02 复核通过后另行提交）

- `chinese-aesthetic/render/shader-source.ts`
- `chinese-aesthetic/render/geometry-builder.ts`
- `chinese-aesthetic/render/gl-pipeline.ts` (修改)
- `tests/chinese-aesthetic/render/e2e/real-webgl-execution.spec.js` (升级)
- `tests/chinese-aesthetic/render/fixtures/golden-frame.png`
- `tests/chinese-aesthetic/render/fixtures/golden-frame.rgba.bin`
- `tests/chinese-aesthetic/render/fixtures/golden-frame-sha256.txt`
- `tests/chinese-aesthetic/render/fixtures/golden-frame-input-manifest.json`
- `tests/chinese-aesthetic/render/fixtures/golden-frame-review.md`

---

## 7. 当前门禁裁定

```
PLAN-02:                      SUBMITTED_FOR_REVIEW
PRODUCTION_IMPLEMENTATION:    NOT_STARTED
RENDER-07C:                   PENDING IMPLEMENTATION
RENDER-07D:                   NOT_RUN
STEP 5.2-B:                   AUTHORIZED AFTER PLAN-02 REVIEW
STEP 5.2-C:                   LOCKED
BLOCKED_ENV:                   MAINTAINED
```

PLAN-02 已提交审查；在审查通过前，不授权提交任何生产代码。
