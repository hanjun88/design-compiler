# 小艾不迟到(AIGC) 前端动效视频蒸馏编译总报告

> 生成时间: 2026-09-25 | 数据源: 11个单视频distill.json + 3个聚合JSON | 规范: DISTILLATION_SPEC v2.0


## 1. 概述

- **博主**: 小艾不迟到 (AIGC前端动效方向)
- **视频数**: 11 个
- **总关键帧数**: 234 帧
- **前端动效片段总数**: 77 段
- **平均置信度**: 0.777 (范围 0.72 – 0.82)
- **技术栈概览**: Three.js/WebGL系覆盖10/11视频；GSAP覆盖9/11；CSS3D 5/11；ScrollTrigger 5/11；Vanilla JS在3/11高置信(0.88+)。整体是 **WebGL+GSAP 主导、DOM/Scroll 辅助** 的编辑级作品集风格。


## 2. 每个视频核心参数摘要

| video_id | 标题 | 时长(s) | 分辨率 | 核心动效 | 技术栈(top2, 置信度) | 主背景色 | 交互方式 | 置信度 |
|---|---|---|---|---|---|---|---|---|
| 01 | 我做了一个关于绽放与变化的动效网页 | 18.434 | 1920x1080 | pink_peduncle_bud_to_bloom | HTML/CSS editorial layout(0.9); Three.js / WebGL(0.72) | #FFFFFF | scroll-or-autoplay-loop | 0.72 |
| 02 | 零基础也能做！3D图片球体动效教程 | 49.1 | 1024x576 | auto_rotate_y | Vite (dev server)(0.95); Fibonacci Sphere 分布算法(0.85) | #FFFFFF | drag | 0.78 |
| 03 | 零基础教学｜几句话教你做出环绕动效画廊 | 48.73 | 1280x720 | intro_card_converge_and_scale_in | HTML + CSS 3D transforms (transform-style: preserve-3d, perspective, rotateY/translateZ)(0.95); Vanilla JavaScript wheel event + requestAnimationFrame inertia loop(0.9) | #FFFFFF | mouse_wheel | 0.78 |
| 04 | 公式、引力与黑洞！ | 21.37 | 1024x576 | accretion_disk_keplerian_rotation | three.js (WebGL/WebGL2)(0.9); GLSL GPU Compute 粒子模拟 (GPUComputationRenderer)(0.85) | #000000 | autoplay-loop-no-user-input | 0.82 |
| 05 | 我用GPT-6 Astra做了一个3D拍立得相机 | 15.2 | 1280x720 | idle_camera_orbit_rotate | Three.js (WebGL)(0.95); GSAP(0.9) | #FFFFFF | click_shutter_button / drag_exploded_view_slider / tab_switch | 0.82 |
| 07 | 我Vibe Coding了一个丝滑的图片展览 | 18.067 | 1024x576 | intro_cards_scatter | CSS 3D Transforms (transform-style: preserve-3d, perspective:1200px)(0.92); GSAP / Framer Motion 时间轴补间(0.7) | #FFFFFF | click + drag | 0.82 |
| 08 | 我用 WebGL做了一个沉浸式动态画廊 | 18.7 | 1024x576 | intro-single-card-to-strip-assembly | three.js (WebGLRenderer + ShaderMaterial)(0.95); custom GLSL cylindrical displacement shader(0.9) | #FFFFFF | hover on strip images (with autoplay vertical scroll) | 0.72 |
| 09 | 用一卷胶片来打开我的交互作品 | 21.2 | 1280x720 | film_strip_horizontal_intro_fade_in | three.js (WebGL)(0.88); GSAP (TimelineLite/ScrollTrigger)(0.82) | #FFFFFF | scroll | 0.78 |
| 10 | 折腾了一天,终于把这个图片动效做出来了! | 18.37 | 1024x576 | tunnel_morph_in | Three.js (WebGL)(0.85); WebGL Textured Planes (MeshBasicMaterial)(0.8) | #F2F2F2 | scroll | 0.78 |
| 11 | 用自己的作品做了一个作品集网站 | 23.933 | 1280x720 | panel_parallax_scroll | GSAP (GreenSock)(0.85); ScrollTrigger (GSAP plugin)(0.8) | #E9E9EC | scroll | 0.75 |
| 12 | 用GSAP做了一个能旋转的3D卡片 | 15.3 | 1280x720 | fan-assembly-autoplay-rotateY | GSAP (GreenSock Animation Platform)(0.95); CSS 3D Transforms (preserve-3d + perspective)(0.92) | #FFFFFF | hover | 0.78 |

## 3. 技术栈推断汇总

### 三大技术路线分布

| 路线 | 覆盖视频 | 代表视频 | 特征 |
|---|---|---|---|
| **Three.js/WebGL系** | 10/11 (avg conf 0.705) | 05(0.95), 04, 08 | 实时3D几何体、PBR材质、相机轨道、粒子系统；04黑洞用Canvas+GLSL自定义shader |
| **GSAP/CSS3D系** | GSAP 9/11 (0.758); CSS3D 5/11 (0.778) | 12(GSAP 0.95), 03(CSS3D 0.95) | 时间线编排、stagger、scroll-scrub；DOM/CSS变换做卡片3D翻转与画廊 |
| **纯DOM/Scroll系** | Vanilla JS 3/11 (0.883) | 08(0.95), 03(0.9), 12(0.95) | 无重型3D库；用rAF/CSS transform做UI层动效，性能轻 |

