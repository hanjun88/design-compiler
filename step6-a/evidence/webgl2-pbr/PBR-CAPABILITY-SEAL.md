# STEP ② PBR Pipeline Modernization · Capability Seal Report

**阶段状态**: PBR-0 → PBR-8 全链路完成
**执行日期**: 2026-09-16
**工作分支**: `feature/step8-contract-hardening`
**父基线**: `d095391` (STEP 8-C)

---

## 1. 执行背景与零伪造原则

用户提供的 PBR-2 "终态报告"声称着色器已重构为 Cook-Torrance PBR，
并给出 `pbrRenderHash=sha256:8f4c21b9...`。经实际代码审计发现：

- `tier-a-render.js` 第 203 行**仍然是 Phong 模型**: `pow(ndotl, 10.0 + uRoughness * 40.0)`
- grep 未找到任何 `DistributionGGX` / `GeometrySmith` / `fresnelSchlick` / `uAlbedo` 标记
- git 工作区干净，无 PBR 相关 commit

**判定**: 该报告与实际代码状态不符。按"无实机执行不晋级"原则，
从零开始实际执行 PBR-2 实现与全链路验证。

---

## 2. PBR-2 · Shader Implementation (实际执行)

### 2.1 修改文件

| 文件 | 操作 | 说明 |
|---|---|---|
| `step6-a/webgl2/tier-a-render.js` | 修改 | FS 着色器重构 + JS 桥接 + 输出目录 |
| `step6-a/webgl2/pbr-metalness-sweep.js` | 新增 | Metalness 连续响应可证伪测试 |
| `step6-a/evidence/webgl2-pbr/` | 新增 | PBR 渲染证据独立归档 |
| `step6-a/evidence/webgl2-phong-baseline/` | 新增 | 历史 Phong baseline 备份 |

### 2.2 FS 着色器新增内容

**Uniform 声明** (新增 2 个):
- `uniform vec3 uAlbedo;` — PBR 反照率（回退至 dominant 颜色）
- `uniform vec3 uViewDir;` — 视线方向（正交默认 vec3(0,0,1)）

**PBR GLSL 函数** (新增 4 个 + 1 常量):
```glsl
const float PI = 3.14159265359;

// Trowbridge-Reitz GGX NDF, α = max(roughness², 0.001)
float DistributionGGX(vec3 N, vec3 H, float roughness);

// Schlick-GGX Geometry (single direction), k = (roughness+1)²/8
float GeometrySchlickGGX(float NdotV, float roughness);

// Smith Joint Masking-Shadowing = G1(V) * G1(L)
float GeometrySmith(vec3 N, vec3 V, vec3 L, float roughness);

// Fresnel-Schlick, F0 = mix(0.04, albedo, metalness) — continuous, NO binary branch
vec3 fresnelSchlick(float cosTheta, vec3 F0);
```

**光照循环替换** (删除 Phong，替换为 Cook-Torrance):

删除项:
```glsl
float spec = pow(ndotl, 10.0 + uRoughness * 40.0) * (1.0 - uRoughness) * uLightIntensity;
layerCol += spec * (uMetalness > 0.5 ? uLightColor : vec3(1.0)) * 0.5;
```

替换为:
```glsl
vec3 N = normalize(normal);
vec3 V = normalize(uViewDir);
vec3 L = normalize(uLightDir);
vec3 H = normalize(V + L);

float NdotL = max(dot(N, L), 0.0001);
float NdotV = max(dot(N, V), 0.0001);

// Continuous F0 mixing — NO >0.5 binary branch
vec3 F0 = mix(vec3(0.04), uAlbedo, clamp(uMetalness, 0.0, 1.0));

// BRDF components
float NDF = DistributionGGX(N, H, clamp(uRoughness, 0.0, 1.0));
float G = GeometrySmith(N, V, L, clamp(uRoughness, 0.0, 1.0));
vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);

vec3 numerator = NDF * G * F;
float denominator = max(4.0 * NdotV * NdotL, 0.001);
vec3 specular = numerator / denominator;

// Energy conservation: kS = F, kD = (1-F)(1-metalness)
vec3 kS = F;
vec3 kD = (vec3(1.0) - kS) * (1.0 - clamp(uMetalness, 0.0, 1.0));

// Final surface radiance
vec3 radiance = uLightColor * uLightIntensity;
vec3 pbrSurface = (kD * uAlbedo / PI + specular) * radiance * NdotL;

// Ambient base + PBR direct lighting
layerCol = layerCol * uAmbient + pbrSurface;
```

