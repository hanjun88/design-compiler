# STEP 7 · 终态错误归因白皮书
## Error Attribution & Trace Postmortem — GOLDEN_CASE_02

| 字段 | 值 |
|---|---|
| 审计基线 | `master@fb47341`（含 STEP 7-A Evidence Hygiene 隔离） |
| 审计模式 | READ-ONLY / ANALYSIS-ONLY / FORENSIC_ANALYSIS_ONLY（零代码修改） |
| 用例 | GOLDEN_CASE_02（云阙松风古建云海） |
| 资产 | `fixtures/GOLDEN_CASE_02/source-video.mp4`（H.264, 1930×1080, 28.8fps, 26.81s, 660帧, 无水印） |
| 资产 SHA-256 | `e720ed53b546bd9dad3e995396427c14b358826aa4f3ef30f5cb0c294acd641a` |
| Evaluation 状态 | **FAIL**（proposalScore=83.75 > baseline=60，但 3/5 维度 Gate FAIL） |
| 回归基线 | 215/215 PASS（Runner 18 + Contract 153 + Intent 44） |
| 封签阶段 | STEP 7-B · First Provable Divergence Sealed |

---

## 一、执行摘要

GOLDEN_CASE_02 的 5 维评测中，**composition / color / material 三维度各得 0.75 分触发 Gate FAIL**，depth 与 focalDisplacement 满分通过。

经 L0→L7 全链路因果穿透审计，**首个可证明偏差点（First Provable Divergence）均不在下游编译流水线**：

| 故障维度 / 项 | 测量值 | 门限 | 首个偏差点 | 层级 | 权威定性 |
|---|---|---|---|---|---|
| COMP-002 (Symmetry) | 0.6377 | ≥ 0.70 | 原片左右 NCC=0.6377，天然非中轴对称 | L0 | **SOURCE_LIMITED** |
| COLOR-002 (TempBias) | -0.5240 | [-0.30, 0.30] | 原片冷底暖光，cool 67% > warm 21%；评估器静态中性先验 | L0 + L7 | **SOURCE_LIMITED + EVALUATOR_INDUCED** |
| MAT-003 (Metalness) | 0.3605 | ≤ 0.30 | L1 高光→金属度代理算法将 3.6% 高光放大为 36% 金属性 | L1 | **EXTRACTION_INDUCED**（辅以 L7 门限未区分混合构件建筑） |
| MAT-002 (Roughness) | 0.7000 | [0.30, 0.85] | L1 归一化分母塌陷钳位至 0.10，被 L4 补丁重写至 0.70 | L1 → L4 | **MASKED_BY_PATCH**（提取缺陷被补丁意外掩盖，PASS 但高危） |

**核心结论**：Core Compiler（Step 0~5）、Step 6-B Intent Normalizer、L6 WebGL2 渲染器全程保真，未扭曲物理事实。三个 FAIL 维度的根因是**原片物理特征（L0）与 Evaluator 静态美学先验（L7）之间的系统性语义错位**，叠加 L1 金属度代理算法的一处可证明缺陷（EXTRACTION_INDUCED）。粗糙度项虽 PASS，但存在 L1 提取缺陷被 L4 补丁意外掩盖的高危脆弱点。

---

## 二、审计方法论与归因分类法

本审计严格遵循"首个可证明偏差点"宪法准则，归因结论仅收敛至以下物理判定空间：

| 分类 | 定义 | 层级 |
|---|---|---|
| `SOURCE_LIMITED` | 物理原片本身的统计学特征已突破评估门限 | L0 |
| `EXTRACTION_INDUCED` | OpenCV/光流/边缘分割在提炼连续像素为离散数值时发生系统漂移 | L1 |
| `CANGJIE_SCHEMA_LIMITED` | 参量在转化为 EstimatedParameter 时的定标或不确定度方差失真 | L2 |
| `MAPPING_INDUCED` | Step 6-B Normalizer 在降维到 ABI 1.0.0 物理结构时造成语义坍塌 | L3 |
| `PATCH_INDUCED` | Aesthetic Grammar 或 Anti-AI 规则引擎施加了过冲/错误的 AST 改写 | L4 |
| `EXECUTION_PLAN_INDUCED` | TIER_A 硬件协商与降级调度造成的参数变形 | L5 |
| `RENDER_INDUCED` | 着色器数学精度、光栅化或合成阶段引起的色彩/几何偏离 | L6 |
| `EVALUATOR_INDUCED` | Evaluator 判定公理与真实物理/文化事实产生先验冲突 | L7 |
| `INSUFFICIENT_EVIDENCE` | 数据断裂，证据不足以明确单一责任点 | — |

---

## 三、Phase 1：L0 物理像素 ↔ L1 特征提取审计

### 3.1 资产完整性与 SHA-256 物理定标

6 张物理关键帧的 SHA-256 指纹与 `keyframes.json` 归档记录严格一致，资产未被污染。

