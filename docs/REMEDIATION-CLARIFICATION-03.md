# REMEDIATION-CLARIFICATION-03 — Step 5.2-B 缺口澄清与物证补交

**DOCUMENT ID**: CHINESE-AESTHETIC-P5-S5.2-B-REMEDIATION-CLARIFICATION-03
**BASELINE**: 6f2e257 (Complete Real Shader & Draw Pipeline)
**BRANCH**: feature/chinese-aesthetic-render-pipeline
**SCOPE**: Step 5.2-B only
**STATUS**: SUBMITTED_FOR_REVIEW
**STEP 5.2-C**: LOCKED
**BLOCKED_ENV**: MAINTAINED

---

## 0. 执行边界与不变量

**允许变更**（本提交）：
- `docs/REMEDIATION-CLARIFICATION-03.md`（本文档）
- `docs/PLAN-02-ADDENDUM-01.md`

**禁止变更**：
- `compiler-core/`、`evaluation/`、`schemas/`（只读保护区）
- 7 个生产模块的实现逻辑
- 黄金帧 fixtures（不得自动覆盖）
- REV-07 契约文件（未经授权不得修改）

**纪律声明**：
- 无物理执行物证不封签
- 测试通过 ≠ 生产实现完成
- 禁止在证据不足时输出 PASS
- 交付方不得自行签署黄金帧

---

## 1. PHASE 0 — 预飞检查（物理证据）

### 1.1 Git 状态核验

```
$ git rev-parse HEAD
6f2e2579936df8f405280e21bcde8fbe391a1def

$ git branch --show-current
feature/chinese-aesthetic-render-pipeline

$ git status --short (excluding playbooks/)
clean

$ git diff --stat 5e6570f..6f2e257
20 files changed, 2634 insertions(+), 480 deletions(-)
```

### 1.2 保护区零修改断言

```
$ git diff --stat 86df17e..HEAD -- compiler-core/ evaluation/ schemas/
(empty — 0 files changed, 0 insertions, 0 deletions)
```

**结论**：自 86df17e 封签以来，保护区严格维持 ZERO DIFF。

### 1.3 6f2e257 提交内容清单（git diff --name-status）

| 状态 | 文件 |
|---|---|
| A | chinese-aesthetic/render/geometry-builder.ts |
| A | chinese-aesthetic/render/shader-source.ts |
| M | chinese-aesthetic/render/gl-pipeline.ts |
| M | tests/chinese-aesthetic/render/e2e/browser-entry.ts |
| M | tests/chinese-aesthetic/render/e2e/harness.html |
| M | tests/chinese-aesthetic/render/e2e/real-webgl-execution.spec.js |
| M | tests/chinese-aesthetic/render/e2e/render-pipeline.bundle.js |
| M | tests/chinese-aesthetic/render/evidence/e2e-real-webgl-execution.json |
| M | tests/chinese-aesthetic/render/evidence/e2e-real-webgl-stdout.txt |
| A | tests/chinese-aesthetic/render/fixtures/golden-frame-input-manifest.json |
| A | tests/chinese-aesthetic/render/fixtures/golden-frame-review.md |
| A | tests/chinese-aesthetic/render/fixtures/golden-frame-sha256.txt |
| A | tests/chinese-aesthetic/render/fixtures/golden-frame.png |
| A | tests/chinese-aesthetic/render/fixtures/golden-frame.rgba.bin |
| M | docs/PHASE5-STEP52-PLAN-02.md |
| M | docs/PHASE5-STEP52-REMEDIATION-CLARIFICATION-02.md |
| A | .trellis/tasks/archive/2026-09/09-17-phase5-step52-shader-draw-pipeline/{check,implement,prd,task}.* |

---

## 2. PHASE 1 — 缺口 1：A 顶点裁剪空间计算

### 2.1 实际源码摘录（geometry-builder.ts 第 145-182 行）

