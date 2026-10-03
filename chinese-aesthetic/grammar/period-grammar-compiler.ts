/**
 * Period Aesthetic Grammar Compiler — Phase 3 Step 3.3
 *
 * 串联：Relationship Graph → Operation Selection → Operations → Aesthetic Intent IR
 *
 * 职责：
 * 1. 读取图拓扑 + 反模式报告 + 范式
 * 2. 反模式 REJECT 时熔断（不执行变换）
 * 3. 基于图特征 + 范式法典选择应激活的算子
 * 4. 按序执行算子链
 * 5. 构建 AestheticIntentExtension（含完整溯源）
 * 6. 返回变换后 IR + Intent + Trace
 *
 * 不变量：
 * - 不修改 Core Compiler / ABI 1.0.0
 * - 不反向写 Evidence / Graph / Gate（只读物证层）
 * - 不生成 ChineseScore
 * - 所有变换量由图拓扑代数推导
 */

import type { RawDesignIR } from "../../compiler-core/contracts";
import type { AestheticRelationshipGraph } from "../graph/types";
import type { AntiPatternReport } from "../anti-pattern/types";
import type { AestheticPeriod, DesignOperationId, OperationTrace } from "../operations/types";
import { DESIGN_OPERATIONS, applyAllOperations } from "../operations/design-operations";
import { AestheticIntentBuilder } from "../intent/aesthetic-intent-builder";
import type { AestheticIntentExtension, AppliedOperation } from "../intent/types";
import { principlesFor } from "./design-grammar";
import { isDecisionFailure } from "../../skill-bridge/decision-errors";

// 范式 → 母语法映射：由 skill 的 sheet 决定（chinese-aesthetic/grammar/design-grammar.ts），本文件不持有任何审美表。

// ---------------------------------------------------------------------------
// 算子选择器
// ---------------------------------------------------------------------------

export interface OperationSelection {
  opId: DesignOperationId;
  reason: string;
  selected: boolean;
}

/**
 * 基于图拓扑特征选择应激活的算子。
 * 选择逻辑：每个算子检查其触发条件，满足则选中。
 * 这不是"打分"，而是确定性的条件匹配。
 */
export function selectOperations(
  graph: AestheticRelationshipGraph,
  period: AestheticPeriod,
): OperationSelection[] {
  const selections: OperationSelection[] = [];

  for (const opId of Object.keys(DESIGN_OPERATIONS) as DesignOperationId[]) {
    const op = DESIGN_OPERATIONS[opId];
    // 用空 IR 试运行，检查 trace.applied 来判断是否会被激活
    // 这是安全的：算子是纯函数，不修改输入
    const dummyIR = {} as RawDesignIR;
    try {
      const result = op({ ir: dummyIR, graph, period });
      selections.push({
        opId,
        selected: result.trace.applied,
        reason: result.trace.rationale,
      });
    } catch (e) {
      // a missing aesthetic decision must never degrade into "operator not selected"
      if (isDecisionFailure(e)) throw e;
      selections.push({ opId, selected: false, reason: "Pre-check failed (insufficient IR fields)" });
    }
  }

  return selections;
}

// ---------------------------------------------------------------------------
// Compiler 输出
// ---------------------------------------------------------------------------

export interface GrammarCompileResult {
  /** 变换后的 IR（深拷贝，不修改输入） */
  ir: RawDesignIR;
  /** Aesthetic Intent 扩展对象 */
  intent: AestheticIntentExtension;
  /** 全部 16 个算子的执行 trace */
  traces: OperationTrace[];
  /** 算子选择结果 */
  selections: OperationSelection[];
  /** 实际应用的算子数量 */
  appliedCount: number;
  /** 反模式熔断标记 */
  antiPatternHalted: boolean;
  /** 熔断原因（如有） */
  haltReason?: string;
}

// ---------------------------------------------------------------------------
// Period Grammar Compiler
// ---------------------------------------------------------------------------

export class PeriodGrammarCompiler {
  private period: AestheticPeriod;

  constructor(period: AestheticPeriod) {
    this.period = period;
  }

  /**
   * 执行完整编译流水线：
   * Graph + Gate + IR → 选择算子 → 执行变换 → 构建 Intent → 返回
   */
  compile(
    ir: RawDesignIR,
    graph: AestheticRelationshipGraph,
    antiPatternReport: AntiPatternReport,
  ): GrammarCompileResult {
    // 1. 反模式熔断：REJECT 时不执行任何变换
    if (antiPatternReport.overallVerdict === "REJECT") {
      const haltReason = `Anti-Pattern Gate REJECT: ${antiPatternReport.rejectedGates.join(", ")}. Halting grammar compilation.`;
      const intent = this.buildHaltedIntent(graph, antiPatternReport, haltReason);
      return {
        ir: JSON.parse(JSON.stringify(ir)) as RawDesignIR,
        intent,
        traces: [],
        selections: [],
        appliedCount: 0,
        antiPatternHalted: true,
        haltReason,
      };
    }

    // 2. 算子选择（基于图拓扑）
    const selections = selectOperations(graph, this.period);

    // 3. 执行全部 16 个算子（未选中的会返回 applied=false）
    const { ir: transformedIR, traces } = applyAllOperations({
      ir,
      graph,
      period: this.period,
    });

    // 4. 构建 Aesthetic Intent
    const appliedOps: AppliedOperation[] = traces
      .filter((t) => t.applied)
      .map((t) => ({
        opId: t.opId,
        targetNodeId: t.targetNodeId,
        parameters: t.parameters,
        rationale: t.rationale,
        provenanceRef: t.provenanceRef,
      }));

    const activeRelationships = graph.relations.map((r) => ({
      relationType: r.relationType,
      sourceId: r.sourceId,
      targetId: r.targetId,
      magnitude: r.magnitude,
    }));

    const builder = new AestheticIntentBuilder({
      period: this.period,
      principles: principlesFor(this.period),
      evidenceHash: graph.evidenceId,
      graphHash: graph.graphHash,
      gateReportRef: antiPatternReport.reportHash,
      allAllowed: antiPatternReport.overallVerdict === "ALLOW",
      activeRelationships,
      appliedOperations: appliedOps,
    });

    const intent = builder.build();

    return {
      ir: transformedIR,
      intent,
      traces,
      selections,
      appliedCount: appliedOps.length,
      antiPatternHalted: false,
    };
  }

  /** 熔断时构建最小 Intent（标记为 halted） */
  private buildHaltedIntent(
    graph: AestheticRelationshipGraph,
    report: AntiPatternReport,
    reason: string,
  ): AestheticIntentExtension {
    const builder = new AestheticIntentBuilder({
      period: this.period,
      principles: principlesFor(this.period),
      evidenceHash: graph.evidenceId,
      graphHash: graph.graphHash,
      gateReportRef: report.reportHash,
      allAllowed: false,
      appliedOperations: [
        {
          opId: "HALT_ANTI_PATTERN_REJECT",
          parameters: { reason },
          rationale: reason,
          provenanceRef: `gate:${report.rejectedGates.join("+")}`,
        },
      ],
    });
    return builder.build();
  }
}
