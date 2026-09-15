# Cyber-Chinese-01 — 首个多帧动态时空 Golden Reference Case

## 来源

- 抖音 @Ai灵感主义 — 亚洲建筑有自己的独特风格 #中式 #科幻 #建筑
- 视频ID: 7654799674842749382
- 范式标签: 中式 + 科幻 + 建筑 + 赛博巨构

## 输入

- 5帧均匀采样（每3秒一帧），480×268 PNG
- 源视频: chinese-aesthetic/diagnostic-assets/video-sources/7654799674842749382.mp4

## 关键物理特征（极端数据靶场）

| 特征 | 实测值 | 极端性 |
|---|---|---|
| negativeSpaceRatio | 0.016 | 极低留白（1.6%） |
| edgePixelRatio | 0.765 | 极高边缘密度 |
| spatialLaplacianVariance | 2691.15 | 高频细节极丰富 |
| specularSharpness | 33.96 | 非物理CG高光 |
| motionContinuity | 0.511 | 视频独有运动证据 |
| opticalFlowDirectionCoherence | 0.502 | 光流方向一致性 |
| luminanceContinuity | 0.978 | 帧间亮度极稳定 |

## Phase 3 算子测试靶场

这组极端数据是检验以下设计算子的绝佳输入：

- **OP_ENCLOSE_BREATHING_FIELD**: 能否在极低留白(0.016)的密集巨构中圈出呼吸场
- **OP_DAMPEN_SPECULAR_HARSHNESS**: 能否平抑 specularSharpness=33.96 的非物理高光
- **OP_APPLY_TIME_PATINA**: 能否在冰冷CG表面注入岁月包浆
- **OP_BALANCE_VOID_SOLID**: 能否在 edgePixelRatio=0.765 的极密画面中重建虚实平衡

## 转化结果摘要

- ObservableEvidence: 22 pixel + 13 motion + material 字段
- RelationshipGraph: 11节点/11关系（含 node:motion:optical-flow + MOVE_STILL 边）
- AntiPatternGate: overall=FLAG（ANTI-02 Unphysical Glow + ANTI-06 Fake Evidence）
- MachineEvaluator: focal=PASS, qiyun=PASS（视频运动支撑）, void=INCONCLUSIVE, spatial=INCONCLUSIVE

## 硬边界

- 本case为 **Golden Reference Case**（参考基准），非正向Golden Case
- 视频内容版权归原作者，仅用于内部测试
- 运动证据为视频独有，单帧图片无法复现