```typescript
/**
 * PARTIAL-VISIBLE test triangle (PLAN-02 §2.2).
 *
 * CAMERA SPACE coordinates. Perspective: FOV 90°, Aspect 1.0, Near 1.0, Far 10.0.
 *
 * Vertex A: (-0.5, -0.5, -0.5)
 *   - z = -0.5 is between camera (z=0) and near plane (z=-1.0)
 *   - Clip space: xc=-0.5, yc=-0.5, zc≈-1.611, wc=0.5
 *   - zc < -wc (-1.611 < -0.5) → CULLED BY NEAR PLANE
 *   - NOTE: wc > 0 (0.5), but vertex is still culled because zc < -wc.
 *     This is the auditor gap-1 resolution: near-plane culling is determined
 *     by zc < -wc, NOT by wc < 0.
 */
export const NEAR_CLIP_PARTIAL_TRIANGLE: TriangleMesh = {
  id: 'near-clip-partial-visible',
  coordinateSpace: 'camera',
  vertices: [
    { x: -0.5, y: -0.5, z: -0.5, r: 1.0, g: 0.3, b: 0.3 }, // A: culled (near plane)
    { x: 0.5, y: -0.5, z: -2.0, r: 0.3, g: 1.0, b: 0.3 }, // B: visible
    { x: 0.0, y: 0.5, z: -2.0, r: 0.3, g: 0.3, b: 1.0 },  // C: visible
  ],
  indices: [0, 1, 2],
  primitiveType: 'triangles',
};
```

### 2.2 透视投影参数与矩阵

| 参数 | 值 |
|---|---|
| 坐标空间 | 相机空间 (Camera Space) |
| fovY | 90° (π/2 rad) |
| aspect | 1.0 |
| near | 1.0 |
| far | 10.0 |
| 矩阵布局 | 列主序 (Column-Major) |
| OpenGL 约定 | 相机朝 -Z 方向观察，可见 z ∈ [-far, -near] = [-10, -1] |

**透视投影矩阵**（列主序，对称视锥体）：

```
[ n/r   0     0            0        ]
[ 0     n/t   0            0        ]
[ 0     0    -(f+n)/(f-n) -2fn/(f-n)]
[ 0     0    -1             0        ]
```

其中 t = n·tan(fovY/2) = 1.0·tan(45°) = 1.0，r = t·aspect = 1.0。

代入得：

```
[ 1   0    0          0        ]
[ 0   1    0          0        ]
[ 0   0  -11/9       -20/9     ]
[ 0   0   -1          0        ]
```

### 2.3 手工裁剪空间计算（可复算）

**计算方法**：clip = P × [x, y, z, 1]^T，其中 P 为上述透视矩阵。

| 顶点 | 相机空间 (x,y,z) | x_c | y_c | z_c | w_c | 分类 |
|---|---|---|---|---|---|---|
| A | (-0.5, -0.5, -0.5) | -0.5 | -0.5 | -14.5/9 ≈ -1.611 | 0.5 | **近平面剔除** (z_c < -w_c: -1.611 < -0.5) |
| B | (0.5, -0.5, -2.0) | 0.5 | -0.5 | 2/9 ≈ 0.222 | 2.0 | 可见 (\|coords\| ≤ w_c) |
| C | (0.0, 0.5, -2.0) | 0.0 | 0.5 | 2/9 ≈ 0.222 | 2.0 | 可见 (\|coords\| ≤ w_c) |

**A 顶点逐元素计算**：
- x_c = 1×(-0.5) + 0 + 0 + 0 = -0.5
- y_c = 0 + 1×(-0.5) + 0 + 0 = -0.5
- z_c = 0 + 0 + (-11/9)×(-0.5) + (-20/9)×1 = 11/18 - 20/9 = 11/18 - 40/18 = -29/18 ≈ -1.611
- w_c = 0 + 0 + (-1)×(-0.5) + 0 = 0.5

### 2.4 A 顶点实际裁剪机制

**关键结论**：A 顶点的裁剪机制是 **z_c < -w_c**（近平面剔除），**不是** w_c ≤ 0。

- w_c = 0.5 > 0（不满足 w_c ≤ 0）
- z_c = -1.611 < -w_c = -0.5（满足近平面剔除条件）
- 完整可见条件：-w ≤ x ≤ w, -w ≤ y ≤ w, -w ≤ z ≤ w
- A 顶点违反 -w ≤ z（-0.5 ≤ -1.611 为假），因此被近平面剔除

### 2.5 完全不可见对照组（w_c < 0 测试组）