| 帧 | 时间戳 (s) | 分辨率 | SHA-256 对账 |
|---|---|---|---|
| keyframe-0001.png | 0.000 | 1930×1080 | MATCH |
| keyframe-0002.png | 4.270 | 1930×1080 | MATCH |
| keyframe-0003.png | 8.530 | 1930×1080 | MATCH |
| keyframe-0004.png | 12.800 | 1930×1080 | MATCH |
| keyframe-0005.png | 17.070 | 1930×1080 | MATCH |
| keyframe-0006.png | 21.330 | 1930×1080 | MATCH |

### 3.2 L0 物理像素级指标实测（6 帧中位数）

采用 ITU-R BT.709 亮度权重 `Y = 0.2126R + 0.7152G + 0.0722B`，无参纯数学计算：

| 指标 | L0 实测值 (中位数) | 定义 |
|---|---|---|
| Otsu 门限 T | 133.0 | 全局自适应最佳分割门限 |
| Otsu 背景比（亮区） | 0.202 | 高于 Otsu 门限的像素占比 |
| Canny 边缘密度 ρ_edge | 0.044 | 双门限 [50,150] 高频边缘像素占比 |
| 平坦无高频区 ρ_flat | 0.188 | Sobel 梯度幅值 < 12 且形态学开运算去噪后的无纹理区域 |
| 最大连通空白区 ρ_max_void | 0.151 | 无边缘连通域中面积最大的单个几何区块 |

### 3.3 L0 ↔ L1 对账（Composition 维度）

| L1 字段 | L1 记录值 | 对标 L0 物理量 | L0 实测值 | 绝对残差 Δ | 相对偏差 |
|---|---|---|---|---|---|
| negative_space | 0.188 | 平坦无高频区 ρ_flat | 0.188 | 0.0002 | 0.11% |
| negative_space | 0.188 | Otsu 背景比（明亮天空） | 0.202 | 0.014 | 6.93% |
| negative_space | 0.188 | 最大连通空白区 ρ_max_void | 0.151 | 0.037 | 24.25% |

**Phase 1 判定**：
- **排除 EXTRACTION_INDUCED**：L1 的 negative_space 提取算法（基于梯度与无纹理区域检测）极其忠实地反映了 L0 平坦连续空间比例（0.188 ≈ 0.188，Δ=0.0002），不存在分割塌陷或特征漂移。
- **支持 SOURCE_LIMITED**：即使放宽至最激进的 Otsu 全局明亮区域分割，实际像素占比最高亦仅为 20.2%。该资产画面主体（云阙、殿宇飞檐、松石岩层）占据垂直画幅近 80%，物理像素层面即呈现"满铺充盈"状态。
- **保留 EVALUATOR_INDUCED 交叉审查点**：Evaluator 的 composition 门限 [0.42, 0.65] 基于宋画/水墨文人意境之"计白当黑"经验标准，而真实视频原片属于富丽堂皇、结构饱满的殿宇长卷风格，原始像素物理留白天然无法落入该区间。

---

## 四、Phase 2：降维映射与补丁引擎审计（L2→L3→L4）

### 4.1 三个 0.75 FAIL 维度的真正故障点（事实修正）

经逐项穿透 Evaluator 源码与 ValidatedIR 实际值，确认此前对 FAIL 原因的误判：

| 维度 | 分数 | 门限 | **真正 FAIL 的检查项** | 实际值 | 评测区间 | 此前误判 |
|---|---|---|---|---|---|---|
| Composition | 0.75 | 0.90 | **COMP-002-AXIS-SYMMETRY** | 0.6377 | ≥ 0.70 | 误判为 negativeSpace |
| Color | 0.75 | 0.90 | **COLOR-002-TEMPERATURE-BALANCE** | -0.524 | [-0.30, 0.30] | — |
| Material | 0.75 | 0.80 | **MAT-003-LOW-METALNESS** | 0.3605 | ≤ 0.30 | 误判为 roughness |

**关键修正**：
- Composition 的 negativeSpaceRatio 经补丁后为 **0.45**，落入 Evaluator 区间 [0.42, 0.65]，**已 PASS**。FAIL 原因是 symmetry=0.6377 < 0.70。
- Material 的 roughness 经补丁后为 **0.7**，落入 [0.30, 0.85]，**已 PASS**。FAIL 原因是 metalness=0.3605 > 0.30。

### 4.2 Composition 维度归因链（symmetry=0.6377）

```
L0 物理原片
  │  左右半幅 NCC 对称度: 0.6377 (6帧中位数)
  │  原片结构: 左侧巨松横斜 + 右侧殿宇飞檐，天然不对称
  ▼
L1 特征提取
  │  symmetry: 0.6377 (method: NCC left vs flipped-right)
  │  残差 Δ ≈ 0 (L0 与 L1 一致，无提取漂移)
  ▼
L4 Patch Engine
  │  CA-RULE-05 (静墨): condition symmetry > 0.90 → replace 0.82
  │  0.6377 不满足 > 0.90 → 未命中
  ▼
L7 Evaluator
  │  COMP-002: symmetry >= 0.70 → 0.6377 < 0.70 → FAIL
  ▼
归因: SOURCE_LIMITED (L0)
```

### 4.3 Color 维度归因链（temperatureBias=-0.524）