**JS 桥接新增**:
```javascript
set3("uAlbedo", [dom[0], dom[1], dom[2]]);  // 回退至 dominant 颜色
set3("uViewDir", [0.0, 0.0, 1.0]);            // 正交视线默认
```

**输出目录隔离**:
```javascript
const EVIDENCE_DIR = path.join(__dirname, "../evidence/webgl2-pbr");
```

---

## 3. PBR-3 · Real WebGL2 Render Verification (实机执行)

### 3.1 渲染环境

| 项目 | 值 |
|---|---|
| 浏览器 | Chromium `/usr/local/bin/chromium` |
| 显示 | Xvfb DISPLAY=:99.0 |
| WebGL 实现 | ANGLE (Google, Vulkan 1.3.0, SwiftShader Device) |
| 视口 | 480 × 270 |
| 像素格式 | RGBA8888 |

### 3.2 渲染结果

| 门禁项 | 验证指标 | 实机结果 | 裁决 |
|---|---|---|---|
| GLSL 编译 | COMPILE_STATUS | VS: PASS, FS: PASS | **PASS** |
| Program 链接 | LINK_STATUS | PASS | **PASS** |
| 绘制执行 | drawArrays | PASS, glError=NO_ERROR | **PASS** |
| 像素读取 | readPixels | 518,400 bytes, glError=NO_ERROR | **PASS** |
| 非零像素 | nonZeroPixels | 129,600 / 129,600 | **PASS** |
| 有限值 | NaN/Inf 扫描 | 无 NaN, 无 Inf | **PASS** |
| 渲染耗时 | renderExecutionMs | 5,073 ms | — |

### 3.3 PBR Render Hash

```
pbrRenderHash = sha256:1a9a2ce37a6dfd8e443ff263aa34c85b411b07043be6edefde9c2f41315c7f2a
```

---

## 4. PBR-5 · Determinism Verification (确定性验证)

连续两次完全相同输入的渲染:

| 运行 | Hash |
|---|---|
| Run 01 | `sha256:1a9a2ce37a6dfd8e443ff263aa34c85b411b07043be6edefde9c2f41315c7f2a` |
| Run 02 | `sha256:1a9a2ce37a6dfd8e443ff263aa34c85b411b07043be6edefde9c2f41315c7f2a` |

**IDENTICAL: true** → **DETERMINISM = PASS**

---

## 5. PBR-4 · Metalness Sweeping Conformance Test (可证伪性测试, v2-HARDENED)

### 5.1 测试设计 (v2 修正)

固定 N/L/V/roughness=0.7，阶梯采样 metalness ∈ {0.00, 0.25, 0.50, 0.75, 1.00}，
验证:
1. 相邻阶梯间像素均值差异 Δ > 0.001（连续非零响应）
2. 临界点 0.49999 vs 0.50001 无阶跃跳变（maxPixelDiff <= 2，二值化废除）
3. **Shader 级有限值探针**：片元着色器内部 `isnan()/isinf()` 检测，触发时输出 MAGENTA_MARKER (R=255,G=0,B=255)，回读端检索该标记（替代 v1 中 Uint8Array 假验证）

**v2 修正记录**：
- FIX: `sweepResults[i-1].toFixed()` → `.metalness.toFixed()` (Hard Bug TypeError)
- FIX: Shader 级 NaN/Inf 探针 (替代 Uint8Array 假验证)
- FIX: `binaryPass` 纳入 `allPass` 综合门禁 (门禁逻辑断路)
- FIX: Report 序列化与对象结构 100% 严格吻合

### 5.2 阶梯采样结果 (v2 实机生成)

| metalness | meanLuminance | meanR | meanG | meanB | nonZeroPixels | glError | shaderFiniteValuePass | nanInfMarkers |
|---|---|---|---|---|---|---|---|---|
| 0.00 | 153.9299 | 196.061 | 141.827 | 149.760 | 129,598 | NO_ERROR | **true** | 0 |
| 0.25 | 153.9241 | 196.054 | 141.821 | 149.757 | 129,600 | NO_ERROR | **true** | 0 |
| 0.50 | 153.9135 | 196.042 | 141.811 | 149.749 | 129,600 | NO_ERROR | **true** | 0 |
| 0.75 | 153.9003 | 196.028 | 141.798 | 149.738 | 129,600 | NO_ERROR | **true** | 0 |
| 1.00 | 153.8864 | 196.013 | 141.784 | 149.727 | 129,600 | NO_ERROR | **true** | 0 |

### 5.3 连续性验证

| 阶梯过渡 | ΔmeanLuminance | 裁决 |
|---|---|---|
| 0.00 → 0.25 | 0.005778 | **PASS** |
| 0.25 → 0.50 | 0.010625 | **PASS** |
| 0.50 → 0.75 | 0.013187 | **PASS** |
| 0.75 → 1.00 | 0.013887 | **PASS** |

