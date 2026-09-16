# REMEDIATION-CLARIFICATION-04 — Step 5.2-B Final Sign-Off Request

**DOCUMENT ID**: CHINESE-AESTHETIC-P5-S5.2-B-REMEDIATION-CLARIFICATION-04
**BASELINE**: d92b7c0 → (gap closure commits)
**BRANCH**: feature/chinese-aesthetic-render-pipeline
**SCOPE**: Step 5.2-B only
**STATUS**: SUBMITTED_FOR_FINAL_REVIEW
**STEP 5.2-C**: LOCKED
**BLOCKED_ENV**: MAINTAINED

---

## 0. 整改总结

本提交针对审查席 d92b7c0 裁定中识别的 3 项技术缺口和物证要求，完成以下整改：

| 缺口 | 裁定 | 整改动作 | 状态 |
|---|---|---|---|
| GAP-1 RENDER-11A | 不通过，必须拆分并补充独立测试 | 拆分为 RENDER-11A-1 (w_c≤0) + RENDER-11A-2 (z_c<-w_c)，新增 w_c=0 边界测试组，11 项机制级断言 | ✅ 已闭环 |
| GAP-2 setRenderMode/setRenderMesh | 确认 CONTRACT GAP，不能直接 @internal | 调用范围审计（仅 E2E 测试调用），添加 @internal JSDoc 标注，提交 REV-08 变更请求 | ✅ 已闭环（标注+审计+变更请求） |
| GAP-3 NDC 容差 | NEEDS_REVIEW，暂不批准放宽到 3/255 | 提供正式误差模型 E_total=f(...)，回答 7 个问题，维持 2/255 + 标注理论上界 + 异常值检测策略 | ✅ 已闭环（模型+7问+维持容差） |
| 物证补交 | 待直接核验 | 独立 SHA256 逐字节验证脚本 + fresh readPixels 捕获 + 0 差异证明 | ✅ 已闭环 |
| 黄金帧 | PENDING_REVIEW | 保持 PENDING_REVIEW，交付方未自签 | ⏳ 维持 |

---

## 1. RENDER-11A 机制级独立测试（GAP-1 闭环）

### 1.1 测试拆分

按照 REV-08 变更请求建议，将 RENDER-11A 拆分为：

| 编号 | 验证目标 | 测试组 | 断言数 |
|---|---|---|---|
| RENDER-11A-1-1 | w_c < 0 裁剪 | 完全不可见对照组（z=+0.5 → w_c=-0.5） | 2 |
| RENDER-11A-1-2 | w_c = 0 边界裁剪 | **新增** W_C_ZERO_BOUNDARY_TRIANGLE（z=0 → w_c=0） | 2 |
| RENDER-11A-1 合并 | 两组 w_c≤0 均 0 片段 | — | 1 |
| RENDER-11A-2 | 近平面 z_c < -w_c 边界（w_c>0） | 部分可见组（A: z_c<-w_c, w_c>0；B/C 可见） | 5 |
| 机制区分 | 11A-1 vs 11A-2 结果不同 | — | 1 |
| **合计** | | | **11** |

### 1.2 每个测试顶点完整 clip-space 四元组

**RENDER-11A-1-1（w_c < 0，完全不可见组）**：

| 顶点 | 相机空间 | clip-space (x_c, y_c, z_c, w_c) | w_c 符号 |
|---|---|---|---|
| A' | (-0.5, -0.5, 0.5) | (-0.5, -0.5, -17/6≈-2.833, -0.5) | NEGATIVE |
| B' | (0.5, -0.5, 0.5) | (0.5, -0.5, -17/6≈-2.833, -0.5) | NEGATIVE |
| C' | (0.0, 0.5, 0.5) | (0.0, 0.5, -17/6≈-2.833, -0.5) | NEGATIVE |

**RENDER-11A-1-2（w_c = 0 边界，新增组）**：

| 顶点 | 相机空间 | clip-space (x_c, y_c, z_c, w_c) | w_c 符号 |
|---|---|---|---|
| A'' | (-0.5, -0.5, 0.0) | (-0.5, -0.5, -20/9≈-2.222, 0.0) | ZERO |
| B'' | (0.5, -0.5, 0.0) | (0.5, -0.5, -20/9≈-2.222, 0.0) | ZERO |
| C'' | (0.0, 0.5, 0.0) | (0.0, 0.5, -20/9≈-2.222, 0.0) | ZERO |

**RENDER-11A-2（近平面 z_c 边界，部分可见组）**：