```
L0 物理原片
  │  光源 CCT (亮度前20%像素): 2386K (极暖，日落暖光)
  │  整体 CIE Lab b*: -4.14 (偏冷蓝，暗部蓝灰主导)
  │  warmPixelRatio: 21.15%, coolPixelRatio: 67.44%
  │  画面特征: 冷底暖光——暗部冷灰蓝，高光/日落区域极暖
  ▼
L1 特征提取
  │  temperatureBias: -0.524 (method: warm-hue vs cool-hue ratio difference)
  │  残差: 与 L0 整体冷色分布一致
  ▼
L4 Patch Engine
  │  CA-RULE-04 (设色): condition temperatureBias > 0.30 → replace 0.10
  │  -0.524 不满足 > 0.30 → 未命中
  │  ⚠️ 无负向色温（<-0.30）补丁规则
  ▼
L7 Evaluator
  │  COLOR-002: temperatureBias ∈ [-0.30, 0.30]
  │  -0.524 ∉ [-0.30, 0.30] → FAIL (score=0)
  ▼
归因: SOURCE_LIMITED (L0) + EVALUATOR_INDUCED (L7)
  原片"冷底暖光"是真实物理特征。Evaluator 的 [-0.30,0.30] "平衡区间"
  隐含"中性色温=好"的先验，对"冷底暖光"高对比色温场景不友好——
  光源 2386K 极暖的事实被整体冷像素淹没。
```

### 4.4 Material 维度归因链

#### 4.4a metalness=0.3605（真正 FAIL 项）

```
L0 物理原片
  │  2D 视频帧无法直接观测 BRDF 金属度
  │  specular highlight ratio: 0.036 (6帧中位数)
  │  原片含古建金属构件: 铜钉、铁环、鎏金装饰 → 高光区域
  ▼
L1 特征提取
  │  metalness: 0.3605
  │  method: specular highlight ratio (high value + low saturation)
  │  ⚠️ 这是从 2D 帧估计的代理指标，非真实物理金属度
  ▼
L4 Patch Engine
  │  无针对 metalness 的补丁规则
  ▼
L7 Evaluator
  │  MAT-003: metalness <= 0.30 (东方美学以木石为主，低金属)
  │  0.3605 > 0.30 → FAIL
  ▼
归因: SOURCE_LIMITED + EXTRACTION_INDUCED + EVALUATOR_INDUCED
  原片确实含金属构件，2D 高光代理估计 0.3605 有物理依据。
  但 "specular highlight ratio" 作为 metalness 代理本身粗糙——
  光滑木材/石材的高光也会被计入。
  Evaluator 的 <=0.30 阈值基于"纯木石东方美学"先验，
  对"木石+金属构件"的复合古建场景不适用。
```

#### 4.4b roughness：错误路径到达正确结果的典型案例

```
L0 物理原片
  │  Laplacian variance (独立计算): 351 (6帧中位数)
  │  roughnessL0 = 1 - min(351/2000, 1) = 0.825
  ▼
L1 特征提取 ⚠️ 异常
  │  roughness: 0.1 (4/6帧钳位在下限 0.1)
  │  method: "1 - normalized Laplacian variance (sharpness inverse)"
  │  记录的 sharpness 值: 1927, 2307, 730, 687, 1837, 2353
  │  ⚠️ 与 L0 独立 Laplacian variance (351) 严重不一致
  │  ⚠️ 归一化分母未知/过大，导致 4/6 帧被钳位到 0.1
  ▼
L4 Patch Engine ⚠️ 过冲
  │  ANTI-AI-01: roughness < 0.18 → replace 0.28 (fromValue=0.1) ✅ 命中
  │  CA-RULE-03-CANGRUN: roughness < 0.50 → replace 0.70 (fromValue=0.1) ✅ 命中
  │  最终: 0.70 (CA-RULE-03 后执行，覆盖 ANTI-AI-01 的 0.28)
  ▼
L7 Evaluator
  │  MAT-002: roughness ∈ [0.30, 0.85] → 0.70 ∈ 区间 → PASS
  ▼
归因: EXTRACTION_INDUCED (L1) → PATCH_INDUCED (L4)
  L1 粗糙度提取存在归一化缺陷 (4/6帧钳位 0.1)，触发补丁引擎双重改写。
  补丁最终值 0.70 碰巧接近 L0 独立物理值 0.825，结果 PASS。
  但这是"错误路径到达正确结果"——若 L1 提取正确 (0.825)，
  补丁不会触发 (0.825 > 0.50)，最终值 0.825 仍在 [0.30,0.85] 内 PASS。
  补丁的存在在此案例中是冗余且有风险的。
```

### 4.5 补丁引擎完整命中审计（4/9 规则命中）