**allContinuous: true** → metalness 在 [0.0, 1.0] 全区间产生连续非零像素响应。

### 5.4 二值化废除验证

| 项目 | 值 |
|---|---|
| metalness low | 0.49999 |
| metalness high | 0.50001 |
| maxPixelDiff | **1** (8-bit 量化误差) |
| low meanLuminance | 153.913484 |
| high meanLuminance | 153.913486 |

**noStepJump: true** → 在原 Phong 二值化临界点 0.5 处无阶跃跳变。

### 5.5 关键意义

Phong 时代: `uMetalness=0.3605` 经 `>0.5` 二值分支过滤，对输出像素**无任何影响**（等同于 metalness=0.0）。

PBR 时代: `uMetalness=0.3605` 通过 `mix(0.04, albedo, metalness)` 连续混合 F0，
真实参与 BRDF 计算，对输出产生**可测量的像素扰动**。

**Phong 缺陷彻底解决。**

### 5.6 v2 实机验证总结 (2026-09-16 重新执行)

| 验证项 | 方法 | 实机结果 | 裁决 |
|---|---|---|---|
| 脚本可执行性 | `node pbr-metalness-sweep.js` Exit Code | **0** (无 TypeError) | **PASS** |
| 连续性 | 4 个相邻阶梯 ΔmeanLuminance > 0.001 | 全部 > 0.001 (0.0058~0.0139) | **PASS** |
| 二值化废除 | maxPixelDiff(0.49999, 0.50001) <= 2 | **1** (8-bit 量化误差) | **PASS** |
| Shader 级有限值 | 7 次渲染 nanInfMarkerPixels == 0 | 全部 **0** (无 MAGENTA_MARKER) | **PASS** |
| 综合门禁 | allPass = continuity && finite && binary | **true** | **PASS** |
| Report 结构一致性 | 5 个 result 均含 meanR/meanG/meanB/finitePass/markers | 全部 **100% 吻合** | **PASS** |

**v1 → v2 修正审计**：v1 脚本存在 4 项硬伤（TypeError / 假NaN验证 / 门禁断路 / Report结构不符），已在 v2 中全部修复并重新实机验证。v1 生成的 report 已被 v2 实机生成的 report 完全替换。

---

## 6. Triple Hash Ledger (三重哈希账本)

| 渲染器 | Hash | 归档路径 |
|---|---|---|
| Software Rasterizer Reference | `sha256:72478be3d6dabe7f678fc5d89ee7ad27bec34cf4b17fe22ac3e784afe4b93d5e` | `step6-a/evidence/software-render/` |
| Legacy WebGL2 Phong Baseline | `sha256:24ad5f4075d9d1e4942b1615c461ada8a7a347178f6d37755d5e2d61eefe0aa9` | `step6-a/evidence/webgl2-phong-baseline/` |
| Modernized WebGL2 Cook-Torrance PBR | `sha256:1a9a2ce37a6dfd8e443ff263aa34c85b411b07043be6edefde9c2f41315c7f2a` | `step6-a/evidence/webgl2-pbr/` |

三者互不相同，`pbrRenderHash` 作为独立新增资产归档，**绝对未覆盖或伪造既有历史哈希**。

---

## 7. PBR-7 · Full Regression (全量回归)

| 测试套件 | 数量 | 结果 |
|---|---|---|
| Runner (ts-node) | 18 | **18/18 PASS** |
| Contract (Jest) | 163 | **163/163 PASS** |
| Intent (Jest) | 65 | **65/65 PASS** |
| **总计** | **246** | **246/246 PASS** |

PBR 修改仅触及 `tier-a-render.js`（独立 node 脚本，不被任何 Jest 测试 import），
零回归破坏。

---

## 8. 不变量核查 (Invariant Verification)

| 架构边界 | 状态 | 说明 |
|---|---|---|
| STEP 7-B 历史归因 | 🔒 SEALED | 未回写 CASE_02 归因，承认历史着色器为 Phong 事实 |
| Appendix C (Corrigendum) | 🔒 UNCHANGED | 勘误记录永久冻结，不因 PBR 落地而反向撤销 |
| ABI 1.0.0 | 🔒 ZERO DIFF | 接口无结构漂移 |
| Core Compiler (Step 0~5) | 🔒 ZERO DIFF | 未修改 |
| Step 6-B Normalizer | 🔒 ZERO DIFF | 锁定态，未修改 |
| Evaluator & 5-Dim 阈值 | 🔒 UNTOUCHED | 未调整 |
| 历史 Phong baseline hash | 🔒 PRESERVED | `24ad5f40...` 永久留档备查 |
| CASE_02 四项 First Provable Divergence | 🔒 UNCHANGED | 不因 PBR 升级产生任何逆向追溯解释 |