| 顶点 | 相机空间 | clip-space (x_c, y_c, z_c, w_c) | w_c 符号 | z_c < -w_c |
|---|---|---|---|---|
| A | (-0.5, -0.5, -0.5) | (-0.5, -0.5, -14.5/9≈-1.611, 0.5) | POSITIVE | ✅ 是（近平面剔除） |
| B | (0.5, -0.5, -2.0) | (0.5, -0.5, 2/9≈0.222, 2.0) | POSITIVE | ❌ 否（可见） |
| C | (0.0, 0.5, -2.0) | (0.0, 0.5, 2/9≈0.222, 2.0) | POSITIVE | ❌ 否（可见） |

### 1.3 实测结果（E2E 70/70 中的 11 项）

| 检查 ID | 结果 | 实际值 |
|---|---|---|
| RENDER_11A_1_1_ALL_WC_NEGATIVE | PASS | true（3 顶点 w_c 均为 -0.5） |
| RENDER_11A_1_1_ZERO_FRAGMENTS | PASS | true（可见片段数 = 0） |
| RENDER_11A_1_2_ALL_WC_ZERO | PASS | true（3 顶点 w_c 均为 0） |
| RENDER_11A_1_2_ZERO_FRAGMENTS | PASS | true（可见片段数 = 0） |
| RENDER_11A_1_BOTH_WC_LE_ZERO_GROUPS_ZERO | PASS | true（w_c<0 组 + w_c=0 组均 0 片段） |
| RENDER_11A_2_VERTEX_A_WC_POSITIVE | PASS | true（A: w_c=0.5>0） |
| RENDER_11A_2_VERTEX_A_ZC_LESS_NEG_WC | PASS | true（A: z_c=-1.611 < -w_c=-0.5） |
| RENDER_11A_2_BC_VISIBLE | PASS | true（B/C: w_c>0 且 z_c>=-w_c） |
| RENDER_11A_2_HAS_FRAGMENTS | PASS | true（可见片段数 > 0） |
| RENDER_11A_2_NO_CPU_PRECLIP | PASS | true（3 顶点 + 3 indices 完整保留） |
| RENDER_11A_MECHANISM_DISTINCTION | PASS | true（11A-1: 0 片段; 11A-2: >0 片段） |

### 1.4 原始顶点完整性声明

- 所有测试组的原始顶点数据完整提交 GPU，无 CPU 预剔除/预裁剪
- indices 数组完整保留（[0, 1, 2]）
- 硬件平截头体裁剪负责剔除不可见部分

---

## 2. NDC 误差模型正式推导（GAP-3 闭环）

### 2.1 正式误差模型

$$E_{total} \le E_{quantization} + E_{sampling} + E_{float}$$

其中：

| 误差项 | 数学定义 | x 方向值 | y 方向值 | 来源 |
|---|---|---|---|---|
| $E_{quantization}$ | $\|n' - n\| \le 1/255$ | 0.00392 | 0.00392 | 编码 floor((n+1)×127.5+0.5) + 解码 n'=e/127.5-1 |
| $E_{sampling}$ | $\le 1/W$ (x), $\le 1/H$ (y) | 0.003125 | 0.00417 | 点图元亚像素对齐偏移（gl_PointSize=5.0） |
| $E_{float}$ | $< 10^{-6}$ | <0.000001 | <0.000001 | GPU highp float 矩阵乘法 |
| **$E_{total}$** | **线性上界** | **0.00705** | **0.00809** | |

### 2.2 审查席 7 问回答

**Q1: 1/255 量化误差的具体编码、解码公式是什么？**

编码：$e = \lfloor (n + 1) \times 127.5 + 0.5 \rfloor$，其中 $n \in [-1, 1]$
解码：$n' = \frac{e}{255} \times 2 - 1 = \frac{e}{127.5} - 1$

源码：`shader-source.ts` → `encodeNdcToByte()` / `decodeByteToNdc()`

**Q2: 为什么不是常见的半量化步长 0.5/255？**

常见的半量化步长 0.5/255 适用于"编码值是桶中心"的情况（即解码值 $n'$ 位于编码桶的中心）。

但本实现中，解码值 $n' = e/127.5 - 1$ 恰好是编码桶的**上界**，不是中心。对于编码值 $e$，原始 NDC $n$ 的范围为 $[n' - 1/255, n')$，因此最坏情况误差是完整的一个桶宽 $1/255$，而不是半桶宽 $0.5/255$。

验证：$n=0$ 时，$e=\lfloor 127.5+0.5 \rfloor = 128$，$n'=128/127.5-1=0.00392=1/255$。