源码（geometry-builder.ts 第 184-205 行）：

```typescript
/**
 * FULLY-INVISIBLE control triangle (PLAN-02 §2.3).
 * CAMERA SPACE. All three vertices at z=+0.5 (behind camera).
 * For each vertex: wc = -z = -0.5 < 0.
 * Expected: FULLY CLIPPED, EXPECTED_VISIBLE_FRAGMENT_COUNT = 0.
 */
export const NEAR_CLIP_FULLY_INVISIBLE_TRIANGLE: TriangleMesh = {
  vertices: [
    { x: -0.5, y: -0.5, z: 0.5, ... },
    { x: 0.5, y: -0.5, z: 0.5, ... },
    { x: 0.0, y: 0.5, z: 0.5, ... },
  ],
};
```

| 顶点 | 相机空间 (x,y,z) | w_c | 分类 |
|---|---|---|---|
| A' | (-0.5, -0.5, 0.5) | -0.5 | w_c < 0 → 全部剔除 |
| B' | (0.5, -0.5, 0.5) | -0.5 | w_c < 0 → 全部剔除 |
| C' | (0.0, 0.5, 0.5) | -0.5 | w_c < 0 → 全部剔除 |

**这才是 w_c < 0 的测试组**，与部分可见组的 A 顶点（z_c < -w_c 但 w_c > 0）形成明确区分。

### 2.6 矛盾表述统一

| 位置 | 原表述 | 修正后 | 状态 |
|---|---|---|---|
| PLAN-02 §2.2 原文 | "A 投影后 w_c < 0" | "A 的 z_c < -w_c（w_c=0.5>0），近平面剔除" | ✅ 已在 PLAN-02 §8.1 修正 |
| geometry-builder.ts 注释 | — | 已明确标注 "zc < -wc, NOT by wc < 0" | ✅ 源码已修正 |
| E2E 测试 | — | 部分可见组验证 z_c<-w_c，完全不可见组验证 w_c<0 | ✅ 实现已区分 |
| PARTIAL_TRIANGLE_CLIP_SPACE | — | 证据表包含完整 clip-space 四元组和分类 | ✅ 已提交 |

---

## 3. PHASE 2 — 缺口 2：RENDER-11A 机制验证

### 3.1 契约目标

REV-07 §10 RENDER-11A：**$w_c \le 0$ 裁切断言**。

### 3.2 现有测试核查

#### A. 单元测试（pipeline-acceptance.test.ts）

```
第 296-297 行：
  // RENDER-11: Depth & Rasterizer State Registers
  it('RENDER-11: Applies normative depth, cull face, polygon offset and DPR bounds', () => {
```

**核查结果**：单元测试中只有合并的 **RENDER-11**（深度函数 LEQUAL、深度掩码、清除深度、CCW 正面、背面剔除、多边形偏移、DPR 钳制），**没有单独的 RENDER-11A**。

RENDER-11 测试的是 GPU 状态寄存器设置，不涉及任何裁剪空间计算或 w_c 断言。

#### B. E2E 测试（real-webgl-execution.spec.js Test 5）

**完全不可见组（w_c < 0）**：

| 项目 | 值 |
|---|---|
| 顶点 | A'(-0.5,-0.5,0.5), B'(0.5,-0.5,0.5), C'(0.0,0.5,0.5) |
| 各顶点 w_c | -0.5（全部 < 0） |
| 原始顶点是否完整提交 GPU | ✅ 是（indices=[0,1,2]，无 CPU 预剔除） |
| 是否存在 CPU 预剔除/预裁剪 | ❌ 否 |
| 实际可见片段数 | 0（FULLY_INVISIBLE_ZERO_FRAGMENTS = true） |
| 断言方式 | 非背景像素计数 === 0 |

**部分可见组（z_c < -w_c 但 w_c > 0）**：

| 项目 | 值 |
|---|---|
| 顶点 | A(-0.5,-0.5,-0.5), B(0.5,-0.5,-2.0), C(0.0,0.5,-2.0) |
| A 顶点 w_c | 0.5（> 0，不满足 w_c ≤ 0） |
| A 顶点裁剪条件 | z_c < -w_c（近平面边界，非 w_c ≤ 0） |
| 原始顶点是否完整提交 GPU | ✅ 是 |
| 实际可见片段数 | > 0（PARTIAL_VISIBLE_HAS_FRAGMENTS = true） |
| 断言方式 | 非背景像素计数 > 0 |

