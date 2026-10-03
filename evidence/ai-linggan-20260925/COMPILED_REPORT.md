# Ai灵感主义 15视频语料 蒸馏编译总报告 (COMPILED_REPORT)

> 生成时间：2026-09-25
> 输入：15 个抖音 AI 视频、194 帧关键帧、子代理 1-19 全部输出
> 本报告为 design-compiler 与 chinese-aesthetic-skill 两个 GitHub 仓库的统一编译产物。

## 1. 概述
- **语料规模**：15 个视频，共 194 帧关键帧，总时长/体积约 100.5 MB。
- **方法**：对子代理逐视频产出的 visual-features.json / motion-summary.json / aesthetic-tags.json 做聚合，并由 color-system / spatial-system / motion-system / material-light-system 四个系统级文件交叉验证。
- **产出清单**：
  - design-compiler 证据文件 5 个（`/tmp/design-compiler/evidence/`）
  - chinese-aesthetic-skill 模块补充 10 个（`/tmp/chinese-aesthetic-skill/modules/*.distillation.md`）
  - 本总报告 1 份

## 2. 15 视频清单
| # | videoId | 标题(简) | 关键帧数 | 主色 | 主导镜头 | 意境评分 |
|---|---|---|---|---|---|---|
| 1 | 7667384452821655147 | 龙藏渊薮，凤待云生 丈夫当存渊底龙，蛰伏不折 | 12 | #e6d7b8 | drone_forward | 9 |
| 2 | 7665690703611583123 | 第6集 | 13 | #8aa4bc | push_in | 9 |
| 3 | 7664196253617583827 | 第7集 | 10 | #2c4a5e | static | 10 |
| 4 | 7686702997841556587 | 如果生活太累，不如放下包袱去旅行呀 | 13 | #1f3f8c | push_in | 9 |
| 5 | 7686442636145000319 | 未来200年后的中国城市？ | 14 | #1b2a44 | drone_forward | 8 |
| 6 | 7685962404496409577 | 第96集 | 15 | #2c4d75 | drone_forward | 9 |
| 7 | 7685248122851316138 | 第95集 | 14 | #2b3a6e | drone_forward | 9 |
| 8 | 7684860872473331108 | 第94集 | 14 | #2b3a67 | drone_forward | 9 |
| 9 | 7683761354905592746 | 完成人类劳动力的解放是对这座城市最好的理解 | 14 | #14213d | drone_forward | 9 |
| 10 | 7682703460458925139 | 第93集 | 9 | #0e1a2e | drone_forward | 8 |
| 11 | 7681974107332140534 | 某天走在路上，我终于决定要离开地球村 | 11 | #1c2440 | drone_forward | 9 |
| 12 | 7681602707157268139 | 百年内哪座城市会最先有未来感？ | 14 | #232a55 | drone_forward | 8 |
| 13 | 7680860065297455430 | 一个色彩丰富的星际城市 | 13 | #1e2a52 | push_in | 9 |
| 14 | 7680002696242570218 | 千年风华流转，十二朝天上人间 | 14 | #c9a06a | push_in | 9 |
| 15 | 7679703122511594175 | 第17集 | 14 | #c46a3a | drone_forward | 9 |

## 3. 色彩体系总结
- **主色板**：主 `#2c4a5e`（青灰蓝，占比0.32）、辅 `#e9eef7`（月白，0.26）、点 `#d89048`（赭金，0.15）。
- **色温趋势**：meanTemperatureBias = -0.0607，冷调 9/15、暖调 6/15，整体 **冷色主导**。
- **饱和度/对比**：饱和度均值 0.406（0.32-0.46），对比度均值 9.89（8.2-12.5）。
- **五方正色映射**：青 0.28 ＞ 黑 0.248 ＞ 白 0.1993 ＞ 黄 0.174 ＞ 赤 0.0987。青黑为主，赤色被极度压制。

## 4. 构图空间总结
- **常见构图**：

| 构图模式 | 数量 | 占比 | 说明 |
|---|---|---|---|
| central_axis | 6 | 0.4 | 主体沿画面垂直中轴线排布，焦点集中在画面中央，形成稳定庄重的仪式感构图 |
| symmetrical | 1 | 0.07 | 左右近镜像对称，对称度高，营造秩序感与纪念碑式肃穆氛围 |
| layered_depth | 1 | 0.07 | 通过前中后景多层叠加营造纵深，不依赖强中轴线，视觉层次丰富 |
| aerial_overview | 4 | 0.27 | 高空/鸟瞰机位俯视全局，展现建筑或场景的宏观格局与几何秩序 |
| low_angle_grand | 3 | 0.2 | 低角度仰拍，强调主体高耸巍峨与崇高感 |

- **中轴线使用率**：0.93（14/15）。
- **留白**：均值 0.26（0.14-0.38）。
- **景深**：均值 4.7 层（4-5）。
- **对称度**：均值 0.58（0.45-0.72）。
- **焦点**：[0.5, 0.49]，高度居中。

## 5. 运动镜头总结
- **镜头分布**：

| 镜头类型 | 出现视频数 | 主导次数 | 平均占比 |
|---|---|---|---|
| drone_forward | 15 | 10 | 0.36 |
| push_in | 14 | 4 | 0.3 |
| static | 14 | 1 | 0.14 |
| tracking | 6 | 0 | 0.08 |
| tilt_up | 7 | 0 | 0.07 |
| pan_right | 4 | 0 | 0.03 |
| aerial_hover | 1 | 0 | 0.01 |
| aerial | 1 | 0 | 0.01 |