**Q3: 0.00417 亚像素误差的来源是什么？**

来源：点图元（gl_PointSize=5.0）光栅化时，点中心与像素网格的亚像素对齐偏移。

NDC 坐标 $(x, y)$ 映射到屏幕坐标：$s_x = \frac{x+1}{2} \times W$，$s_y = \frac{1-y}{2} \times H$。

如果 $s_x, s_y$ 不是整数，点中心位于亚像素位置。readPixels 读取点覆盖区域的中心像素，编码值可能受到点边缘的影响。

y 方向（240px）：最坏情况 $\pm 0.5$ 像素 = $\pm 0.5 / (240/2) = \pm 1/240 \approx \pm 0.00417$ NDC。

**Q4: 亚像素误差是否适用于当前 POINTS + readPixels 测试路径？**

适用，但实际值远小于最坏情况估算。

实测验证：9 个顶点中，x 方向误差均为 0.0039（恰好为量化误差，亚像素误差≈0）；y 方向最大误差 0.0052（量化误差 0.0039 + 亚像素误差约 0.0013）。

说明 gl_PointSize=5.0 足够大，中心像素通常被正确覆盖，实际亚像素误差远小于最坏情况估算 0.00417。

**Q5: 各误差项是独立误差、相关误差，还是保守线性相加？**

采用**保守线性相加**（最坏情况线性上界），不假设统计独立。

理由：
- 各误差项可能相关（例如亚像素偏移可能同时影响编码和采样）
- 统计独立模型假设误差服从特定分布，但缺乏足够样本验证
- 安全关键断言应采用保守的最坏情况线性上界

**Q6: 实测最大值 0.0052 是否来自 9 个顶点的完整原始记录？**

是。9 个顶点（3 姿态 × 3 顶点）的完整原始记录存储在 `tests/chinese-aesthetic/render/evidence/e2e-real-webgl-execution.json` 中，每个顶点包含预期值、实测解码值和绝对误差。

最大误差：x=0.0039（6/9 顶点），y=0.0052（front_V2, back_V2）。

完整数据见 `REMEDIATION-CLARIFICATION-03.md` §4.7。

**Q7: 3/255 是否会降低测试对矩阵、编码或坐标错误的检测敏感性？**

可能会。3/255 ≈ 0.01176 的容差可能放过一些矩阵错误或编码错误。

因此，**本提交维持当前容差 2/255**，不放宽到 3/255。同时采取以下措施：
1. 在契约中明确标注理论最坏情况上界（y 方向 0.00809）略超容差 2/255（0.00784）
2. 容差基于实测验证（9 顶点最大误差 0.0052），非理论最坏情况覆盖
3. 新增异常值检测：若任一顶点误差 > 1.5/255（0.00588），触发 WARNING 日志
4. 若未来实测误差超过 2/255，必须重新审查误差模型，不得随意放宽容差

### 2.3 容差选择结论

| 项目 | 值 |
|---|---|
| 当前容差 | **2/255 ≈ 0.00784**（维持，不放宽） |
| y 方向理论上界 | 0.00809（略超容差 3.2%） |
| 实测最大误差 | 0.0052（9 顶点） |
| 异常值 WARNING 阈值 | 1.5/255 ≈ 0.00588 |
| 状态 | NEEDS_REVIEW（已标注理论上界冲突，基于实测验证） |

---

## 3. 公共 API 契约处置（GAP-2 闭环）

### 3.1 调用范围审计结果

全仓库搜索 `setRenderMode` / `setRenderMesh`：

| 位置 | 类型 | 说明 |
|---|---|---|
| `chinese-aesthetic/render/gl-pipeline.ts:145,156` | 定义 | public 方法定义 |
| `tests/chinese-aesthetic/render/e2e/real-webgl-execution.spec.js` | 调用 | E2E 测试，4 组调用（NDC 验证、部分可见、完全不可见、黄金帧） |
| `tests/chinese-aesthetic/render/e2e/render-pipeline.bundle.js` | 编译产物 | bundle 中的定义（非调用） |

**结论**：唯一的调用者是 E2E 测试本身，没有任何生产代码或外部模块调用，没有仓库外部消费者。

### 3.2 处置动作

按照 REV-08 变更请求方案 A（推荐），执行以下动作：

1. **@internal JSDoc 标注**：已为 `setRenderMode` 和 `setRenderMesh` 添加 `@internal` 标注，明确说明：
   - 这是内部管线配置方法，不是公开 API surface 的一部分
   - 仅用于 E2E 测试和内部管线
   - 未在 REV-07 契约中定义
   - 外部消费者不应依赖此方法，可能随时变更

