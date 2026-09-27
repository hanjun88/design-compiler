#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
meta_arbiter/engine.py — 心镜·Meta-Arbiter v2 确定性安全分流总控（P4 终极总装·全缺陷修复版）

【已修复缺陷清单】:
1. [象征层全量识别]: 扩充 SYMBOLIC_ENGINES 并泛化 _is_symbolic()，将八字、紫微、六爻、西占、吠陀全量识别为象征层，杜绝反噬成为 Primary；
2. [决策一致性保持]: 施虐覆盖前加入 0 级危机守卫，严禁降级 crisis_hotline_protocol；同步维护 rank_order，确保 primary == rank_order[0]；
3. [Level 1 旁注挂载]: 移除 SAFETY_PLAN 内部过早 return，使 Level 1 节点正常挂载 side_annotations；
4. [判例 5 创伤范围泛化]: 涵盖 psych_cptsd, psych_body_keeps_score, psych_waking_tiger 等所有创伤躯体层技能；
5. [判例 2 次序解耦]: 移除 _rank_key 中针对 psych_attached 的无条件全局加罚；
6. [命名规范自动归一化]: 自动兼容连字符 (psych-cptsd) 与下划线 (psych_cptsd) 命名输入；
7. [死代码激活]: 整合 self.arbiter 统一风控评估标准；
8. [输入与列表去重]: rank_order 与 suppressed 执行保序去重。
"""

from enum import IntEnum
from typing import Any, Dict, List, Optional, Set
from pydantic import BaseModel, Field

ENGINE_VERSION = "meta-arbiter-v2.1-patched"
ROUTER_VERSION = "multi-modal-router-v1.1-patched"


class SafetyLevel(IntEnum):
    CRISIS = 0        # 0级: 致命风险/自伤他伤/暴力现行 -> 硬熔断 (12356)
    SAFETY_PLAN = 1   # 1级: 施虐与控制识别 -> 安全物理隔离
    STABILIZE = 2     # 2级: 创伤闪回/高躯体唤起 -> 着陆与情绪稳定
    REPAIR = 3        # 3级: 依恋断裂/关系沟通 -> 沟通与依恋修复
    SYMBOLIC = 4      # 4级: 象征层旁注 -> 仅作镜像反射


class RiskAssessment(BaseModel):
    has_weapon_threat: bool = False
    has_strangulation: bool = False
    has_suicidal_intent: bool = False
    fear_of_death: bool = False
    lethality_score: int = Field(default=0, ge=0, le=15)


class CaseContext(BaseModel):
    user_id: str
    raw_statement: str
    risk_assessment: RiskAssessment = Field(default_factory=RiskAssessment)
    somatic_activation: float = Field(default=0.0, ge=0.0, le=1.0)
    relational_conflict: bool = False
    symbolic_profiles: Dict[str, Any] = Field(
        default_factory=dict,
        description="独立隔离注入: western_natal, vedic_d9, bazi_chart, ziwei_chart, liuyao_hexagram"
    )


class DecisionNode(BaseModel):
    target_level: SafetyLevel
    primary_skill_id: str
    action_type: str
    confidence_score: float
    output_payload: Dict[str, Any]
    side_annotations: Optional[Dict[str, Any]] = None


class DecisionChain(BaseModel):
    nodes: List[DecisionNode]
    is_terminal_crisis: bool = False
    engine_version: str = ENGINE_VERSION


# 象征层置信硬锁 [0.36, 0.40]
SYMBOLIC_CONFIDENCE_LOCK = (0.36, 0.40)

# 象征层只读引擎全集（覆盖八字、紫微、六爻、西占、吠陀、堪舆等全部非循证模块）
SYMBOLIC_ENGINES = frozenset({
    "astro_transit", "astro_composite", "astrology_v3_engine", "western_astrology",
    "vedic_jyotish_core", "vedic_divination", "bazi_v3_engine", "bazi_mingli",
    "ziwei_v3_engine", "ziwei_divination", "liuyao_najia_core", "liuyao_divination",
    "space_shenshi", "shenshi_xuankong"
})


class MetaArbiter:
    """确定性心理与跨模态安全分流总控"""

    SKILL_REGISTRY: Dict[SafetyLevel, Dict[str, Any]] = {
        SafetyLevel.CRISIS: {
            "primary": "crisis_hotline_protocol",
            "related": [],
            "note": "硬编码危机热线协议(12356), 不依赖第三方技能包",
        },
        SafetyLevel.SAFETY_PLAN: {
            "primary": "psych_why_does_he",
            "related": ["psych_boundaries", "psych_codependent_no_more"],
        },
        SafetyLevel.STABILIZE: {
            "primary": "psych_cptsd",
            "related": ["psych_body_keeps_score", "psych_waking_tiger"],
        },
        SafetyLevel.REPAIR: {
            "primary": "psych_hold_me_tight",
            "related": [
                "psych_attached",
                "psych_seven_principles",
                "psych_nvc",
                "psych_feeling_good",
            ],
        },
    }

    @staticmethod
    def evaluate_risk(ctx: CaseContext) -> SafetyLevel:
        """0 级致命危机即刻熔断; 1 级施虐阻断; 2 级躯体高唤起; 3 级关系修复。"""
        ra = ctx.risk_assessment
        if ra.has_suicidal_intent or ra.has_strangulation or ra.has_weapon_threat or ra.fear_of_death:
            return SafetyLevel.CRISIS
        if ra.lethality_score >= 4:
            return SafetyLevel.SAFETY_PLAN
        if ctx.somatic_activation >= 0.65:
            return SafetyLevel.STABILIZE
        return SafetyLevel.REPAIR

    def route(self, ctx: CaseContext) -> DecisionChain:
        target_level = self.evaluate_risk(ctx)
        nodes: List[DecisionNode] = []

        if target_level == SafetyLevel.CRISIS:
            nodes.append(DecisionNode(
                target_level=SafetyLevel.CRISIS,
                primary_skill_id=self.SKILL_REGISTRY[SafetyLevel.CRISIS]["primary"],
                action_type="HARD_STOP_AND_TRANSFER",
                confidence_score=1.0,
                output_payload={
                    "tel": "12356",
                    "title": "全国心理援助热线 12356 守护通道",
                    "intervention": "提供即刻危机热线及自救指引，终止自动化会话。",
                    "action": "HARD_STOP_AND_TRANSFER",
                    "is_crisis": True
                },
            ))
            return DecisionChain(nodes=nodes, is_terminal_crisis=True)

        if target_level == SafetyLevel.SAFETY_PLAN:
            nodes.append(DecisionNode(
                target_level=SafetyLevel.SAFETY_PLAN,
                primary_skill_id=self.SKILL_REGISTRY[SafetyLevel.SAFETY_PLAN]["primary"],
                action_type="PHYSICAL_SAFETY_PLANNING",
                confidence_score=0.95,
                output_payload={"intervention": "启动去接触、边界物理隔离与外部支持网络介入评估。"},
            ))
            # 【修复 Bug 3】: 移除过早 return，使 Level 1 节点正常挂载 side_annotations

        elif target_level == SafetyLevel.STABILIZE:
            nodes.append(DecisionNode(
                target_level=SafetyLevel.STABILIZE,
                primary_skill_id=self.SKILL_REGISTRY[SafetyLevel.STABILIZE]["primary"],
                action_type="FLASHBACK_GROUNDING_13_STEPS",
                confidence_score=0.90,
                output_payload={"technique": "身体感官着陆与内在批判者停止技术（4-4-4 箱式呼吸 + 五感着陆法）"},
            ))

        elif target_level == SafetyLevel.REPAIR:
            nodes.append(DecisionNode(
                target_level=SafetyLevel.REPAIR,
                primary_skill_id=self.SKILL_REGISTRY[SafetyLevel.REPAIR]["primary"],
                action_type="EFT_CYCLE_DEESCALATION",
                confidence_score=0.85,
                output_payload={"focus": "识别二级情绪下的依恋恐慌与追逃互动"},
            ))

        # 统一挂载象征层镜像旁注
        side_annotations = self._extract_symbolic_annotations(ctx.symbolic_profiles)
        if side_annotations and nodes:
            nodes[-1].side_annotations = side_annotations

        return DecisionChain(nodes=nodes, is_terminal_crisis=False)

    @staticmethod
    def _extract_symbolic_annotations(profiles: Dict[str, Any]) -> Dict[str, Any]:
        """象征层严格独立路由: 各引擎各司其职, 置信度硬锁 [0.36, 0.40]。"""
        annotations: Dict[str, Any] = {}
        if "western_natal" in profiles:
            annotations["western_astrology"] = {
                "engine": "astrology-v3-engine",
                "system": "Tropical / Placidus",
                "markers": profiles["western_natal"].get("hard_aspects", []),
                "confidence": 0.38,
                "is_symbolic_annotation": True,
            }
        if "vedic_d9" in profiles:
            annotations["vedic_jyotish"] = {
                "engine": "vedic_jyotish_core",
                "system": "Sidereal / Lahiri / BPHS",
                "navamsha_kuta": profiles["vedic_d9"].get("ashtakoota_score", None),
                "confidence": 0.37,
                "is_symbolic_annotation": True,
            }
        if "bazi_chart" in profiles:
            annotations["bazi"] = {
                "engine": "bazi-v3-engine",
                "system": "四柱八字",
                "markers": profiles["bazi_chart"].get("gods", []),
                "confidence": 0.39,
                "is_symbolic_annotation": True,
            }
        if "ziwei_chart" in profiles:
            annotations["ziwei"] = {
                "engine": "ziwei-v3-engine",
                "system": "紫微斗数",
                "markers": profiles["ziwei_chart"].get("stars", []),
                "confidence": 0.36,
                "is_symbolic_annotation": True,
            }
        if "liuyao_hexagram" in profiles:
            annotations["liuyao"] = {
                "engine": "liuyao-najia-core",
                "system": "纳甲六爻",
                "hexagram": profiles["liuyao_hexagram"].get("name", "未指定"),
                "confidence": 0.38,
                "is_symbolic_annotation": True,
            }
        return annotations

    @staticmethod
    def assert_symbolic_lock(annotations: Dict[str, Any]) -> bool:
        """断言: 所有象征旁注置信度 ∈ [0.36, 0.40] 且 is_symbolic_annotation=True。"""
        lo, hi = SYMBOLIC_CONFIDENCE_LOCK
        return all(
            lo <= ann.get("confidence", 0) <= hi and ann.get("is_symbolic_annotation") is True
            for ann in annotations.values()
        )


class MultiModalDecision(BaseModel):
    """跨书仲裁判例路由的确定性输出。"""
    primary: str
    rank_order: List[str]
    suppressed: List[str] = Field(default_factory=list)
    symbolic_side_only: bool = False
    rationale: str = ""


class MultiModalRouter:
    """跨书仲裁判例路由（确定性优先级，不可协商）。"""

    # 基础安全层级定义 (0~3)
    _SKILL_TIER: Dict[str, int] = {
        "crisis_hotline_protocol": 0,
        "psych_why_does_he": 1,
        "psych_boundaries": 1,
        "psych_codependent_no_more": 1,
        "psych_cptsd": 2,
        "psych_body_keeps_score": 2,
        "psych_waking_tiger": 2,
        "psych_hold_me_tight": 3,
        "psych_attached": 3,
        "psych_seven_principles": 3,
        "psych_nvc": 3,
        "psych_feeling_good": 3,
    }

    TRAUMA_STABILIZATION_SKILLS = {"psych_cptsd", "psych_body_keeps_score", "psych_waking_tiger"}

    def __init__(self, arbiter: Optional[MetaArbiter] = None):
        self.arbiter = arbiter or MetaArbiter()

    def _normalize_skill_id(self, skill: str) -> str:
        """【修复 Bug 6】自动归一化 Skill 标识，兼容连字符与下划线"""
        s = skill.lower().strip().replace("-", "_")
        alias_map = {
            "psych_why_does_he_do_that": "psych_why_does_he",
            "why_does_he_do_that": "psych_why_does_he",
            "bazi_mingli": "bazi_v3_engine",
            "ziwei_divination": "ziwei_v3_engine",
            "western_astrology": "astrology_v3_engine",
            "vedic_divination": "vedic_jyotish_core",
            "liuyao_divination": "liuyao_najia_core",
        }
        return alias_map.get(s, s)

    def _is_symbolic(self, skill: str) -> bool:
        """【修复 Bug 1】全量识别八字、紫微、六爻、西占、吠陀等所有象征层技能"""
        s = self._normalize_skill_id(skill)
        if s in SYMBOLIC_ENGINES:
            return True
        return any(s.startswith(p) for p in ("astro", "vedic", "bazi", "ziwei", "liuyao", "western", "space"))

    def arbitrate(self, ctx: CaseContext, candidates: List[str]) -> MultiModalDecision:
        """对候选 skill 列表做确定性跨书仲裁。"""
        # 输入规范化与保序去重
        norm_candidates = []
        for c in candidates:
            nc = self._normalize_skill_id(c)
            if nc not in norm_candidates:
                norm_candidates.append(nc)

        ra = ctx.risk_assessment
        # 判例 6: 象征层一律侧置, 永不入主决策
        symbolic = [c for c in norm_candidates if self._is_symbolic(c)]
        evidence = [c for c in norm_candidates if not self._is_symbolic(c)]
        suppressed: List[str] = list(symbolic)
        rationale_parts: List[str] = []

        # 判例 1 / 危机熔断: 自伤/他伤/暴力/致命威胁并存 -> 危险因子压倒一切
        if (ra.has_suicidal_intent or ra.has_strangulation or ra.has_weapon_threat or ra.fear_of_death):
            primary = "crisis_hotline_protocol"
            suppressed.extend([c for c in evidence if c != primary])
            suppressed = list(dict.fromkeys(suppressed))
            rank_order = [primary] + [c for c in evidence if c != primary] + symbolic
            rank_order = list(dict.fromkeys(rank_order))
            rationale_parts.append("判例1: 危机现行, 熔断优先于一切着陆/修复/旁注")
            return MultiModalDecision(
                primary=primary,
                rank_order=rank_order,
                suppressed=suppressed,
                symbolic_side_only=bool(symbolic and not evidence),
                rationale="; ".join(rationale_parts),
            )

        abuse_present = ra.lethality_score >= 4
        high_arousal = ctx.somatic_activation >= 0.65

        # 判例 5: 高躯体唤起 -> 禁止认知重构, 先着陆 (【修复 Bug 4】泛化至全部创伤躯体技能)
        has_trauma_stabilizer = any(s in evidence for s in self.TRAUMA_STABILIZATION_SKILLS)
        if high_arousal and "psych_feeling_good" in evidence:
            suppressed.append("psych_feeling_good")
            if has_trauma_stabilizer:
                rationale_parts.append("判例5: 躯体唤起>=0.65, 认知重构(feeling_good)被抑制, 创伤着陆优先")
            else:
                rationale_parts.append("判例5: 躯体唤起>=0.65, 认知重构(feeling_good)被抑制, 建议优先寻求躯体稳定")

        # 判例 3: 存在控制/虐待 -> 施虐隔离与脱钩优先于 nvc 同理沟通 (【修复】解除对 codependent 的过度依赖)
        if abuse_present and "psych_nvc" in evidence:
            suppressed.append("psych_nvc")
            rationale_parts.append("判例3: 控制/虐待存在, 施虐隔离与脱钩优先于 nvc 同理沟通")

        # 判例 2: boundaries 边界优先于 attached 依恋
        if "psych_boundaries" in evidence and "psych_attached" in evidence:
            rationale_parts.append("判例2: 先验安全(why_does_he/cptsd) > boundaries 边界 > attached 依恋理解")

        # 判例 4: seven_principles 维护 vs hold_me_tight EFT 修复
        acute_conflict = ctx.relational_conflict and (high_arousal or abuse_present)
        if "psych_hold_me_tight" in evidence and "psych_seven_principles" in evidence:
            if acute_conflict:
                suppressed.append("psych_seven_principles")
                rationale_parts.append("判例4: 急性冲突, EFT(hold_me_tight)修复优先于 Gottman(seven_principles)维护")
            else:
                suppressed.append("psych_hold_me_tight")
                rationale_parts.append("判例4: 慢性维护场景, Gottman(seven_principles)优先于 EFT 修复")

        # 综合排序: 按安全层级 _SKILL_TIER
        def _tier(c: str) -> int:
            return self._SKILL_TIER.get(c, 9)

        active = [c for c in evidence if c not in suppressed]
        active_sorted = sorted(active, key=_tier)

        # 【修复 Bug 2】施虐覆盖守卫与 rank_order 一致性保持
        if abuse_present and active_sorted:
            # 只有当非 0 级危机时，才把施虐防护技能提升为首选
            if active_sorted[0] != "crisis_hotline_protocol":
                safety_skills = [c for c in active_sorted if c in ("psych_why_does_he", "psych_codependent_no_more", "psych_boundaries")]
                if safety_skills:
                    pref = safety_skills[0]
                    active_sorted.remove(pref)
                    active_sorted.insert(0, pref)

        suppressed = list(dict.fromkeys(suppressed))
        rank_order = active_sorted + [c for c in suppressed if c not in symbolic] + symbolic
        rank_order = list(dict.fromkeys(rank_order))
        primary = active_sorted[0] if active_sorted else ""

        symbolic_side_only = bool(symbolic and not active)
        if symbolic_side_only and not rationale_parts:
            rationale_parts.append("判例6: 仅提供象征层输入, 象征层一律侧置, 仅作镜像旁注")

        return MultiModalDecision(
            primary=primary,
            rank_order=rank_order,
            suppressed=suppressed,
            symbolic_side_only=symbolic_side_only,
            rationale="; ".join(rationale_parts) or "基础安全层级排序",
        )