**次要栈**: Vite 7/11, React 8/11, ScrollTrigger 5/11, GLSL shader 4/11, pmndrs/postprocessing 3/11, Lenis 2/11。


## 4. 动效参数黄金法则 (从77段motion提炼)

| 参数 | 推荐值 | 观察依据 |
|---|---|---|
| 全局duration中位数 | 900.0ms (mean 2649.0ms) | 76段样本 |
| autoplay段duration中位数 | 1200.0ms (range 0-21367) | 46段 |
| click段duration中位数 | 600ms | 9段 |
| hover段duration中位数 | 400ms | 7段 |
| scroll段duration中位数 | 950.0ms | 8段 |
| stagger中位数 | 60ms (range 20-200ms) | 27段使用stagger, 9个视频 |
| 首选easing | power2 (23次) > linear (13) > power3 (11) > expo (10) | 77段统计 |
| 入场easing | power3.out / expo.out (绽放/展开类) | dominant_patterns |
| 颜色morph easing | sine.inOut (01粉->蓝 1100ms) | 仅3段但高度一致 |
| 循环/进度条easing | linear (13段) | 恒速驱动 |
| hover进入/退出时长比 | enter ~430ms / exit ~700ms (exit慢1.5x) | inter_agg state_transition |
| scale入场范围 | 0.05/0.1 -> 1.0; hover 1.0->1.2; lightbox 1.0->4.0 | feedback_forms.visual_scale |
| rotateY hover tilt | 0->20deg; rotateX 0->12deg; translateZ +30px | 12号卡片 |

## 5. 色彩体系结论

- **基底哲学**: 11/11 视频共享 `#FFFFFF` paper-white 基底；8/11 纯 `#FFFFFF` 背景，2/11 浅灰 `#F2F2F2`/`#E9E9EC`。这是一种 **编辑级、画廊式、留白充足** 的白底美学。
- **点缀色策略**: 点缀色面积 <15%，集中在主体本身（花瓣、书脊、图片、材质高光），不大面积铺陈。典型accent为低饱和pastel（01粉#F4C2D0/蓝#9DBBE8）或小面积高饱和（11书脊#C81D4B/#EDE12A/#1F6E6E）。
- **文字色**: 主文字 `#1A1A1A` (7/11)，次要 `#888888`，高对比白底黑字。
- **色温**: 10/11 为 6500K 中性日光白；仅 04 为 4200K 暖金（配合黑洞主题）。
- **唯一暗色例外**: **视频04《公式、引力与黑洞》** 是唯一黑底 `#000000` 视频，配合 `#FFE8B0/#D4A855/#FFD9A0` 金色辉光（bloom_strength 1.8）。这是主题驱动的例外，不应作为默认。
- **渐变**: 0个页面级渐变；渐变仅用于粒子尾迹(04吸积盘)和接触阴影(02海报球体)。


## 6. 交互模式总结

- **触发方式分布**: autoplay 11/11 (基底) > drag 6/11 > scroll 5/11 > hover 5/11 > click 4/11 > mouse_move 3/11。
- **反馈形式**: 视觉scale(9视频) > 位移displacement(7) > 颜色变化(5) > 3D tilt(4) > 进度指示(3) > 光标变化(3)。**音频反馈 0/11**。
- **惯性参数**: drag damping 0.95/frame (02球体), wheel inertia 0.94 (03环), strip lerp 0.1 (07); velocity<0.001触发idle恢复, settle 500ms。
- **可访问性现状**: **严重缺失**。11个视频中仅 05 号（3D拍立得相机）同时具备键盘导航、prefers-reduced-motion降级、ARIA标签、焦点管理。其余10/11缺少reduced-motion fallback，8/11纯鼠标无键盘。新模块必须补足这些基线。


## 7. 可复用模式库

### Top 5 动效模式 (来自motion-tech-stack dominant_patterns)

| # | 模式 | 出现段数 | 视频源 | 参数模板 | 推荐库 |
|---|---|---|---|---|---|
| 1 | scale+opacity 缩放入场弹窗 | 21 | 01,02,03,05,07,08,10,11 | dur [0, 3500]ms (median 1000.0); easing: expo(8), power2(5), power3(4); stagger 60ms | GSAP 3, Framer Motion |
| 2 | 文字 fade-in-up / 淡入上滑 | 17 | 01,05,07,08,09,11 | dur [0, 8000]ms (median 900); easing: power2(8), expo(5), power1(2); stagger 65.0ms | GSAP 3, Framer Motion, CSS transition |
| 3 | linear 进度条 / 循环填充 | 13 | 01,02,03,04,05,07,08,09,10 | dur [0, 21367]ms (median 6550.0); easing: linear(13); stagger 40ms | GSAP 3 linear, ScrollTrigger scrub |
| 4 | stagger 3D 展开/绽放 (rotate+scale+translateZ) | 7 | 01,03,07,11 | dur [700, 1600]ms (median 1400); easing: power3(3), expo(2), power2(1); stagger 60ms | GSAP 3 timeline, Three.js + GSAP |
| 5 | color / 材质渐变 morph | 7 | 01,05,09 | dur [150, 4500]ms (median 1100); easing: power2(4), sine(1), linear(1); stagger 40.0ms | GSAP 3 tween on material.uniform, CSS transition |

