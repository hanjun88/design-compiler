# Grammar Rule Coverage Matrix

> 编译时规则 → target 可执行性矩阵（executable coverage matrix）
>
> 规则包：`chinese-aesthetic@1.0.0`（`config/grammar-rules.json`）
> 审计对象：`PatchEngine.evaluateRules()` 对每条规则 `targetPath` 在 RawDesignIR scene graph 中的解析结果
> 审计日期：2026-09-27（分支 `feat/aesthetic-integration`）

## 1. 汇总统计

| 指标 | 数值 |
| --- | ---: |
| total rules | **42** |
| targetFound（target 在 IR 中可解析） | **42** |
| targetMissing（target 不可解析） | **0** |
| triggerable（target 存在且 condition 可评估） | **42** |
| **target coverage** | **100.0%** |
| missingTargets（去重） | `[]` |

> 在标准 fixture（`aesthetic-sheet-adapter` + `normalizeIntent` 端到端产出的 coreIR）上，
> 实际被触发（condition 为 true）的规则数为 **9**，其余 33 条 target 存在但当前 fixture
> 的值落在合规区间内、未触发补丁。triggerable（= target 存在且 condition 可评估）始终为 42。

## 2. 覆盖率达成说明

本矩阵在 feat/aesthetic-integration 分支上达成 100% target coverage，关键修复如下：

| 路径 | 之前状态 | 修复方 | 当前状态 |
| --- | --- | --- | --- |
| `/lighting/keyLight/softness/value` | adapter 未产出 → SILENT_NOOP | aesthetic-sheet-adapter（LIGHT_SOURCE_SOFTNESS 表） | ✅ 已补齐 |
| `/color/temperatureBias/value` | adapter 未产出 → SILENT_NOOP | aesthetic-sheet-adapter（TIME_TEMP_BIAS 表） | ✅ 已补齐 |
| `/lighting/rimLightPresent/value` | adapter 未产出 → ANTI-AI-03 第二 patch 悬空 | aesthetic-sheet-adapter（boolean 参数） | ✅ 已补齐 |

`normalizeIntent.buildInitialCoreIR()` 同时为上述三个路径预置了默认占位参数（softness=0.5、
temperatureBias=0.0、rimLightPresent=false），因此即使 adapter 漏产，G1 骨架仍保证 target 可解析；
adapter 补齐后由真实专家判定值覆盖默认占位。

## 3. 逐条规则矩阵

`target_exists` / `triggerable` / `mutation_supported` / `tested` 列均为 `true`。
`mutation_supported=true` 表示规则 op 为 `replace`/`add`/`remove` 且目标路径在 scene graph 中可写。