- **转场分布**：

| 转场类型 | 总数 | 占比 |
|---|---|---|
| cut | 88 | 0.746 |
| dissolve | 22 | 0.186 |
| crossfade | 3 | 0.025 |
| static_in_shot | 3 | 0.025 |
| match_cut | 2 | 0.017 |

- **节奏**：slow 11/15、medium 4/15、fast 0；平均镜头时长 3.41s。
- **速度曲线**：steady 8、gradual 6、accelerating 1。
- **美学链接**：15个视频的motionAestheticLink呈现高度一致的东方史诗美学共性：普遍以低角度缓推/仰拍镜头配合云海翻涌来强化仙宫、宫殿等巨构建筑的巍峨与崇高感；动态元素（女子衣袂飘拂、凤凰展翅、金色流光/瀑布穿云）与静态巨构形成'虚实相生、动静相宜'的呼应动势；节奏多为'由静转动、由远及近'的渐进曲线，气韵连贯、镜头与主体动势互为表里。高频关键词：缓推、巨构、云海、气韵、金、衣袂、崇高、虚实。

## 6. 材质光影总结
- **材质分布**：

| 材质 | 出现视频数 | 占比 |
|---|---|---|
| water | 15 | 1.0 |
| stone | 13 | 0.867 |
| cloud | 11 | 0.733 |
| glass | 10 | 0.667 |
| metal | 9 | 0.6 |
| neon | 9 | 0.6 |
| wood | 6 | 0.4 |
| bronze | 6 | 0.4 |
| mist | 6 | 0.4 |
| silk | 5 | 0.333 |
| marble | 3 | 0.2 |
| gold | 2 | 0.133 |
| ceramic | 2 | 0.133 |

- **材质参数**：roughness 均值 0.353（0.22-0.55），metalness 均值 0.405（0.08-0.62）。
- **光向分布**：

| 光向 | 数量 | 占比 |
|---|---|---|
| ambient | 5 | 0.333 |
| backlit | 3 | 0.2 |
| top-left | 3 | 0.2 |
| top | 2 | 0.133 |
| left | 1 | 0.067 |
| top-right | 1 | 0.067 |

- **体积光**：使用率 1.0（15/15，全员开启）。
- **丁达尔效应**：使用率 0.667（10/15）。
- **阴影**：全部 soft（15/15），无硬阴影。

## 7. 中式美学六法评分总览（15视频均值）
| 六法维度 | 均值(满分10) |
|---|---|
| 留白 | 6.4 |
| 虚实 | 7.93 |
| 气韵 | 8.27 |
| 意境 | 8.87 |
| 骨法 | 7.33 |
| 随类赋彩 | 7.93 |

- **最高维度**：意境 8.87/10、气韵 8.27/10（配景深远 9.07/10 为语义最高）。
- **最低维度**：留白 6.4/10（计白当黑、含蓄与留白同为短板）——本语料偏"巨构写实"，留白克制。

## 8. design-compiler 证据文件清单
| 文件 | 绝对路径 |
|---|---|
| visual-features | `/tmp/design-compiler/evidence/visual-features.json` |
| keyframes | `/tmp/design-compiler/evidence/keyframes.json` |
| motion-summary | `/tmp/design-compiler/evidence/motion-summary.json` |
| media-metadata | `/tmp/design-compiler/evidence/media-metadata.json` |
| watermark-report | `/tmp/design-compiler/evidence/watermark-report.json` |

## 9. chinese-aesthetic-skill 模块补充清单
| 模块 | 绝对路径 |
|---|---|
| color | `/tmp/chinese-aesthetic-skill/modules/color.distillation.md` |
| proportion | `/tmp/chinese-aesthetic-skill/modules/proportion.distillation.md` |
| motion | `/tmp/chinese-aesthetic-skill/modules/motion.distillation.md` |
| spatial | `/tmp/chinese-aesthetic-skill/modules/spatial.distillation.md` |
| light_shadow | `/tmp/chinese-aesthetic-skill/modules/light_shadow.distillation.md` |
| material | `/tmp/chinese-aesthetic-skill/modules/material.distillation.md` |
| void_solid | `/tmp/chinese-aesthetic-skill/modules/void_solid.distillation.md` |
| interaction | `/tmp/chinese-aesthetic-skill/modules/interaction.distillation.md` |
| time | `/tmp/chinese-aesthetic-skill/modules/time.distillation.md` |
| taboo | `/tmp/chinese-aesthetic-skill/modules/taboo.distillation.md` |

## 10. 局限性与后续建议
1. **样本偏科**：15 视频中 11 部为"未来城市/科幻巨构"题材，传统国风仅 4 部，结论对科幻中式偏重，纯古典山水样本不足。
2. **留白短板**：语料平均留白仅 0.26、留白评分 6.4，若要复现极简水墨意境需主动加大负空间。
3. **数值为 AI 视觉蒸馏估计**：palette/contrast/roughness 等为模型估计，非像素级测量，存在 ±0.05 系统误差。
4. **建议后续**：补充纯古典园林/水墨/人物题材样本各 ≥5 部，以平衡语料；并对硬阴影、高饱和色做反向对照实验以标定 taboo 边界。
