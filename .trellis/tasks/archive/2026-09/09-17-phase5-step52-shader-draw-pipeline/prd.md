# Phase 5 Step 5.2-B: Complete Real Shader & Draw Pipeline

## Goal

PLAN-02 CONDITIONAL PASS 后实施：1) 固化2项缺口澄清（近裁剪面坐标空间+#29/#30 NOT_RUN）；2) 新增shader-source.ts（NDC编码验证着色器+标准渲染着色器）；3) 新增geometry-builder.ts（测试顶点+跨近裁剪面三角形，相机空间定义）；4) 升级gl-pipeline.ts renderFrame（program绑定+uniform注入+VAO/VBO+drawArrays+readPixels）；5) 升级E2E harness真实shader编译+draw call+NDC像素因果验证+近裁剪面硬件裁剪验证+黄金帧生成；6) 保护区零修改。

## Requirements

- TBD

## Acceptance Criteria

- [ ] TBD

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
