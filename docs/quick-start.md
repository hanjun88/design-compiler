# Design Compiler 快速开始（5 分钟上手）

> 目标：装好依赖、跑通一条最小编译，再用 `aesthetic-integration` 把一张美学约束单喂进真实流水线。

## 0. 环境要求

- Node.js >= 20
- 安装：

```bash
cd design-compiler-inspect
npm install
npm run test:contract   # 契约测试应全绿
```

## 1. 运行测试确认环境

```bash
npm test                # G0/G2 ABI 门禁
npm run test:contract   # jest 契约测试（G1/G2/G3/Planner）
npm run test:all        # 全部
```

## 2. 配置（已内置生产配置）

三条门禁的配置都在 `config/`，开箱即用：

| 文件 | 作用 |
|------|------|
| `config/g1-policy.json` | 置信度地板 0.6 + 7 条 requiredPaths |
| `config/grammar-rules.json` | 42 条 chinese-aesthetic G2 规则 |
| `config/tier-mapping.json` | TIER_A/B/C 渲染能力映射 |

一般无需改动；要调门槛/规则再编辑这些 JSON（SSOT）。

## 3. 最小编译（裸 PipelineRunner）

```ts
import { PipelineRunner } from "./compiler-core/pipeline-runner";
import * as fs from "fs";

const g1Policy = JSON.parse(fs.readFileSync("config/g1-policy.json", "utf8"));
const grammar  = JSON.parse(fs.readFileSync("config/grammar-rules.json", "utf8"));
const tierCfg  = JSON.parse(fs.readFileSync("config/tier-mapping.json", "utf8"));

const runner = new PipelineRunner({ g1Policy, grammar, tierConfig: tierCfg });

const out = runner.execute(coreRawDesignIR, { webgl2: true, floatTextures: true }, "case-01");

if (out.status === "SUCCESS") {
  console.log(out.executionPlan);   // 最终执行计划
  console.log(out.hashChain);        // 4 元哈希链
} else {
  console.log("halted:", out.haltStage);           // G1_DATA_GATE | G3_CAPABILITY_NEGOTIATOR
  console.log(out.evaluation.diagnostics);
}
```

> `coreRawDesignIR` 需是经 `compiler-intent/normalizeIntent` 规范化后的 `RawDesignIR`。直接喂 Cangjie IR 请用下面的美学集成路径。

## 4. 美学集成快速使用（推荐）

`aesthetic-integration` 一条命令完成 adapter → normalize → G1→G2→G3：

```ts
import { AestheticPipelineRunner, type AestheticConstraintSheet } from "./aesthetic-integration";

const sheet: AestheticConstraintSheet = {
  sheetId: "demo-shuyuan",
  designBrief: "书院入口",
  mood: "song-elegant",
  attributionStatement: "月白底、黛青骨、古金点",
  structuralDimensions: [
    { id: "void-solid", weight: "primary", hard: "留白:建筑≈7:5" },
    { id: "color", weight: "secondary", hard: "饱和度≤50%" },
  ],
  colorSystem: {
    palette: [
      { role: "dominant", name: "月白", hex: "#EDEAE4", areaPct: 0.65, usage: "底" },
      { role: "secondary", name: "黛青", hex: "#2C3E50", areaPct: 0.25, usage: "骨" },
      { role: "accent", name: "古金", hex: "#B8893A", areaPct: 0.05, usage: "点" },
    ],
    saturationMax: 0.5,
    hardFailHex: ["#FF0000", "#FFD700", "#000000", "#00FFFF"],
  },
  proportion: { baseModulePx: 8, spacingScale: [1,2,4,6,8], voidSolidRatio: "7:5", focalPointsMax: 1 },
  spatial: { axis: "strict", bays: 3, hierarchyLevelsMin: 3 },
  lighting: { primarySource: "skylight", timeSetting: "dusk", lightDarkRatio: "3:7" },
  motion: { prototypes: ["cloud","water"], durationMs: [800,3500], entryMode: "emerge", hardFail: ["bounce","particle"] },
  antiCliche: { scanned: true, hardFailHits: [], forbidden: ["正红","亮金","死黑"] },
  violations: [],
  score: 88,
};

const runner = new AestheticPipelineRunner();
const result = runner.execute(sheet, { webgl2: true, floatTextures: true }, {
  capturedAt: "2026-09-27T00:00:00Z",   // 必传，确定性
  testCaseId: "AES-demo-shuyuan",
});

if (result.pipeline.status === "SUCCESS") {
  console.log(result.pipeline.executionPlan.renderer);
  console.log(result.pipeline.hashChain);
} else {
  console.log("haltStage:", result.pipeline.haltStage);
}
```

## 5. 读取结果

成功时 `result.pipeline` 为 SUCCESS：
- `executionPlan`：可直接喂 WebGL 运行时；
- `hashChain`：`inputHash / rawIRHash / validatedIRHash / executionPlanHash`，用于溯源。

终止时：
- `haltStage === "G1_DATA_GATE"`：数据门禁拦截（required path 缺失或置信度不足）；
- `haltStage === "G3_CAPABILITY_NEGOTIATOR"`：宿主能力不足（如没传 webgl2）。

---

## 常见问题（FAQ）

**Q1：构造 `AestheticPipelineRunner` 报错找不到 config？**
它从 `../config/` 读取三份 JSON。请在仓库根目录运行，或确认工作目录正确。

**Q2：结果停在 G1_DATA_GATE？**
说明 adapter 产出的参数里 required path 置信度 < 0.6 或缺路径。可在 `opts.confidenceOverrides` 里按 DC path（不带 `/value`）临时抬置信度来定位，或补全 sheet 字段。

**Q3：怎么让某条参数走 EXPERIMENTAL calibration？**
`opts.calibrationOverrides = { "/materials/0/roughness": "EXPERIMENTAL" }`。

**Q4：改了 grammar-rules.json 没生效？**
确认改的是 `config/grammar-rules.json`（SSOT）；CAS 侧 TS 镜像需另行同步。

**Q5：可以不经过美学集成，直接喂 RawDesignIR 吗？**
可以，直接用裸 `PipelineRunner.execute(coreIR, hostCaps, testCaseId)`，见 [`api/compiler-core.md`](./api/compiler-core.md)。