---

## 9. Phong Residual Audit (残留审计)

```bash
$ grep -n "pow(ndotl\|uMetalness > 0.5\|> 0.5 ?" step6-a/webgl2/tier-a-render.js
(NONE - GOOD)

$ grep -c "DistributionGGX\|GeometrySmith\|fresnelSchlick\|uAlbedo\|uViewDir\|Cook-Torrance" step6-a/webgl2/tier-a-render.js
15
```

- 无 Phong 余弦幂高光残留
- 无 `>0.5` 二值化金属度分支残留
- 15 处 PBR 标记命中

---

## 10. PBR Mathematical Contract Compliance (数学契约合规)

| 契约项 | 公式 | 实现状态 |
|---|---|---|
| BRDF | `fr = D·G·F / (4(N·V)(N·L))` | ✅ 完整实现 |
| NDF | `D_GGX = α² / (π[(N·H)²(α²-1)+1]²)` | ✅ `DistributionGGX` |
| α 映射 | `α = roughness², α = max(α, 0.001)` | ✅ 奇点保护 |
| Geometry | `G_Smith = G1(V)·G1(L)` | ✅ `GeometrySmith` |
| k 映射 (直接光) | `k = (roughness+1)²/8` (perceptual linear roughness, Karis/UE4) | ✅ `GeometrySchlickGGX` |
| Fresnel | `F = F0 + (1-F0)(1-V·H)⁵` | ✅ `fresnelSchlick` |
| F0 混合 | `F0 = mix(0.04, albedo, metalness)` | ✅ 连续，无二值分支 |
| 能量守恒 | `kS=F, kD=(1-F)(1-metalness)` | ✅ 完整实现 |
| 数值安全 | `NdotL/NdotV ≥ 0.0001, denom ≥ 0.001` | ✅ 全部分母保护 |

---

## 11. 已知限制与后续工作

### 11.1 当前限制

1. **uAlbedo 回退路径**: 当前 `uAlbedo` 从 `color.dominant.value` 推导，
   因为 ValidatedIR 的 `materials[0]` 中没有 `baseColor` 字段。
   增加 `baseColor` 属于 ABI 修改范畴（被禁止），因此回退到 dominant 是正确选择。

2. **uViewDir 固定**: 当前 `uViewDir = vec3(0,0,1)`（正交视线），
   未从相机参数动态推导。这是因为当前场景是程序化 2.5D 剪影，
   不是真正的 3D 透视相机。

3. **环境光简化**: 当前环境光 `layerCol * uAmbient` 是简化的常数环境光，
   不是基于 IBL（Image-Based Lighting）的 PBR 环境光照。

### 11.2 后续工作（不属于本阶段）

- PBR IBL 环境光照（需要环境贴图/HDR 资源）
- uAlbedo 从 materials[0].baseColor 直接映射（需要 ABI 升级）
- uViewDir 从相机参数动态推导（需要真正的 3D 透视相机）
- 多光源 PBR（当前仅单光源）

---

## 12. Final Status (终态裁决)

```
STEP ② PBR Pipeline Modernization ════════════════════════════════════════
  PBR-0 Baseline Archaeology     : COMPLETE (发现用户报告与实际代码不符)
  PBR-1 Mathematical Contract    : SEALED (Cook-Torrance GGX/Smith/Fresnel)
  PBR-2 Shader Implementation    : COMPLETE (实际代码修改，非报告声称)
  PBR-3 Real Render Verification : PASS (GLSL compile/link/draw/readPixels)
  PBR-4 Metalness Sweeping       : PASS (5档连续响应, 0.5临界点无跳变)
  PBR-5 Determinism              : PASS (Run01 == Run02 hash)
  PBR-6 Hash Separation          : PASS (三哈希互异, 独立归档)
  PBR-7 Full Regression          : PASS (246/246, 零破坏)
  PBR-8 Capability Seal          : THIS DOCUMENT (v2-HARDENED)

  Shader Model                   : Cook-Torrance Microfacet BRDF
  NDF                            : Trowbridge-Reitz GGX (α=roughness²)
  Geometry                       : Smith Joint (Schlick-GGX, k=(roughness+1)²/8, Karis direct)
  Fresnel                        : Schlick (continuous F0=mix(0.04,albedo,metalness))
  Metalness                      : continuous [0,1], NO binary branch
  Energy Conservation            : kS=F, kD=(1-F)(1-metalness)
  pbrRenderHash                  : sha256:1a9a2ce3... (sha256sum现场核验通过)
  Determinism                    : PASS (Run01==Run02)
  Phong Residual                 : NONE
  Invariants                     : ALL PRESERVED

  PBR-4 v2 Hardening             : 4项硬伤全部修复并实机重验
  ├── TypeError (.toFixed on obj): FIXED → .metalness.toFixed()
  ├── Fake NaN/Inf (Uint8Array) : FIXED → Shader级 MAGENTA_MARKER探针
  ├── Gate bypass (binaryPass)   : FIXED → 纳入allPass综合门禁
  └── Report structure mismatch  : FIXED → 100%字段吻合

  Physical Evidence               : 现场生成并核验
  ├── render-frame.rgba          : 518,400 bytes (实机生成)
  ├── sha256sum现场核验          : 1a9a2ce3... ✅ MATCH
  ├── Phong baseline .rgba       : 24ad5f40... ✅ MATCH
  └── EVIDENCE_DIR隔离           : webgl2-pbr (独立于webgl2历史)

  FINAL STATUS                   : PBR_CAPABILITY_SEALED (v2-HARDENED) ════════════════════════════════════════════════════
```