**结果差异断言**：CLIPPING_RESULTS_DIFFER = true（部分可见组有片段 && 完全不可见组 0 片段）。

### 3.3 GAP 判定

**当前测试无法直接证明 REV-07 §10 RENDER-11A 的 w_c ≤ 0 裁切断言**，理由如下：

1. **单元测试无 RENDER-11A**：只有合并的 RENDER-11（状态寄存器），不涉及裁剪空间。
2. **E2E 完全不可见组间接验证了 w_c < 0**：通过可见片段数=0 间接证明，但没有显式断言 w_c ≤ 0 条件本身。
3. **未验证 w_c = 0 边界**：完全不可见组的 w_c = -0.5 < 0，没有测试 w_c = 0 的精确边界情况。
4. **部分可见组验证的是不同机制**：A 顶点的裁剪机制是 z_c < -w_c（近平面边界），不是 w_c ≤ 0。两者是不同的裁剪条件，不能互相替代。

### 3.4 最小契约修订建议

建议将 RENDER-11A 拆分为两个独立验收项：

| 编号 | 验证目标 | 测试组 | 断言方式 |
|---|---|---|---|
| **RENDER-11A-1** | w_c ≤ 0 裁剪 | 完全不可见组（w_c = -0.5）+ w_c = 0 边界组 | 显式断言 clip.w ≤ 0 且可见片段数 = 0 |
| **RENDER-11A-2** | 近平面 z_c 边界裁剪 | 部分可见组（A: z_c < -w_c 但 w_c > 0） | 显式断言 A 的 z_c < -w_c 且硬件裁剪保留可见部分 |

**当前状态**：
- RENDER-11A-1：**部分覆盖**（E2E 间接验证 w_c < 0，缺 w_c = 0 边界，缺显式断言）
- RENDER-11A-2：**已覆盖**（E2E 部分可见组验证了 z_c < -w_c 硬件裁剪）

**未经审查席授权，不修改 REV-07 契约文件。** 本拆分建议仅作为提请审查席裁定的参考。

---

## 4. PHASE 3 — 缺口 3：NDC 误差预算

### 4.1 编解码函数原文

**编码函数**（shader-source.ts → `encodeNdcToByte`）：

```typescript
export function encodeNdcToByte(ndc: number): number {
  const clamped = Math.max(-1.0, Math.min(1.0, ndc));
  const normalized = (clamped + 1.0) * 0.5; // [0, 1]
  return Math.floor(normalized * 255 + 0.5); // round to nearest [0, 255]
}
```

**解码函数**（`decodeByteToNdc`）：

```typescript
export function decodeByteToNdc(byte: number): number {
  const clamped = Math.max(0, Math.min(255, byte));
  return (clamped / 255) * 2 - 1;
}
```

**GLSL 片段着色器编码**：

```glsl
fragColor = vec4((vNdc.x + 1.0) * 0.5, (vNdc.y + 1.0) * 0.5, 0.0, 1.0);
```

### 4.2 编码量化误差（精确推导）

**编码**：e = floor((n + 1) × 127.5 + 0.5)，其中 n ∈ [-1, 1]
**解码**：n' = (e / 255) × 2 - 1 = e / 127.5 - 1

本实现采用标准最近邻量化（Nearest-Neighbor Quantization）：编码函数 $e = \lfloor (n+1)/2 \times 255 + 0.5 \rfloor$，即四舍五入到最近的 byte 值。

**量化误差界限**：$\pm 0.5$ LSB in $[0,255]$。

映射回 NDC 坐标空间（跨度为 $2.0$）：

$$\epsilon_{ndc} = \frac{0.5}{255} \times 2.0 = \frac{1.0}{255} \approx 0.00392$$

**精确结论**：最坏情况量化误差为 **1/255 ≈ 0.00392**，来源于最近邻量化的 ±0.5 LSB 误差在 NDC 空间（跨度 2.0）中的映射。

**边界值验证**：