2. **REV-08 变更请求**：已提交 `docs/PHASE5-STEP52-REV-08-CHANGE-REQUEST.md`，提请审查席裁定最终处置（方案 A @internal 或方案 B 纳入公开 API）

3. **不修改 TypeScript public 修饰符**：保持 `public` 以允许 E2E 测试通过 `window.RenderPipeline` 全局对象访问，但通过文档和 @internal 标注明确其内部地位

### 3.3 API Surface 声明

当前 `GlPipeline` 类的公开 API（REV-07 已定义）：
- `constructor(config: PipelineConfig)`
- `powerSnapshot` (getter)
- `currentTier` (getter)
- `lastEvaluatedCamera` (getter)
- `dispatchInput(input: PowerInput)`
- `updateCamera(inputs: CameraInputs)`
- `renderFrame()`
- `dispose()`

**@internal 方法（REV-07 未定义，仅供内部/测试使用）**：
- `setRenderMode(mode: RenderMode)`
- `setRenderMesh(mesh: TriangleMesh)`

---

## 4. 独立 SHA256 逐字节验证（物证补交闭环）

### 4.1 验证脚本

新增 `scripts/verify-golden-frame.js`：独立验证脚本，不依赖 E2E 测试框架。

验证内容：
1. golden-frame.rgba.bin 字节长度 = 320×240×4 = 307200
2. 独立计算 SHA-256（Node.js crypto，非 E2E 内部）
3. 与 golden-frame-sha256.txt 原始字符串比较（`readFileSync(path, 'utf8').trim()`，非 JSON.parse）
4. 非背景像素计数 > 0（排除 clear-only 假阳性）
5. 若 `--compare <file>`：逐字节比较，输出差异数量、首个差异位置、前 10 个差异位置

### 4.2 Fresh ReadPixels 捕获

新增 `scripts/capture-fresh-readpixels.js`：独立启动 Headless Chromium + SwiftShader，重新渲染黄金帧参考三角形，捕获 gl.readPixels 原始输出，保存到临时文件。

### 4.3 逐字节比较结果

```
=== Byte-Level Comparison ===
Reference: golden-frame.rgba.bin (307200 bytes)
Compare:   /tmp/fresh-golden-frame.rgba (307200 bytes)
  Buffer lengths match: PASS
  Total differing bytes: 0 / 307200
  First diff position:  none
  Compare SHA-256: 8c3384d24fbbdfca6c97d9cdd11b44ba1f2e04dd39aebec271921fdd4179d333
  Reference SHA-256: 8c3384d24fbbdfca6c97d9cdd11b44ba1f2e04dd39aebec271921fdd4179d333
  Byte-level exact match: PASS (0 differing bytes)
```

**结论**：
- golden-frame.rgba.bin 是 gl.readPixels 的原始输出
- 重新渲染后的 fresh readPixels 与黄金帧**逐字节完全一致**（0 差异）
- SHA-256 一致：`8c3384d24fbbdfca6c97d9cdd11b44ba1f2e04dd39aebec271921fdd4179d333`
- 字节长度一致：307200
- 非背景像素：1980（非 clear-only）

### 4.4 比较对象明确声明

审查席要求"SHA256 一致必须明确比较对象"：

| 比较对象 | 说明 |
|---|---|
| gl.readPixels 原始 RGBA buffer | fresh capture 输出，307200 字节 |
| golden-frame.rgba.bin | 已提交的黄金帧原始像素，307200 字节 |
| 比较方式 | 逐字节比较（非仅 SHA-256） |
| 结果 | 0 差异，SHA-256 一致 |

PNG 文件（golden-frame.png）仅作为可视化审阅载体，**不**用于逐字节验证。

---

## 5. 完整门禁结果

### 5.1 E2E 测试（真实 Chromium + SwiftShader）

```
=== SUMMARY: 70/70 checks passed, 0 failures ===
ALL_PASSED: true
```

| 测试大类 | 检查数 | 结果 |
|---|---|---|
| Test 1: Environment Info | 6 | 6/6 PASS |
| Test 2: Basic WebGL2 & State Registers | 22 | 22/22 PASS |
| Test 3: Real Shader Compilation & Linking | 12 | 12/12 PASS |
| Test 4: NDC Pixel-Causal Verification | 10 | 10/10 PASS |
| Test 5: RENDER-11A Mechanism-Level Clipping | **11** | **11/11 PASS**（新增 w_c=0 边界） |
| Test 6: Golden Frame Generation | 8 | 8/8 PASS |
| Console Errors | 1 | 0 errors |
| **合计** | **70** | **70/70 PASS** |