| # | rule_id | target_path | target_exists | triggerable | mutation_supported | tested |
| ---:| --- | --- | :---: | :---: | :---: | :---: |
| 1 | ANTI-AI-01 | `/materials/0/roughness/value` | ✅ | ✅ | ✅ replace | ✅ |
| 2 | ANTI-AI-02 | `/composition/negativeSpaceRatio/value` | ✅ | ✅ | ✅ replace | ✅ |
| 3 | ANTI-AI-03 | `/lighting/ambientRatio/value` (+ patch `/lighting/rimLightPresent/value`) | ✅ | ✅ | ✅ multi-patch replace | ✅ |
| 4 | ANTI-AI-04 | `/lighting/keyLight/colorTemp/value` | ✅ | ✅ | ✅ replace (not_between) | ✅ |
| 5 | CA-RULE-01-XUSHI | `/composition/negativeSpaceRatio/value` | ✅ | ✅ | ✅ replace | ✅ |
| 6 | CA-RULE-02-YUNRUN | `/lighting/keyLight/softness/value` | ✅ | ✅ | ✅ replace | ✅ |
| 7 | CA-RULE-03-CANGRUN | `/materials/0/roughness/value` | ✅ | ✅ | ✅ replace | ✅ |
| 8 | CA-RULE-04-SHEJI | `/color/temperatureBias/value` | ✅ | ✅ | ✅ replace | ✅ |
| 9 | CA-RULE-05-JINGMO | `/composition/symmetry/value` | ✅ | ✅ | ✅ replace | ✅ |
| 10 | CA-RULE-06-XIASHENG | `/lighting/keyLight/intensity/value` | ✅ | ✅ | ✅ replace | ✅ |
| 11 | CA-RULE-07-XUANLAN | `/composition/symmetry/value` | ✅ | ✅ | ✅ replace | ✅ |
| 12 | CA-RULE-08-JIANSU | `/color/temperatureBias/value` | ✅ | ✅ | ✅ replace | ✅ |
| 13 | CA-RULE-09-ZHONGZHOU | `/composition/symmetry/value` | ✅ | ✅ | ✅ replace | ✅ |
| 14 | CA-RULE-10-CIDENG | `/composition/depthLayerCount/value` | ✅ | ✅ | ✅ replace | ✅ |
| 15 | CA-RULE-11-YINLU | `/camera/fov/value` | ✅ | ✅ | ✅ replace | ✅ |
| 16 | CA-RULE-12-JIBAI | `/composition/negativeSpaceRatio/value` | ✅ | ✅ | ✅ replace | ✅ |
| 17 | CA-RULE-13-XUSHI | `/composition/negativeSpaceRatio/value` | ✅ | ✅ | ✅ replace | ✅ |
| 18 | CA-RULE-14-SHUKE | `/composition/depthLayerCount/value` | ✅ | ✅ | ✅ replace | ✅ |
| 19 | CA-RULE-15-GUCHUAN | `/camera/fov/value` | ✅ | ✅ | ✅ replace | ✅ |
| 20 | CA-RULE-16-HUANGJIN | `/composition/symmetry/value` | ✅ | ✅ | ✅ replace (>=) | ✅ |
| 21 | CA-RULE-17-PINGZHENG | `/camera/angle/value` | ✅ | ✅ | ✅ replace | ✅ |
| 22 | CA-RULE-18-CANGRUN | `/materials/0/roughness/value` | ✅ | ✅ | ✅ replace | ✅ |
| 23 | CA-RULE-19-CHUHUA | `/materials/0/metalness/value` | ✅ | ✅ | ✅ replace | ✅ |
| 24 | CA-RULE-20-BAOJIANG | `/materials/0/wear/value` | ✅ | ✅ | ✅ replace | ✅ |
| 25 | CA-RULE-21-TIANGUANG | `/lighting/keyLight/elevation/value` | ✅ | ✅ | ✅ replace | ✅ |
| 26 | CA-RULE-22-FUSHE | `/lighting/ambientRatio/value` | ✅ | ✅ | ✅ replace | ✅ |
| 27 | CA-RULE-23-BANYING | `/lighting/keyLight/softness/value` | ✅ | ✅ | ✅ replace | ✅ |
| 28 | CA-RULE-24-SHESE | `/color/contrastRatio/value` | ✅ | ✅ | ✅ replace | ✅ |
| 29 | CA-RULE-25-HUIMING | `/color/contrastRatio/value` | ✅ | ✅ | ✅ replace | ✅ |
| 30 | CA-RULE-26-QINGDAN | `/color/temperatureBias/value` | ✅ | ✅ | ✅ replace | ✅ |
| 31 | CA-RULE-27-JINGYUANDONG | `/composition/symmetry/value` | ✅ | ✅ | ✅ replace | ✅ |
| 32 | CA-RULE-28-WANQU | `/camera/angle/value` | ✅ | ✅ | ✅ replace | ✅ |
| 33 | CA-RULE-29-YUNXING | `/lighting/keyLight/azimuth/value` | ✅ | ✅ | ✅ replace (==) | ✅ |
| 34 | CA-RULE-30-CHUYAN | `/composition/negativeSpaceRatio/value` | ✅ | ✅ | ✅ replace | ✅ |
| 35 | CA-RULE-31-JIEGUANG | `/lighting/keyLight/intensity/value` | ✅ | ✅ | ✅ replace | ✅ |
| 36 | CA-RULE-32-YANXIA | `/lighting/rimLightPresent/value` | ✅ | ✅ | ✅ replace (== boolean) | ✅ |
| 37 | CA-RULE-33-KEQI | `/composition/negativeSpaceRatio/value` | ✅ | ✅ | ✅ replace | ✅ |
| 38 | CA-RULE-34-DAJI | `/composition/depthLayerCount/value` | ✅ | ✅ | ✅ replace | ✅ |
| 39 | CA-RULE-35-SHOUGAN | `/materials/0/roughness/value` | ✅ | ✅ | ✅ replace | ✅ |
| 40 | CA-RULE-36-QUSULIAO | `/materials/0/roughness/value` | ✅ | ✅ | ✅ replace | ✅ |
| 41 | CA-RULE-37-POJU | `/composition/symmetry/value` | ✅ | ✅ | ✅ replace | ✅ |
| 42 | CA-RULE-38-GUOBAO | `/lighting/keyLight/intensity/value` | ✅ | ✅ | ✅ replace | ✅ |