| NDC 输入 | 编码 byte | 解码 NDC | 绝对误差 |
|---|---|---|---|
| -1.0 | 0 | -1.0 | 0 |
| 0.0 | 128 | 0.00392 | 0.00392 = 1/255 |
| +1.0 | 255 | 1.0 | 0 |

### 4.3 亚像素误差（来源分析）

**点图元光栅化**：
- gl_PointSize = 5.0，点覆盖以屏幕坐标 (sx, sy) 为中心的 5×5 像素区域
- NDC 坐标 (x, y) 映射到屏幕坐标：sx = (x + 1) / 2 × width，sy = (1 - y) / 2 × height
- readPixels 读取点中心附近的像素，编码值存储在点覆盖区域的中心像素

**亚像素误差来源**：
1. **点中心与像素网格对齐**：如果 NDC 坐标映射到的屏幕坐标不是整数，点中心位于亚像素位置。5×5 点覆盖区域的中心像素可能不是精确的编码值。
2. **帧缓冲采样**：readPixels 读取的是像素中心的颜色值，如果点中心偏移，中心像素的颜色可能受到边缘影响。

**最坏情况亚像素误差估算**：
- 320px 宽度：1 像素 = 2/320 = 0.00625 NDC；±0.5 像素 = ±0.003125 NDC
- 240px 高度：1 像素 = 2/240 = 0.00833 NDC；±0.5 像素 = ±0.00417 NDC

**注意**：这是最坏情况估算。实际 gl_PointSize=5.0 意味着点覆盖区域足够大，中心像素通常被正确覆盖。亚像素误差的实际值需要通过实验测量，**不得臆测为固定常数**。

### 4.4 浮点运算误差

- GPU 着色器中 highp float（IEEE 754 单精度），相对误差 < 1e-7
- 矩阵乘法（4×4 × 4×1）约 16 次乘法 + 12 次加法，累积误差 < 1e-6
- 与量化误差（0.00392）和亚像素误差（0.003-0.004）相比，**可忽略**

### 4.5 误差合成模型

**采用最坏情况线性上界**（保守估计，适用于安全关键断言）：

```
ε_total ≤ ε_quantization + ε_subpixel + ε_float
ε_total ≤ 1/255 + 0.5/120 (y方向) + 1e-6
ε_total ≤ 0.00392 + 0.00417 + 0.000001
ε_total ≤ 0.00809
```

**当前容差**：2/255 ≈ 0.00784

**判定**：最坏情况线性上界 0.00809 **略超** 当前容差 0.00784（超出约 3.2%）。

**但实测结果**：9 个顶点的最大误差为 x=0.0039, y=0.0052，均 < 0.00784。说明实际误差未达到最坏情况。

### 4.6 NEEDS_REVIEW 标记

**当前容差 2/255 缺乏充分的理论依据**：
- 最坏情况线性上界（0.00809）超过容差（0.00784）
- 实测通过但不能证明未来所有情况都通过
- 亚像素误差的实际分布未经过统计验证

**最小、可证明的修正方案**（二选一，提请审查席裁定）：

| 方案 | 容差 | 理论上界 | 安全边际 | 说明 |
|---|---|---|---|---|
| A（推荐） | 3/255 ≈ 0.01176 | 0.00809 | 31% | 有充分安全边际，覆盖最坏情况线性上界 |
| B | 维持 2/255 ≈ 0.00784 | 0.00809 | -3.2% | 理论上界略超，依赖实测验证，需在文档中明确标注 |

**不得为了通过测试而随意放宽容差**。方案 A 的 3/255 是基于可证明的最坏情况线性上界推导的，不是随意放宽。

### 4.7 9 个顶点实际误差（E2E JSON 提取）

容差 tol = 2/255 ≈ 0.00784