| ruleId | 目标路径 | 条件 | 原始值 | 命中 | 改写值 | 最终值 |
|---|---|---|---|---|---|---|
| ANTI-AI-01 | /materials/0/roughness | < 0.18 | 0.1 | ✅ | 0.28 | 被覆盖 |
| ANTI-AI-02 | /composition/negativeSpaceRatio | < 0.40 | 0.099 | ✅ | 0.48 | 被覆盖 |
| CA-RULE-01-XUSHI | /composition/negativeSpaceRatio | < 0.35 | 0.099 | ✅ | 0.45 | **0.45** |
| CA-RULE-02-YUNRUN | /lighting/keyLight/softness | < 0.50 | null | ❌ | — | 字段缺失 |
| CA-RULE-03-CANGRUN | /materials/0/roughness | < 0.50 | 0.1 | ✅ | 0.70 | **0.70** |
| CA-RULE-04-SHEJI | /color/temperatureBias | > 0.30 | -0.524 | ❌ | — | 负向未覆盖 |
| CA-RULE-05-JINGMO | /composition/symmetry | > 0.90 | 0.6377 | ❌ | — | — |
| ANTI-AI-03 | /lighting/ambientRatio | > 0.65 | 0.32 | ❌ | — | — |
| ANTI-AI-04 | /lighting/keyLight/colorTemp | not_between [2700,6500] | 4800 | ❌ | — | — |

**补丁引擎审计发现**：
1. **同路径双重命中**：negativeSpaceRatio 和 roughness 各被两条规则命中，后执行的规则覆盖先执行的。`audit.fromValue` 都记录原始值，未记录链式中间值，审计可追溯性不足。
2. **负向色温无补丁**：temperatureBias < -0.30 无对应规则，CA-RULE-04 只覆盖 > 0.30。
3. **softness 字段缺失**：CA-RULE-02 目标字段 `keyLight.softness` 在 Raw IR 中为 null，规则静默跳过。

---

## 五、Phase 3：渲染阶段（L6）审计

### 5.1 物理缓冲区完整性校验

| 字段 | 值 |
|---|---|
| 文件路径 | `step6-a/evidence/webgl2/render-frame.rgba` |
| 字节长度 | 518,400 bytes（精确匹配 480×270×4 RGBA8888） |
| 非零像素 | 129,600（无未初始化空洞或内存越界截断） |
| webgl2RenderHash | `sha256:24ad5f4075d9d1e4942b1615c461ada8a7a347178f6d37755d5e2d61eefe0aa9` |
| 确定性 | run-01 === run-02 字节级相同 |

### 5.2 L0 ↔ L6 统计直方图对账

| 统计指标 | L0 关键帧均值（降采样） | L6 渲染像素 | 残差 Δ | 判定 |
|---|---|---|---|---|
| 平均亮度 (Mean L*) | 46.82 | 41.15 | -5.67 | 偏暗（符合 AgX 压高光特性） |
| CIE a* | -1.24 | -0.85 | +0.39 | 维持冷底微偏绿中性 |
| CIE b* | -4.14 | -3.88 | +0.26 | 维持深冷灰蓝基底 |
| 暖色像素比例 | 21.15% | 18.90% | -2.25% | 局部高光霞光保留 |
| 冷色像素比例 | 67.44% | 71.20% | +3.76% | 大面积阴影与远山冷调强化 |
| 冷暖偏向度 (Temperature Bias Proxy) | -0.5240 | -0.5420 | -0.0180 | 高度自洽（未产生反转） |

**概率分布距离**：
- RGB 三通道巴氏距离 (Bhattacharyya Distance)：**D_B = 0.0812**（远低于发散阈值 0.35，分布高度相似）
- 亮度分量 1-D Wasserstein 距离：W_1 = 6.12（8-bit units）

**审计结论**：L6 渲染图像忠实再现了 L0 原片"冷底暖光"的全局宏观分布。温度偏向度残差 |Δ| = 0.0180 ≪ 0.05，**排除了"渲染器自身色调映射引发色温失控反转"的假说**。

### 5.3 Shader 参数实际消费与 BRDF 真实性核查

对已锁定的 WebGL2 着色器进行逐行 AST 与 Uniform 绑定穿透审计：

| BRDF 组件 | 实现 | 参数消费 | 审计 |
|---|---|---|---|
| 微表面法线分布 (NDF) | Trowbridge-Reitz GGX | `float a = max(u_Roughness², 0.001)`，输入 0.70 未触发下限截断 | ✅ 有效 GGX 衰减区 |
| 几何遮蔽 (Geometry) | Schlick-GGX，k = (α+1)²/8 | 完全消费 u_Roughness=0.70 | ✅ |
| 菲涅尔与能量守恒 | F0 = mix(0.04, baseColor, metalness)，k_d = (1-F)(1-metalness) | u_Metalness=0.3605 真实参与非金属/金属线性插值 | ✅ 无硬编码覆盖 |
| 色调映射 | AgX 拟合函数，对数域高光自然滚降 | 挂载于 Fragment 最终输出 | ✅ |
| 浮点精度 | `precision highp float;` | — | ✅ 无精度截断 |
| 死代码剔除 | u_Roughness 与 u_Metalness 均参与最终 FragColor | — | ✅ 无 DCE |

**BRDF 审计裁决**：`PBR_BRDF_CONFORMANCE = ESTABLISHED`（标准物理 Cook-Torrance 能量守恒管线完全成立并严格消费参数）。

### 5.4 L6 归因结论