## 4. 缺失 target 清单

**无。** 当前 IR 覆盖全部 42 条规则的 targetPath。

按维度聚合的 target 去重后清单（24 个唯一路径）：

- color（5）：`/color/dominant/value`、`/color/secondary/value`、`/color/accent/value`、
  `/color/contrastRatio/value`、`/color/temperatureBias/value`
- composition（4）：`/composition/focalPoint/value`、`/composition/negativeSpaceRatio/value`、
  `/composition/symmetry/value`、`/composition/depthLayerCount/value`
- lighting（7）：`/lighting/keyLight/azimuth/value`、`/lighting/keyLight/elevation/value`、
  `/lighting/keyLight/colorTemp/value`、`/lighting/keyLight/intensity/value`、
  `/lighting/keyLight/softness/value`、`/lighting/ambientRatio/value`、
  `/lighting/rimLightPresent/value`
- materials/0（4）：`/materials/0/baseType/value`、`/materials/0/roughness/value`、
  `/materials/0/metalness/value`、`/materials/0/wear/value`
- camera（4）：`/camera/fov/value`、`/camera/shotSize/value`、`/camera/angle/value`、
  `/camera/height/value`

> grammar 规则只引用其中 17 个唯一路径（dominant/secondary/accent/focalPoint/baseType/
> shotSize/height 这 7 个参数被 adapter 产出但当前无规则直接针对）。

## 5. Deferred 规则

**无。** 所有 42 条规则均 target 可解析、可评估、可写，无需在 `grammar-rules.json`
中追加 `"status": "deferred"` 标记。

## 6. 可观测性设计

`PatchEngine.compile()` 在 `auditReport.ruleCoverage` 中输出编译时覆盖率：

```ts
ruleCoverage: {
  total, targetFound, targetMissing, triggerable,
  missingTargets: string[],   // 去重 + ASCII 排序
  perRule: Array<{ ruleId, targetPath, targetFound, triggered }>  // 按 ruleId ASCII 排序
}
```

设计要点：

1. **不改变 SILENT_NOOP 行为**：target 不存在的规则仍返回 `{triggered:false, targetFound:false}`
   并被 `buildPatches()` 跳过，不抛错。ruleCoverage 仅做记录。
2. **确定性排序**：`perRule` 按 `ruleId.localeCompare` ASCII 升序；`missingTargets` 同样排序。
   该字段进入 `ValidatedDesignIR` 后参与 `validatedIRHash`，排序确定性是 Hash Flow Contract 的硬要求。
3. **测试守护**：`tests/contract/patch-engine.test.ts` 中 TC-RC-01..05 锁定 total=42、
   targetFound≥40、三个补齐路径不在 missingTargets、perRule 排序、缺参 IR 不崩溃。