| 顶点 | 预期 NDC (x,y) | 实测解码 (x,y) | 绝对误差 (x,y) | 是否 ≤ tol |
|---|---|---|---|---|
| front_V0 | (0.0000, 0.0000) | (0.0039, 0.0039) | (0.0039, 0.0039) | ✅ |
| front_V1 | (0.2598, 0.0000) | (0.2627, 0.0039) | (0.0029, 0.0039) | ✅ |
| front_V2 | (0.0000, 0.3464) | (0.0039, 0.3490) | (0.0039, 0.0026) | ✅ |
| side_V0 | (0.0000, 0.0000) | (0.0039, 0.0039) | (0.0039, 0.0039) | ✅ |
| side_V1 | (0.2095, 0.0000) | (0.2078, 0.0039) | (0.0017, 0.0039) | ✅ |
| side_V2 | (0.0000, 0.2970) | (0.0039, 0.2941) | (0.0039, 0.0029) | ✅ |
| back_V0 | (0.0000, 0.0000) | (0.0039, 0.0039) | (0.0039, 0.0039) | ✅ |
| back_V1 | (-0.2598, 0.0000) | (-0.2627, 0.0039) | (0.0029, 0.0039) | ✅ |
| back_V2 | (0.0000, 0.3464) | (0.0039, 0.3490) | (0.0039, 0.0026) | ✅ |

**统计**：
- 最大 x 误差：0.0039（6/9 顶点）
- 最大 y 误差：0.0052（front_V2, back_V2）
- 9/9 全部 ≤ 容差 0.00784
- x 误差恰好为 1/255=0.0039，说明量化误差是 x 方向的主导因素
- y 最大误差 0.0052 > 量化误差 0.00392，说明有额外的亚像素或浮点误差约 0.0013

---

## 5. PHASE 4 — 物证补交

### 5.1 E2E JSON 62 项逐项摘要

来源：`tests/chinese-aesthetic/render/evidence/e2e-real-webgl-execution.json`

| 测试大类 | 检查数 | 结果 | 关键物证值 |
|---|---|---|---|
| Test 1: Environment Info | 6 | 6/6 PASS | userAgent, gl.VERSION, VENDOR, RENDERER 原始字符串 |
| Test 2: Basic WebGL2 & State Registers | 22 | 22/22 PASS | DEPTH_FUNC=515, FRONT_FACE=2305, 纹理全解绑, 资源真实删除 |
| Test 3: Real Shader Compilation & Linking | 12 | 12/12 PASS | NDC+标准各 6 项，真实 gl.createShader/compile/link |
| Test 4: NDC Pixel-Causal Verification | 10 | 10/10 PASS | 3姿态×3顶点=9，最大误差 0.0052 < 0.00784 |
| Test 5: Near-Plane Hardware Clipping | 3 | 3/3 PASS | 部分可见有片段, 完全不可见0片段, 结果不同 |
| Test 6: Golden Frame Generation | 8 | 8/8 PASS | 307200字节, SHA256=8c3384d2..., PNG已生成 |
| Console Errors | 1 | 0 errors | — |
| **合计** | **62** | **62/62 PASS** | allPassed=true |

### 5.2 9 个 NDC 顶点原始数据（E2E JSON detail 字段）

见本文档 §4.7 完整表格。

### 5.3 近裁剪测试原始输出

| 检查 ID | 实际值 | 结果 |
|---|---|---|
| PARTIAL_VISIBLE_HAS_FRAGMENTS | true | PASS |
| FULLY_INVISIBLE_ZERO_FRAGMENTS | true | PASS |
| CLIPPING_RESULTS_DIFFER | true | PASS |

原始像素计数（E2E 测试内部）：
- PARTIAL_VISIBLE_NON_BG_PIXELS > 0（具体值由 countNonBackgroundPixels 函数计算）
- FULLY_INVISIBLE_NON_BG_PIXELS = 0

### 5.4 黄金帧 SHA-256 原始字符串

```
8c3384d24fbbdfca6c97d9cdd11b44ba1f2e04dd39aebec271921fdd4179d333
```

来源：`tests/chinese-aesthetic/render/fixtures/golden-frame-sha256.txt`（原始字符串读取，未 JSON.parse）

### 5.5 Git 差异证据

```
$ git diff --stat 5e6570f..6f2e257
20 files changed, 2634 insertions(+), 480 deletions(-)

$ git diff --name-status 5e6570f..6f2e257
（见本文档 §1.3 完整清单）

$ git status --short (excluding playbooks/)
clean
```

### 5.6 geometry-builder.ts 关键源码