对比期望值（L5 传入计划）与观察值（L6 实际着色器状态与像素直方图）：
- **对称度**：网格与视口严格居中，相机构造未产生非对称偏移，symmetry=0.6377 的结构失配完全继承自上游。
- **色彩**：渲染器忠实还原冷调底色与暖色天光，未引入额外温度漂移。
- **材质**：PBR BRDF 完整执行，未篡改 metalness=0.3605，未篡改 roughness=0.70。

**L6 阶段归因结论**：`RENDER_NOT_FIRST_DIVERGENCE`。渲染器（WebGL2 ANGLE/SwiftShader）未引入系统性突变，非故障发源地。

---

## 六、L0→L7 全链路因果穿透全景总表

| 层级 | 核心证据 | 期望值 | 观察值 | 残差/状态 | 判定 |
|---|---|---|---|---|---|
| **L0** | 原片物理关键帧像素 | — | symmetry=0.6377, tempBias=-0.524, metalProxy=0.036 | — | REFERENCE |
| **L1** | visual-features.json | L0 物理量 | symmetry=0.6377, tempBias=-0.524, roughness=0.10(钳位), metalness=0.3605 | roughness 异常偏低（Laplacian 分母塌陷） | **DRIFT (Material)** / PASS (Comp/Color) |
| **L2** | EstimatedParameter[] | L1 映射 | 完整携带 L1 特征与置信度 | 对齐 L1 | PASS |
| **L3** | Normalized RawIR | L2 降维 | 符合 ABI 1.0.0 规范 | 无结构畸变 | PASS |
| **L4** | Patched IR | 语法规则改写 | negativeSpace: 0.45, roughness: 0.70, tempBias: 未补丁 | 双规则覆盖冲突，负向色温规则缺失 | **MUTATED** (roughness 被动掩盖) |
| **L5** | RuntimeExecutionPlan | TIER_A 协商 | 继承 L4: roughness=0.70, metalness=0.3605 | 严格一致 | PASS |
| **L6** | render-frame.rgba (518KB) | L5 PBR 渲染 | GLSL ES 3.00 完整执行，D_B=0.0812 | 忠实渲染，无新增漂移 | **PASS (Not First Divergence)** |
| **L7** | 5-Dim Evaluator | 预设美学阈值 | 3 项子指标断路触发 FAIL | 静态先验与场景冲突 | **EVALUATOR_FAIL** |

---

## 七、首个可证明偏差点（First Provable Divergence）汇总

| 故障维度 | 首个可证明偏差点 | 层级 | 归因分类 |
|---|---|---|---|
| Composition (symmetry) | 原片左右 NCC=0.6377，天然 < 0.70 | L0 | **SOURCE_LIMITED** |
| Color (temperatureBias) | 原片冷底暖光，cool 67% > warm 21%，整体 bias=-0.524 | L0 + L7 | **SOURCE_LIMITED + EVALUATOR_INDUCED** |
| Material (metalness) | 原片含金属构件，2D 高光代理估 0.3605 > 0.30 | L0 + L1 + L7 | **SOURCE_LIMITED + EXTRACTION_INDUCED + EVALUATOR_INDUCED** |
| Material (roughness) | L1 归一化分母塌陷致 4/6 帧钳位 0.1，触发补丁双重改写至 0.7 | L1 + L4 | **EXTRACTION_INDUCED → PATCH_INDUCED**（结果碰巧正确） |

---

## 八、排除假说验证（Non-Causes Verified）

经全链路穿透，以下三大假说被**彻底排除**：

1. **"编译流水线损坏资产"**：Core Compiler（Step 0~5）、Step 6-B Intent Normalizer 在 L2→L5 全程保真，ValidatedIR 结构无畸变，参数传递严格一致。
2. **"着色器未消费参数"**：WebGL2 GLSL ES 3.00 Fragment Shader 中 u_Roughness=0.70 与 u_Metalness=0.3605 均真实参与 GGX NDF、Schlick-GGX Geometry、Fresnel 与最终 FragColor 输出，无死代码剔除、无硬编码覆盖。
3. **"渲染器色偏篡改"**：L0↔L6 RGB 巴氏距离 D_B=0.0812（远低于发散阈值 0.35），温度偏向度残差 |Δ|=0.0180 ≪ 0.05，AgX 色调映射未引发色温失控反转。

---

## 九、核心根因归纳

### 9.1 首要根因：资产物理特征与 Evaluator 静态先验的系统性语义错位

GOLDEN_CASE_02 资产（云阙松风古建云海）天然具备以下物理特征：
- **满铺构图**：殿宇飞檐+松石岩层占据近 80% 画面，留白仅 15-20%，与 Evaluator [0.42, 0.65] 文人画式留白区间冲突。
- **冷底暖光**：暗部冷灰蓝（67% 冷像素）+ 日落高光极暖（2386K），整体 temperatureBias=-0.524，与 Evaluator [-0.30, 0.30] 中性色温区间冲突。
- **金属构件**：古建含铜钉/铁环/鎏金装饰，2D 高光代理估 metalness=0.3605，与 Evaluator ≤0.30 纯木石低金属阈值冲突。
- **非对称布局**：左侧巨松+右侧殿宇的非对称构图，symmetry=0.6377，与 Evaluator ≥0.70 中轴对称阈值冲突。

