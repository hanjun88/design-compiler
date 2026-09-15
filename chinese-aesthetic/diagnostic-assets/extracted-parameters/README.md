# 91 EstimatedParameters — E2E 蒸馏产物归档

## 性质定标

本目录归档的 91 个参数严格定性为 **EstimatedParameter**（视觉估计参数），
**严禁**未经物理测量与置信度审计直接并入 `ObservableEvidence`。

## 来源

- 22 图 E2E Skill Compatibility Test 中，对 7 张代表图执行参量蒸馏
- 蒸馏工具：cangjie-skill（文本方法论蒸馏元 skill，非物理提取器）
- 每张图 13 个参数，共 91 个单元

## 参数结构

每个参数包含：
- `paramId`: 参数标识（如 camera-angle, roughness, metalness）
- `path`: IR 路径（如 scene.camera.angle）
- `value`: 估计值
- `confidence`: 置信度（0.65–0.80，均低于物理测量的 0.9+）
- `source`: 来源标记，全部为 `visual_estimation:` 前缀
- `unit`: 单位
- `verification`: 验证状态（V1/V2/V3）

## 四级重分类（按 Phase 2.1 证据纯度标准）

| 分类 | 示例参数 | 可否进入 ObservableEvidence |
|---|---|---|
| 物理可测量域 | 色彩直方图、边缘密度 | 可（需重新用 visual-parameter-extractor 实测） |
| 编译器镜像域 | IR 声明 roughness/metalness | 只读镜像，不可作为物理观测 |
| 纯推断估计域 | camera-angle、光照方向、视平线 | **不可**，保留 EstimatedParameter 标记 |
| 不可测量语义域 | 气韵生动、文人意境 | **禁止**进入机器判定 |

## 硬边界

1. **不得**将本目录参数直接作为 `ObservableEvidenceSet` 输入
2. **不得**将 `visual_estimation` 来源的参数标记为 `method: direct-optical`
3. **不得**用这些参数反向"修正" Phase 2.2 物理提取器的输出
4. 如需将某参数升级为 ObservableEvidence，必须通过 `visual-parameter-extractor` 重新实测，并附带 `evidenceRef` + `confidence` + `method`

## 文件清单

- `91-estimated-parameters-e2e.json`: 完整 91 参数原始蒸馏产物
- `README.md`: 本文件

## 关联资产

- `../DIAGNOSTIC-ASSET-MANIFEST.json`: 22 图诊断资产登记
- `../evidence/diagnostic-anti-patterns/`: 反模式诊断报告