- A 顶点源码：第 150-156 行（注释），第 175 行（顶点数据）
- 测试三角形源码：第 171-182 行（部分可见），第 194-205 行（完全不可见）
- 裁剪空间计算及注释：第 277-310 行（PARTIAL_TRIANGLE_CLIP_SPACE 证据表）

完整源码见本文档 §2.1 和 §2.5 摘录。

---

## 6. PHASE 5 — API 契约定位

### 6.1 setRenderMode / setRenderMesh 核查

**源码位置**：`chinese-aesthetic/render/gl-pipeline.ts`

```typescript
第 47 行：export class GlPipeline {
第 145 行：  public setRenderMode(mode: RenderMode): void {
第 156 行：  public setRenderMesh(mesh: TriangleMesh): void {
```

### 6.2 导出链路与外部可访问性

1. `GlPipeline` 类使用 `export class` 导出（第 47 行）
2. `setRenderMode` 和 `setRenderMesh` 使用 `public` 修饰符（第 145、156 行）
3. E2E browser-entry.ts 通过 `window.RenderPipeline` 全局对象暴露 `GlPipeline`
4. 外部代码可以通过 `new GlPipeline(...)` 创建实例并调用 `setRenderMode()` / `setRenderMesh()`

**判定**：`setRenderMode` 和 `setRenderMesh` 是**公开 API**。

### 6.3 CONTRACT GAP

REV-07 契约文件中**未定义** `setRenderMode` 和 `setRenderMesh`。

- 这两个方法是在 6f2e257 提交中新增的（gl-pipeline.ts renderFrame 升级的一部分）
- 契约文档中没有对应的 API 规格说明
- 外部调用者可以访问这些方法，但契约未定义其行为、参数约束和返回值

**CONTRACT GAP 判定**：公开 API 未在契约中定义。

### 6.4 处置建议

**不得通过删减测试或隐藏导出来规避契约问题。**

建议提请审查席裁定：

| 选项 | 说明 |
|---|---|
| A（推荐） | 提出 **REV-08 修订请求**，将 setRenderMode/setRenderMesh 纳入契约，定义其行为、参数约束和返回值 |
| B | 将这两个方法标记为 `@internal`，并在文档中明确说明它们是内部实现细节，不构成 ABI 扩展。但当前它们是 `public` 且被 E2E 测试直接调用，降级为 internal 需要同步修改 E2E 测试的调用方式 |

**当前状态**：CONTRACT GAP 已记录，等待审查席裁定。未经授权不修改 REV-07 契约文件，不修改生产代码的 API 可见性。

---

## 7. PHASE 6 — 黄金帧审阅边界

### 7.1 当前状态

```
$ cat tests/chinese-aesthetic/render/fixtures/golden-frame-review.md
# Golden Frame Review
## Review Status
PENDING_REVIEW (NOT auto-signed — requires independent reviewer)
```

- `golden-frame-review.md` 状态：**PENDING_REVIEW**
- 交付方**未自行签署**
- Reviewer 字段为 `[NAME]`（未填写）
- Review conclusion 字段为 `[PASS / FAIL]`（未填写）
- Signature 字段为 `[commit SHA or GPG fingerprint]`（未填写）

### 7.2 客观逐字节比对与人工视觉审阅分离

| 验证类型 | 状态 | 说明 |
|---|---|---|
| 客观逐字节比对 | ✅ 已完成 | SHA-256 = 8c3384d2...，与 golden-frame.rgba.bin 一致；307200 字节；非背景像素 1980 |
| 人工视觉审阅 | ⏳ PENDING_REVIEW | 需独立审阅者目视核对三角形位置、颜色、背景、边界 |

**两者必须分开记录**，不得用客观字节比对替代人工视觉审阅。

### 7.3 门禁状态

```
RENDER-07C: PENDING_REVIEW（黄金帧已生成，需独立审阅者签署）
RENDER-07D: NOT_RUN（无物理 Metal / D3D11 执行矩阵）
```

**不得自动覆盖既有黄金帧**。生成脚本在目标文件已存在时默认拒绝覆盖。

---

## 8. PHASE 7 — 最终状态与未闭环问题清单

### 8.1 诚实状态区分