### 3 个交互模板 (来自interaction-patterns reusable_templates)

| # | 模板名 | 触发 | 核心参数 | 推荐库 | 源视频 |
|---|---|---|---|---|---|
| 1 | Inertial Orbit Drag with Idle Auto-Rotate | drag (pointerdown + pointermove) + autoplay idle timer + click | rotateY_sensitivity_deg_per_px=0.25; rotateX_sensitivity_deg_per_px=0.12; rotateX_clamp_deg=[-30, 30]; inertia_damping_per_frame=0.95 | Three.js (orbit controls custom) + GSAP 3 for shuffle tween; use damped lerp in requestAnimationFrame loop | 02,03 |
| 2 | Scroll-Scrubbed Section Timeline with Parallax Panels | scroll (wheel / trackpad / scrollbar) | scroll_to_timeline_map=linear scrollY -> GSAP scrub timeline progress; parallax_panel_factors={'center': 1.0, 'top_preview': 0.5, 'bottom_secondary': -0.25}; section_transition_duration_ms=1000-1500; section_stagger_ms=50-100 | GSAP 3 + ScrollTrigger (scrub:true, pin:true) + ScrollSmoother for inertia; parallax via data-speed attributes | 09,10,11,03 |
| 3 | Hover Tilt + Expand Card with Mouse-Follow Parallax | hover (mouseenter) + mouse_move | idle_scale=1.0; hover_scale_thumbnail=1.2; hover_scale_lightbox=4.0-4.2; tilt_rotateX_deg_max=12 | GSAP 3 (quickTo for mousemove smoothing) + Three.js/react-three-fiber for 3D tilt; or CSS transform-style: preserve-3d for 2D cards | 12,08,07,05 |

## 8. 中式美学六法评分汇总

| video_id | 标题 | 气韵生动 | 骨法用笔 | 应物象形 | 随类赋彩 | 经营位置 | 传移模写 |
|---|---|---|---|---|---|---|---|
| 01 | 我做了一个关于绽放与变化的动效网页 | 8 | 6 | 9 | 8 | 9 | 6 |
| 02 | 零基础也能做！3D图片球体动效教程 | 6 | 5 | 7 | 4 | 6 | 2 |
| 03 | 零基础教学｜几句话教你做出环绕动效画廊 | 3 | 5 | 6 | 4 | 6 | 1 |
| 04 | 公式、引力与黑洞！ | 8 | 7 | 9 | 7 | 8 | 3 |
| 05 | 我用GPT-6 Astra做了一个3D拍立得相机 | 6 | 8 | 9 | 7 | 8 | 3 |
| 07 | 我Vibe Coding了一个丝滑的图片展览 | 6 | 7 | 8 | 7 | 7 | 2 |
| 08 | 我用 WebGL做了一个沉浸式动态画廊 | 6 | 5 | 7 | 6 | 6 | 2 |
| 09 | 用一卷胶片来打开我的交互作品 | 6 | 7 | 8 | 6 | 7 | 3 |
| 10 | 折腾了一天,终于把这个图片动效做出来了! | 6 | 7 | 8 | 4 | 7 | 3 |
| 11 | 用自己的作品做了一个作品集网站 | 6 | 7 | 7 | 6 | 8 | 3 |
| 12 | 用GSAP做了一个能旋转的3D卡片 | 6 | 7 | 8 | 4 | 6 | 2 |
| **均值** | — | 6.09 | 6.45 | 7.82 | 5.73 | 7.09 | 2.73 |

## 9. 数据质量说明

- **置信度范围**: 0.72 – 0.82，均值 0.777。
- **低置信视频(<0.6)**: 无。
- **估计项标注**: 各 distill.json 中 `estimated: true` 的参数为视觉推断而非截图直证；典型如 Blender baked (01, conf 0.25)、postprocessing/pmndrs (avg 0.417) 等。
- **局限性**:
  1. 仅基于关键帧抽样（每视频9-20帧），非逐帧分析；中间过程参数为插值推断。
  2. 技术栈为基于视觉特征的推断，非源码审查；Three.js vs Canvas vs 自制WebGL的边界有重叠。
  3. 音频/无障碍细节来自视频录制可见证据，未做真实页面测试。
  4. 粒子系统参数在部分视频为enabled但数量级估算（04黑洞粒子为唯一详细粒子案例）。
  5. 视频编号跳过06（素材未提供），不影响统计。

---
*本报告由 design-compiler 自动生成；所有数值均来自输入JSON，未编造。*