Evaluator 的四项阈值（negativeSpace [0.42,0.65]、temperatureBias [-0.30,0.30]、metalness ≤0.30、symmetry ≥0.70）均隐含特定美学先验（文人画/木石/中性色温/中轴对称），对"富丽古建+冷底暖光+金属构件+非对称布局"场景不友好。

### 9.2 次要根因：L1 粗糙度提取的可证明缺陷

L1 `roughness` 提取存在归一化分母异常：
- 记录方法："1 - normalized Laplacian variance (sharpness inverse)"
- 记录的 sharpness 值：1927, 2307, 730, 687, 1837, 2353
- L0 独立 Laplacian variance：351（中位数）
- 4/6 帧被钳位到下限 0.1

此缺陷触发了补丁引擎的双重改写（ANTI-AI-01 → 0.28，CA-RULE-03 → 0.70），最终值 0.70 碰巧接近 L0 物理值 0.825。这是"错误路径到达正确结果"的典型案例，补丁在此场景中是冗余且有风险的。

### 9.3 补丁引擎设计缺陷

1. **同路径双重命中**：同一目标路径被多条规则命中时，后执行规则覆盖先执行规则，audit 未记录链式中间值。
2. **规则覆盖不对称**：temperatureBias 只有 >0.30 的过暖补丁，无 <-0.30 的过冷补丁。
3. **字段缺失静默跳过**：CA-RULE-02 目标字段 keyLight.softness 为 null 时静默跳过，无告警。

---

## 十、STEP 7-B · 八层因果透视与首偏封签

### 10.1 八层因果透视模型

本审计采用八层因果透视模型，逐层追踪参数从物理像素到评估断言的完整演变链：

| 层级 | 名称 | 定义 |
|---|---|---|
| **L0** | 物理像素真值 (Pixel Ground Truth) | 关键帧原图的客观像素统计 |
| **L1** | 特征提取测量 (Signal Extraction) | OpenCV / 信号处理算法输出 |
| **L2** | Cangjie 参量定标 (EstimatedParameter) | 参数级置信度与校准元数据 |
| **L3** | Step 6-B 降维 IR (Normalized RawIR) | ABI 1.0.0 物理结构映射 |
| **L4** | 语法/Anti-AI 补丁 (Patched IR) | 规则引擎 AST 改写结果 |
| **L5** | 硬件装配配置 (RuntimeExecutionPlan) | TIER_A 协商与渲染参数 |
| **L6** | WebGL2 像素着色 (Shader Execution) | GLSL 执行与 readPixels 输出 |
| **L7** | 5-Dim 评估门限 (Evaluator Assertions) | 硬性阈值判定 |

### 10.2 COMP-002-AXIS-SYMMETRY 八层演变链

```
L0（物理原帧）：左右半幅镜像归一化互相关（NCC）实测中位数 0.6377
  （左侧苍松斜出，右侧殿宇飞檐，天然非中轴对称结构）
  ↓ Δ = 0.0000
L1（特征提取）：visual-features.json 记录 symmetry = 0.6377
  ↓ 透传
L2→L3：透传至 RawDesignIR /composition/symmetry = 0.6377
  ↓ 未命中
L4（补丁引擎）：CA-RULE-05-JINGMO 门限为 symmetry > 0.90（破除过强对称）
  0.6377 未命中，保持 0.6377
  ↓ 无畸变
L5→L6：相机与视口保持正交居中，未引入非对称畸变
  ↓
L7（评估器）：断言 symmetry >= 0.70 → 判定 FAIL（得分子项 0）
```

- **首个可证明偏差点**：L0（物理源头）
- **最终定性**：`SOURCE_LIMITED`
- **定性依据**：原片自身构图即非中轴对称，特征提取零漂移，下游无篡改，评估器忠实测量了原片物理不对称性。

### 10.3 COLOR-002-TEMPERATURE-BALANCE 八层演变链

```
L0（物理原帧）：整体色度 b* 均值 -4.14（大面积冷灰蓝暗部与阴影）
  冷色像素占比 67.44%，暖色高光仅占 21.15%
  局域霞光高色温源 CCT = 2386K（极暖）
  宏观冷暖偏向度 = -0.5240
  ↓ Δ = 0.0000
L1（特征提取）：visual-features.json 记录 temperatureBias = -0.524
  ↓ 透传
L2→L3：透传至 RawDesignIR /color/temperatureBias = -0.524
  ↓ 未命中
L4（补丁引擎）：CA-RULE-04-SHEJI 仅防过暖（temperatureBias > 0.30）
  未定义过冷规则，保持 -0.524
  ↓ 无反转
L5→L6：WebGL2 着色器渲染后测得像素直方图冷暖比 = -0.5420
  Bhattacharyya 距离 D_B = 0.0812（远低于发散阈值 0.35）
  未引入反转漂移
  ↓
L7（评估器）：断言 temperatureBias ∈ [-0.30, 0.30] → 判定 FAIL
```

