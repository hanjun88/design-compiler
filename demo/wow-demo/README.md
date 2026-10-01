# 唐韵 · 月色漆盒 — CAS → DC 真实管线渲染 (wow-demo)

这个演示把「闭环」做成可看见的效果：一张**真实中式美学约束 sheet**，经过确定性设计编译器
（G1 数据门 → G2 语法引擎 → G2.5 反俗套门 → G3 能力协商），吐出**真实 sceneBindings**
（相机 + 3 盏灯 + PBR 材质 uniforms），再由一个 WebGL2 着色器逐像素打光渲染。

**没有任何一张图是 AI 文生图。** 画面里每一个颜色、光位、强度、粗糙度，都能在
`out/scene-bindings.json` 里找到逐字节相同的值，并一路追溯回 sheet → IR → G3。

---

## 一、怎么运行（可复现）

前置：仓库 `/home/user/Doubao/chats/38444189331382018/dc-audit`（分支 `feat/aesthetic-integration`，
含 0b-1 rimLight 收口 commit `c67bb30`）。

```bash
REPO=/home/user/Doubao/chats/38444189331382018/dc-audit
DEMO=/home/user/Doubao/chats/38444228562036226/wow-demo

# 1) 真实编译：sheet → IR → sceneBindings（写 out/ 与 public/*.json）
cd $REPO
npx ts-node --transpile-only \
  --compiler-options '{"module":"CommonJS","moduleResolution":"node","ignoreDeprecations":"6.0"}' \
  $DEMO/compile.ts

# 2) 无头截图：起本地静态服务，系统 Chromium + SwiftShader 渲染 WebGL2 并出图
cd $DEMO && node serve-and-shot.js
#   → out/page-shot.png   整页（含右侧溯源面板）
#   → out/hero-canvas.png  干净 canvas hero 帧
```

想在浏览器里手动看：`cd $DEMO/public && npx -y serve -l 8713 .` 打开 http://localhost:8713 。

环境依赖：Node 22、系统 Chromium `/usr/local/bin/chromium`、全局 `puppeteer-core`
（已装于 `/home/user/.npm-global`）。WebGL2 经 `--use-angle=swiftshader` 软件光栅化出帧。

---

## 二、画面里每个视觉元素来自哪个真实管线环节

| 画面元素 | 渲染里用的值 | 来自哪 |
|---|---|---|
| 朱砂漆盒底色 | `uColorDeep = #8E2F22` | CAS sheet `colorSystem.dominant` → adapter → `validatedIR.color.dominant` → G3 `uColorDeep` |
| 鎏金饰环/描边 | `uColorRim = #C9A24B` | CAS `colorSystem.accent` → G3 `uColorRim` |
| 暖黄昏主光（右侧高光） | KeyLight az45°/elev30°/**3200K**/intensity0.75 | CAS `lighting.primarySource=leaked,timeSetting=dusk` → adapter `LIGHT_SOURCE_ANGLES` → G3 |
| **冷蓝月色轮廓光（左缘）** | **RimLight az240°/elev38°/color #7fb0d8/intensity1.25** | **0b-1 SSOT：`sheet.lighting.rimLight{}` 四字段逐字节直通**（见下） |
| 环境底光 | Ambient intensity 0.6 | `validatedIR.lighting.ambientRatio` → G3 |
| 漆面质感/粗糙度 | roughness0.72, metalness0.04, wear0.32, baseType `aged-paper-wood` | adapter 材质参数 → G2 语法补丁微调 → G3 `materials[]` |
| 内透光/包浆 | `uColorCore=#f5ecd6`, `uColorSkin=#ebe2ce` | G3 `lighten(secondary,0.35)` / `desaturate(secondary,0.4)` |
| 镜头 | fov35, medium shot, height1.6m | `validatedIR.camera` → G3 `cameraRig` |
| 后期风格 | AgX tone mapping + bloom + volumetric-fog | G3 `runtimePlan.pipeline`（TIER_A） |

**确定性**：同一张 sheet + 固定 `capturedAt` → 逐字节相同的 hash chain
（inputHash→rawIRHash→validatedIRHash→executionPlanHash），画面右侧面板可逐条核对。

---

## 三、本次重点：RimLight 从「派生 fallback」切成「SSOT 逐字节直通」

0b-1 之前，运行时轮廓光没有 SSOT 描述符，G3 会**派生**一盏：
`key+180° / grazing elev0.25 / accent色 #C9A24B / intensity0.6`。

0b-1 收口后，sheet 直接给出 `lighting.rimLight{azimuth:240, elevation:38, color:"#7fb0d8", intensity:1.25}`，
adapter → normalizer → validatedIR.rimLight → G3 `RimLight` **一字不改地直通**。
本演示 `out/scene-bindings.json` 里的 RimLight 正是 `{240, 38, "#7fb0d8", 1.25}`，
与 0b-1 e2e 探针（`/home/user/Doubao/chats/38444228562036226/evidence-0b1/`）验证的 4/4 字节相等一致——
画面左缘那圈冷蓝色轮廓光，就是这盏 SSOT 月色光打的。

---

## 四、文件清单（绝对路径 `/home/user/Doubao/chats/38444228562036226/wow-demo/`）

- `wow-sheet.ts` — 真实 CAS 形状中式美学 sheet（含 0b-1 SSOT rimLight{}）
- `compile.ts` — 真实 `AestheticPipelineRunner` 编译 → 吐绑定 JSON
- `public/index.html` — 交互式 WebGL2 场景 + 溯源面板（绑定真实 sceneBindings）
- `serve-and-shot.js` — 无头截图（SwiftShader 出帧）
- `out/scene-bindings.json` — G3 真实 sceneBindings（相机/3灯/材质）
- `out/provenance.json` — hash chain + 逐值溯源
- `out/page-shot.png` — 整页截图（含面板）
- `out/hero-canvas.png` — 干净 canvas hero 帧
- `lib/png-encode.js` — 零依赖 RGBA→PNG（SoftwareRenderer 兜底用）