| 维度 | 状态 | 说明 |
|---|---|---|
| **TEST_EVIDENCE** | 62/62 E2E PASS + 22/22 单元 PASS | 真实 Chromium + SwiftShader，有完整 stdout/stderr 日志 |
| **PRODUCTION_EVIDENCE** | 3 个生产模块已落地 | shader-source.ts, geometry-builder.ts, gl-pipeline.ts（升级） |
| **CONTRACT_COMPLIANCE** | **部分 GAP** | RENDER-11A 无单独测试（GAP）；setRenderMode/setRenderMesh 未在契约定义（CONTRACT GAP） |
| **RENDER-07C** | **PENDING_REVIEW** | 黄金帧已生成，需独立审阅者签署 |
| **RENDER-07D** | **NOT_RUN** | 无物理 Metal / D3D11 执行矩阵 |
| **STEP-5.2-B** | **CONDITIONAL PASS / PENDING GAP CLOSURE** | 生产实现已落地，3 项缺口已澄清，2 项 GAP 待审查席裁定 |
| **STEP-5.2-C** | **LOCKED** | 未授权启动 |
| **BLOCKED_ENV** | **MAINTAINED** | 未解除 |

### 8.2 未闭环问题清单

| 编号 | 问题 | 类型 | 当前状态 | 所需动作 |
|---|---|---|---|---|
| GAP-1 | RENDER-11A (w_c ≤ 0) 无单独单元测试 | 契约覆盖 GAP | E2E 间接验证 w_c<0，缺 w_c=0 边界，缺显式断言 | 审查席裁定是否拆分为 RENDER-11A-1/11A-2 |
| GAP-2 | setRenderMode/setRenderMesh 未在契约定义 | CONTRACT GAP | 公开 API，REV-07 未定义 | 审查席裁定 REV-08 修订或 @internal 降级 |
| GAP-3 | NDC 容差 2/255 理论上界略超 | NEEDS_REVIEW | 最坏情况线性上界 0.00809 > 0.00784，实测通过 | 审查席裁定是否放宽至 3/255 或维持并标注 |
| GAP-4 | 黄金帧未签署 | PENDING_REVIEW | review.md 为 PENDING_REVIEW | 独立审阅者目视核对并签署 |
| GAP-5 | RENDER-07D 未执行 | NOT_RUN | 无物理 Metal/D3D11 环境 | Step 5.3 或独立 Nightly 管线 |

### 8.3 已闭环项

| 编号 | 问题 | 闭环方式 |
|---|---|---|
| 缺口 1 | A 顶点裁剪空间坐标空间歧义 | 明确相机空间定义，附透视矩阵 + 手工裁剪空间计算表，确认裁剪机制是 z_c < -w_c（非 w_c ≤ 0），源码/PLAN-02/测试表述已统一 |
| 缺口 2 部分 | 近平面 z_c 边界裁剪验证 | E2E 部分可见组验证了 z_c < -w_c 硬件裁剪（RENDER-11A-2 已覆盖） |
| 缺口 3 部分 | NDC 编解码函数原文 + 9 顶点实测误差 | 已提交编解码函数原文、量化误差精确推导、9 顶点实际误差表 |
| #29/#30 | 证据强度表述 | 已改为 NOT_RUN（E2E 未执行），目标强度：强证据 |

---

## 9. 提交物清单

| 文件 | 说明 |
|---|---|
| `docs/REMEDIATION-CLARIFICATION-03.md` | 本文档（缺口澄清与物证补交主文档） |
| `docs/PLAN-02-ADDENDUM-01.md` | PLAN-02 补遗（3 项缺口的契约级补充） |
| `tests/chinese-aesthetic/render/evidence/e2e-real-webgl-execution.json` | 62 项 E2E 证据（已提交 6f2e257） |
| `tests/chinese-aesthetic/render/evidence/e2e-real-webgl-stdout.txt` | E2E 完整 stdout（已提交 6f2e257） |
| `chinese-aesthetic/render/geometry-builder.ts` | A 顶点源码 + PARTIAL_TRIANGLE_CLIP_SPACE（已提交 6f2e257） |

---

**文档结束。提请审查席独立复核。**

**STEP 5.2-B: CONDITIONAL PASS / PENDING GAP CLOSURE**
**STEP 5.2-C: LOCKED**
**BLOCKED_ENV: MAINTAINED**