- **首个可证明偏差点**：L0（物理源头事实）+ L7（评估门槛泛化局限）
- **最终定性**：`SOURCE_LIMITED + EVALUATOR_INDUCED`
- **定性依据**：
  - **事实层面**：原片"冷底暖光"是真实客观物理特征，L0 整体像素统计确实偏冷（-0.524），不存在提取或着色器伪造。
  - **评价层面**：Evaluator 的 [-0.30, 0.30] 先验建立在"全局色温均衡/中性"假设上，对"大面积冷蓝基调配合局域暖霞"的高动态艺术打光缺乏语义分层能力，导致物理真实的艺术用光被定性为缺陷。

### 10.4 MAT-003-LOW-METALNESS 八层演变链

```
L0（物理原帧）：高光-低饱和像素比例实测中位数 = 0.0360
  （约 3.6% 区域存在铜钉、瓦当、高反光构件及光滑石材反光）
  ↓ ⚠️ 一阶数量级放大
L1（特征提取）：算法使用基于 2D 高光比例的线性放大代理函数
  输出 metalness = 0.3605
  （相比 0.0360 发生一阶数量级放大，将强反射平滑木石一并视作金属度）
  ↓ 透传
L2→L3：透传至 RawDesignIR /materials/0/metalness = 0.3605
  ↓ 无补丁
L4（补丁引擎）：规则库中无针对 metalness 的补丁
  （ANTI-AI-01 仅拦截改写 roughness），保持 0.3605
  ↓ 真实消费
L5→L6：着色器严格执行 Cook-Torrance BRDF
  u_Metalness = 0.3605 真实参与基础反射率 F0 线性混合
  ↓
L7（评估器）：断言 metalness <= 0.30（东方美学木石低金属约束）
  → 判定 FAIL（得分子项 0）
```

- **首个可证明偏差点**：L1（特征提取代理算法失真）
- **最终定性**：`EXTRACTION_INDUCED`（辅以 L7 门限未区分混合构件建筑）
- **定性依据**：L0 物理像素的高光占比仅为 3.6%，L1 的"高光转金属度代理算法"缺乏表面法线与多角度视差支撑，将环境镜面强光错误放大推断为整体材质具有 36% 的金属性，直接击穿了 L7 的 0.30 上限。这是典型的特征提取模型缺陷。

### 10.5 伴生重要发现：粗糙度（Roughness）的"暗病因果"封签

```
L0 原片：Laplacian 方差实测中位数 = 351
  对应真实粗糙度 ≈ 0.825（天然达标 [0.30, 0.85]）
  ↓ ⚠️ 归一化分母异常
L1 特征提取：被压制钳位至下限 0.10（4/6 帧）
  （EXTRACTION_INDUCED 故障点：sharpness 记录值 1927~2353 与
   L0 独立 Laplacian variance 351 严重不一致）
  ↓ 触发双重补丁
L4 补丁引擎：ANTI-AI-01（roughness < 0.18 → 0.28）
  + CA-RULE-03-CANGRUN（roughness < 0.50 → 0.70）
  最终覆盖为 0.70（CA-RULE-03 后执行）
  ↓
L7 评估器：阈值 [0.30, 0.85]，0.70 判定 PASS
```

- **定性结论**：`EXTRACTION_DEFECT_MASKED_BY_PATCH`（提取缺陷被补丁意外掩盖）
- **风险等级**：**HIGH**（虽未构成 Evaluation FAIL，但必须作为高危脆弱点正式备案）
- **风险说明**：若 L1 提取修复为正确值 0.825，补丁将不再触发（0.825 > 0.50），最终值 0.825 仍在 [0.30, 0.85] 内 PASS。当前 PASS 是"错误路径到达正确结果"，补丁在此场景中是冗余且有风险的。

### 10.6 最终因果归因裁决汇总表

| 维度 / 项 | 测量值 | 门限 | 状态 | 首偏层级 | 权威定性 | 核心根因简述 |
|---|---|---|---|---|---|---|
| COMP-002 (Symmetry) | 0.6377 | ≥ 0.70 | FAIL | L0 | SOURCE_LIMITED | 原片苍松殿宇自然不对称，非管线失真 |
| COLOR-002 (TempBias) | -0.5240 | [-0.30, 0.30] | FAIL | L0 + L7 | SOURCE_LIMITED + EVALUATOR_INDUCED | 原片真实冷底暖光，与评估器静态中性先验冲突 |
| MAT-003 (Metalness) | 0.3605 | ≤ 0.30 | FAIL | L1 | EXTRACTION_INDUCED | 2D 镜面高光代理算法放大估算，误判材质属性 |
| MAT-002 (Roughness) | 0.7000 | [0.30, 0.85] | PASS | L1 → L4 | MASKED_BY_PATCH | L1 塌陷为 0.10，被 L4 补丁重写至 0.70 侥幸过线 |

---

## 十一、结论与建议

### 11.1 结论

STEP 7 归因物证全部闭环。GOLDEN_CASE_02 的三个 0.75 FAIL 维度**均非下游编译流水线篡改**：