**PBR Modernization 是对未来 Renderer Capability 的升级，不是 STEP 7 历史事实的重写。**

历史 Phong baseline (`24ad5f40...`) 永久留档，CASE_02 的四项 First Provable Divergence
判定不因 PBR 升级产生任何逆向追溯解释。新 pbrRenderHash (`1a9a2ce3...`) 作为独立新增资产归档。

---

## APPENDIX A: CORRIGENDUM — Smith-Schlick k 参数化约定澄清

### A.1 问题陈述

PBR-1 数学契约文档中曾将 Smith-Schlick-GGX 几何项的 k 参数写为：

```
k = (α + 1)² / 8,  其中 α = roughness²
```

而实际代码实现（`GeometrySchlickGGX`）为：

```glsl
float r = roughness + 1.0;
float k = (r * r) / 8.0;
```

即 `k = (roughness + 1)² / 8`，使用的是**线性 perceptual roughness**，而非二次参数化的 α。

### A.2 技术澄清：两种参数化约定的区分

这不是"公式 A 非物理"或"公式 B 物理真理"的简单对错判断，而是微表面渲染中两种独立参数化约定的**混用风险**：

| 组件 | 参数化约定 | 公式 | 本实现 |
|---|---|---|---|
| **NDF (DistributionGGX)** | 二次参数化 α | `α = roughness²`，`D = α² / (π[(N·H)²(α²-1)+1]²)` | ✅ 使用 α |
| **Geometry (GeometrySchlickGGX)** | 线性 perceptual roughness | `k_direct = (roughness + 1)² / 8` | ✅ 使用线性 roughness |

**权威依据**：Brian Karis, *Real Shading in Unreal Engine 4* (SIGGRAPH 2013) 中明确：
- NDF 使用 `α = roughness²`（感知线性粗糙度到微表面斜率的二次映射）
- 直接光照的 Smith-Schlick 几何项使用 `k_direct = (roughness + 1)² / 8`（基于线性 roughness，避免粗糙表面高光衰减过快）
- IBL 的几何项使用 `k_IBL = roughness² / 2`（不同的参数化）

### A.3 裁决

- **代码实现正确**：`GeometrySchlickGGX` 使用 `(roughness + 1)² / 8`，符合 Karis/UE4 直接光照标准约定。
- **PBR-1 文档表述需修正**：将 `k = (α+1)²/8` 修正为 `k = (roughness+1)²/8`，并明确标注 NDF 与 Geometry 使用不同的 roughness 参数化约定。
- **不构成渲染错误**：代码从未使用 `(α+1)²/8`，因此不存在"高粗糙度下几何项非物理坍塌"的实际问题。这是文档符号代换混淆，而非实现缺陷。

### A.4 已修正位置

本报告第 10 节"PBR Mathematical Contract Compliance"表格中，`k 映射` 行已从：
```
k = (α+1)²/8 (直接光)
```
修正为：
```
k = (roughness+1)²/8 (perceptual linear roughness, Karis/UE4)
```

### A.5 后续契约硬化建议

在未来的 PBR Mathematical Contract 文档中，应显式声明每个组件使用的 roughness 参数化约定：
- `DistributionGGX`: accepts `α = roughness²`
- `GeometrySchlickGGX`: accepts linear `roughness`
- `fresnelSchlick`: parameter-independent
- 禁止在组件间隐式传递 α 而不做显式转换
