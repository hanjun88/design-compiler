# Video Sources — 视频素材库

## 素材清单

### 1. 中式科幻建筑 — 抖音视频

| 字段 | 值 |
|---|---|
| 来源 | 抖音 @Ai灵感主义 |
| 标题 | 亚洲建筑有自己的独特风格 #中式 #科幻 #建筑 #氛围感 #风景 |
| 视频ID | 7654799674842749382 |
| 短链 | https://v.douyin.com/WqXCfwPz42o/ |
| 文件 | `7654799674842749382.mp4` |
| 时长 | 21.1 秒 |
| 分辨率 | 1030 × 576 |
| 帧率 | 30 fps |
| 编码 | H.264 + AAC |
| 大小 | 6.3 MB |
| 范式标签 | 中式 + 科幻 + 建筑 + 氛围感 |

### 抽帧

`frames/` 目录包含 5 帧均匀采样（每 3 秒一帧），分辨率 480×268 PNG：

- `frame_01.png` — 0s
- `frame_02.png` — 3s
- `frame_03.png` — 6s
- `frame_04.png` — 9s
- `frame_05.png` — 12s

## Phase 2 流水线测试结果

**测试**: `tests/e2e-video-motion.test.ts` — 7/7 PASS

### 关键发现：视频独有的运动证据维度

单帧图片无法测量的维度，视频多帧序列成功提取：

| 运动指标 | 实测值 | 说明 |
|---|---|---|
| motionContinuity | 0.5109 | 运动连续性 |
| opticalFlowDirectionCoherence | 0.5024 | 光流方向一致性 |
| cameraMotionSmoothness | 0.5193 | 相机运动平滑度 |
| luminanceContinuity | 0.9784 | 亮度帧间连续性（高） |
| chromaticContinuity | (实测) | 色彩帧间连续性 |
| framePairCount | 4 | 5帧 → 4对光流 |

### 与单帧图片的关键区别

| 维度 | 单帧图片 | 视频多帧 |
|---|---|---|
| motion (运动证据) | `null` (UNMEASURED) | **AVAILABLE** (实测) |
| qiyunContinuity 状态 | INCONCLUSIVE | **可测量** (基于运动数据) |
| 光流方向一致性 | 无法测量 | 0.5024 |
| 相机运动平滑度 | 无法测量 | 0.5193 |
| 帧间亮度连续性 | 无法测量 | 0.9784 |

### 仍为 UNMEASURED 的维度

- **depth (深度缓冲)**: 视频无深度缓冲 → spatialDepth 仍为 INCONCLUSIVE
- 这符合设计预期：UNMEASURED ≠ FAIL

## 素材用途

1. **Golden Case 候选**: 中式科幻范式的视频参考素材
2. **运动证据测试基准**: 验证 visual-parameter-extractor 的多帧光流计算
3. **时间维度评估**: 测试 qiyunContinuity 在有运动数据时的评估能力
4. **范式扩展**: 中式 + 科幻交叉范式的参考样本

## 硬边界

- 本素材为 **诊断/候选资产**，未正式晋升 Golden Case
- 视频内容版权归原作者所有，仅用于内部测试
- 抽帧为测试用途，不代表完整视频内容