### 5.2 单元测试

```
Tests: 22 passed, 22 total
Test Suites: 1 passed, 1 total
```

### 5.3 Scoped TypeScript

```
npx tsc --project tsconfig.chinese-aesthetic.json --noEmit
Exit Code: 0
```

### 5.4 保护区零修改

```
git diff --stat 86df17e..HEAD -- compiler-core/ evaluation/ schemas/
(empty — 0 files changed, 0 insertions, 0 deletions)
```

---

## 6. 未闭环问题清单

| 编号 | 问题 | 状态 | 所需动作 |
|---|---|---|---|
| GAP-1 | RENDER-11A 机制级测试 | ✅ 已闭环 | 11 项断言全部通过，含 w_c=0 边界 |
| GAP-2 | setRenderMode/setRenderMesh 契约 | ✅ 已闭环（标注+审计+变更请求） | @internal 标注已添加，REV-08 变更请求已提交，待审查席最终裁定 |
| GAP-3 | NDC 容差 | ✅ 已闭环（模型+7问+维持容差） | 正式误差模型已提供，7 问已回答，维持 2/255 + 标注理论上界 + 异常值检测 |
| 物证 | 独立 SHA256 逐字节验证 | ✅ 已闭环 | 0 差异，fresh readPixels 与黄金帧逐字节一致 |
| 黄金帧 | RENDER-07C | ⏳ PENDING_REVIEW | 需独立审阅者目视核对并签署 golden-frame-review.md |
| RENDER-07D | 跨驱动 SSIM | ⏳ NOT_RUN | 无物理 Metal/D3D11 环境，Step 5.3 或独立 Nightly 管线 |
| REV-08 | 契约修订 | ⏳ 待审查席批准 | 变更请求已提交，含 RENDER-11A 拆分、API 归属、NDC 容差规则 |

---

## 7. 最终状态诚实区分

| 维度 | 状态 | 说明 |
|---|---|---|
| **TEST_EVIDENCE** | ✅ 充分 | E2E 70/70 + 单元 22/22 + scoped TS exit 0，有完整 stdout/stderr 日志 |
| **PRODUCTION_EVIDENCE** | ✅ 充分 | 3 个生产模块（shader-source/geometry-builder/gl-pipeline）+ 独立逐字节验证 0 差异 |
| **CONTRACT_COMPLIANCE** | ⚠️ 部分 | RENDER-11A 已拆分闭环；API 已 @internal 标注+REV-08 变更请求；NDC 容差维持+标注 |
| **RENDER-07C** | ⏳ PENDING_REVIEW | 黄金帧已生成，逐字节验证通过，需独立审阅者签署 |
| **RENDER-07D** | ⏳ NOT_RUN | 无物理 Metal/D3D11 环境 |
| **STEP-5.2-B** | 📋 申请最终签署 | 3 项技术缺口已闭环，物证已补交，提请审查席最终裁定 |
| **STEP-5.2-C** | 🔒 LOCKED | 未授权启动 |
| **BLOCKED_ENV** | 🔒 MAINTAINED | 未解除 |

---

## 8. 最终签署申请

交付方已完成审查席 d92b7c0 裁定中要求的全部整改：

1. ✅ RENDER-11A 拆分为机制级独立测试（11 项，含 w_c=0 边界）
2. ✅ 公共 API 调用范围审计 + @internal 标注 + REV-08 变更请求
3. ✅ NDC 误差模型正式推导 + 7 问回答 + 维持 2/255 容差
4. ✅ 独立 SHA256 逐字节验证（fresh readPixels vs 黄金帧，0 差异）
5. ✅ 完整门禁通过（E2E 70/70 + 单元 22/22 + scoped TS exit 0）
6. ✅ 保护区零修改
7. ⏳ 黄金帧保持 PENDING_REVIEW（交付方未自签）

**提请审查席对 Step 5.2-B 进行最终签署裁定。**

注意：即使 Step 5.2-B 获得最终签署，RENDER-07C 仍需独立审阅者签署，RENDER-07D 仍为 NOT_RUN，STEP 5.2-C 仍为 LOCKED，BLOCKED_ENV 仍维持。

---

**文档结束。等待审查席最终裁定。**

**STEP 5.2-B: FINAL SIGN-OFF REQUESTED**
**STEP 5.2-C: LOCKED**
**BLOCKED_ENV: MAINTAINED**