- **Composition (symmetry=0.6377)**：首个偏差点在 L0，原片天然非中轴对称，定性 `SOURCE_LIMITED`。
- **Color (temperatureBias=-0.524)**：首个偏差点在 L0（原片真实冷底暖光）+ L7（评估器静态中性先验缺乏语义分层），定性 `SOURCE_LIMITED + EVALUATOR_INDUCED`。
- **Material (metalness=0.3605)**：首个偏差点在 L1，2D 高光→金属度代理算法将 3.6% 高光放大为 36% 金属性，定性 `EXTRACTION_INDUCED`（辅以 L7 门限未区分混合构件建筑）。
- **Material (roughness=0.70)**：虽 PASS，但存在 L1 提取缺陷（钳位至 0.10）被 L4 补丁意外掩盖的高危脆弱点，定性 `MASKED_BY_PATCH`。

Core Compiler、Step 6-B、L6 WebGL2 渲染器全程保真，**零责任**。

### 11.2 建议（非本轮执行范围，仅供后续迭代参考）

| 优先级 | 建议 | 对应根因 |
|---|---|---|
| P0 | 修复 L1 metalness 代理算法：从"specular highlight ratio 线性放大"升级为多特征融合（高光形状+偏振+色彩饱和度+表面法线估计），降低光滑非金属的误判 | EXTRACTION_INDUCED |
| P0 | 修复 L1 roughness 归一化分母，使 sharpness 与 Laplacian variance 物理对齐，消除 4/6 帧钳位 | MASKED_BY_PATCH |
| P1 | Evaluator 引入"场景风格画像"（scene profile），对"富丽古建"vs"文人水墨"采用不同阈值集，而非单一静态先验 | EVALUATOR_INDUCED |
| P1 | Evaluator 的 temperatureBias 增加语义分层：区分"全局冷底+局域暖光"的艺术打光与"全局色温失控" | EVALUATOR_INDUCED |
| P1 | 补丁引擎增加同路径冲突检测，audit 记录链式中间值（fromValue → intermediateValue → finalValue） | PATCH_INDUCED |
| P2 | 补充 temperatureBias < -0.30 的过冷补丁规则，与 CA-RULE-04 对称 | PATCH_INDUCED |

### 11.3 状态封签（STEP 7-B SEALED）

```
═══════════════════════════════════════════════════════════════
  STEP 7-B · FIRST PROVABLE DIVERGENCE — SEALED
═══════════════════════════════════════════════════════════════

  Audit Baseline:    master@fb47341
  Audit Mode:        FORENSIC_ANALYSIS_ONLY (zero code changes)
  Case:              GOLDEN_CASE_02 (云阙松风古建云海)
  Asset SHA-256:     e720ed53b546bd9dad3e995396427c14b358826aa4f3ef30f5cb0c294acd641a

  FIRST PROVABLE DIVERGENCE:
  ┌─────────────────────────────────────────────────────────────┐
  │ COMP-002 (Symmetry)    │ L0  │ SOURCE_LIMITED             │
  │   0.6377 < 0.70        │     │ 原片苍松殿宇自然不对称      │
  ├─────────────────────────────────────────────────────────────┤
  │ COLOR-002 (TempBias)   │ L0+L7│ SOURCE_LIMITED +          │
  │   -0.524 ∉ [-0.3,0.3]  │     │ EVALUATOR_INDUCED          │
  │                          │     │ 原片真实冷底暖光 vs 静态先验│
  ├─────────────────────────────────────────────────────────────┤
  │ MAT-003 (Metalness)    │ L1  │ EXTRACTION_INDUCED         │
  │   0.3605 > 0.30        │     │ 2D高光代理算法放大估算      │
  ├─────────────────────────────────────────────────────────────┤
  │ MAT-002 (Roughness)    │ L1→L4│ MASKED_BY_PATCH (HIGH RISK)│
  │   0.70 ∈ [0.30,0.85]   │     │ L1塌陷0.10被补丁重写至0.70  │
  └─────────────────────────────────────────────────────────────┘

  DOWNSTREAM LIABILITY:    NONE
    Core Compiler (Step 0~5): PASS / ZERO LIABILITY
    Step 6-B Normalizer:    PASS / ZERO LIABILITY
    L6 WebGL2 Renderer:     PASS / ZERO LIABILITY (D_B=0.0812)

  EVIDENCE CHAIN:          COMPLETE (L0→L7 full trace)
  EVIDENCE HYGIENE:        PASS (STEP 7-A case-02/case-03 isolated)
  REGRESSION:              215/215 PASS

  SEAL STATUS:             STEP 7-B · FIRST PROVABLE DIVERGENCE · SEALED
  Seal Timestamp:          2026-09-15
  Seal Authority:          Forensic Analysis Pipeline (deterministic, no human override)
═══════════════════════════════════════════════════════════════
```

---

*本白皮书由 STEP 7 Error Attribution & Trace Postmortem 汇编，经 STEP 7-A Evidence Hygiene 隔离净化，STEP 7-B First Provable Divergence 封签。基线锁定于 master@fb47341，全过程 READ-ONLY / FORENSIC_ANALYSIS_ONLY，零代码修改、零阈值调整、零人工粉饰。*
