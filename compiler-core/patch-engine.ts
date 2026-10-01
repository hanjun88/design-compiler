/**
 * Patch Engine — RFC 6902 AST-to-AST 语义转译器
 *
 * 将 RawDesignIR（经 G1 净化）经由审美语法规则包（grammar-rules.json）
 * 转换为 ValidatedDesignIR。
 *
 * 流水线：
 *   Rule Evaluator → Mutation Planner → Deterministic Sorter → RFC 6902 Applier → Audit & Scoring
 *
 * 核心约束：
 * - 100% 纯函数幂等性，严禁外部副作用
 * - 补丁按 audit.ruleId 字典序（ASCII 升序）排序（PATCH DETERMINISM）
 * - 被 replace/add 变更的度量参数标记为 grammar-derived
 * - ValidatedDesignIR 严禁注入自身 hash（Hash Flow Contract）
 * - sourceRef.rawIRHash 严格透传
 */

import type {
  RawDesignIR,
  ValidatedDesignIR,
  ValidatedSceneGraph,
  RFC6902Op,
  AuditMetadata,
  RuleCoverageReport,
} from "./contracts";
import { JsonPointerResolver } from "./json-pointer";
import { ScoringEngine, type RuleEvaluationInput, type ComplianceScoringWeights } from "./scoring";
import { CompilerError, CompilerErrorCode } from "./error-codes";
import { deepEqual } from "./deep-equal";

// ============================================================================
// Grammar Rule Pack 类型
// ============================================================================

export interface GrammarRuleCondition {
  operator: "<" | ">" | "<=" | ">=" | "==" | "!=" | "between" | "not_between";
  value: number | string | boolean | [number, number];
}

export interface GrammarRuleMutation {
  op: "replace" | "add" | "remove";
  value?: unknown;
}

export interface GrammarRulePatch {
  op: "replace" | "add" | "remove";
  path: string;
  value?: unknown;
}

export interface GrammarRule {
  ruleId: string;
  principle: string;
  category: "composition" | "lighting" | "color" | "materials";
  targetPath: string;
  condition: GrammarRuleCondition;
  mutation: GrammarRuleMutation;
  /** 可选：多补丁模式。若存在且非空，优先于单 mutation 字段 */
  patches?: GrammarRulePatch[];
  /** 可选：英文描述，用于审计与文档 */
  description?: string;
  severity: "P0_CRITICAL" | "P1_WARNING" | "P2_INFO";
  reason: string;
}

export interface GrammarRulePack {
  packName: string;
  version: string;
  description: string;
  rules: GrammarRule[];
}

// ============================================================================
// 内部类型
// ============================================================================

interface RuleEvaluationResult {
  rule: GrammarRule;
  triggered: boolean;
  originalValue?: unknown;
  targetFound: boolean;
}

interface ApplyStats {
  mutationsApplied: number;
  testsPassed: number;
  testsFailed: number;
  violations: Array<{
    ruleId: string;
    severity: "P0_CRITICAL" | "P1_WARNING" | "P2_INFO";
    actionTaken: "MUTATED" | "TESTED" | "REJECTED_ERROR";
    message: string;
  }>;
  ruleInputs: RuleEvaluationInput[];
}

// 默认合规分权重（与 ScoringEngine 分类一致）
const DEFAULT_WEIGHTS: ComplianceScoringWeights = {
  composition: 0.35,
  lighting: 0.25,
  color: 0.20,
  materials: 0.20,
};

// ============================================================================
// PatchEngine 核心类
// ============================================================================

export class PatchEngine {
  constructor(private readonly grammar: GrammarRulePack) {}

  /**
   * 执行语法评估、补丁应用与 AST 编译
   * 纯函数幂等，不修改输入 rawIR
   */
  public compile(rawIR: RawDesignIR): ValidatedDesignIR {
    // 1. 评估规则，收集候选变更
    const evaluations = this.evaluateRules(rawIR);

    // 2. 构建补丁
    const patches = this.buildPatches(evaluations);

    // 3. 确定性排序（PATCH DETERMINISM）
    const sortedPatches = this.sortPatches(patches);

    // 4. 从 rawIR 构建 ValidatedSceneGraph 副本（P0 物理同构，结构一致）
    const sceneGraph = this.buildSceneGraph(rawIR);

    // 5. 应用 RFC 6902 补丁
    const stats = this.applyPatches(sceneGraph, sortedPatches);

    // 6. 计算合规分
    const complianceScore = ScoringEngine.computeComplianceScore(
      stats.ruleInputs,
      DEFAULT_WEIGHTS,
    );

    // 7. 组装 ruleCoverage 审计报告（SILENT_NOOP 可观测性，不改执行语义）
    const ruleCoverage = this.buildRuleCoverage(evaluations);

    // 8. 组装 ValidatedDesignIR
    return {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      meta: {
        grammarPack: this.grammar.packName,
        grammarVersion: this.grammar.version,
        compiledAt: new Date().toISOString(),
      },
      sourceRef: {
        rawIRHash: rawIR.provenance.rawIRHash,
        rawSchemaVersion: "1.0.0",
      },
      patches: sortedPatches,
      validated: sceneGraph,
      auditReport: {
        rulesEvaluated: this.grammar.rules.length,
        patchesEvaluated: sortedPatches.length,
        mutationsApplied: stats.mutationsApplied,
        testsPassed: stats.testsPassed,
        testsFailed: stats.testsFailed,
        complianceScore,
        violations: stats.violations,
        ruleCoverage,
      },
    };
  }

  // ==========================================================================
  // 内部方法
  // ==========================================================================

  /**
   * 阶段 1：Rule Evaluator
   * 遍历语法规则，对每条规则的 targetPath 取值并检查 condition
   */
  private evaluateRules(rawIR: RawDesignIR): RuleEvaluationResult[] {
    return this.grammar.rules.map((rule) => {
      const resolved = JsonPointerResolver.resolve(rawIR, rule.targetPath);

      if (!resolved.found) {
        return { rule, triggered: false, targetFound: false };
      }

      const currentValue = resolved.value;
      const triggered = this.checkCondition(currentValue, rule.condition);

      return {
        rule,
        triggered,
        originalValue: currentValue,
        targetFound: true,
      };
    });
  }

  /**
   * 阶段 1.5：Rule Coverage Auditor
   *
   * 汇总 evaluateRules 的结果，生成编译时规则-target 覆盖率报告。
   * 不改变 SILENT_NOOP 语义（target 不存在的规则仍静默跳过），仅增加可观测性。
   *
   * - perRule 按 ruleId ASCII 升序排序（确定性，进入 validatedIR 后影响 hash）
   * - missingTargets 去重后按 ASCII 升序排序
   */
  private buildRuleCoverage(evaluations: RuleEvaluationResult[]): RuleCoverageReport {
    const perRule = evaluations
      .map((e) => ({
        ruleId: e.rule.ruleId,
        targetPath: e.rule.targetPath,
        targetFound: e.targetFound,
        triggered: e.triggered,
      }))
      .sort((a, b) => a.ruleId.localeCompare(b.ruleId));

    let targetFound = 0;
    let triggerable = 0;
    const missingSet = new Set<string>();
    for (const entry of perRule) {
      if (entry.targetFound) {
        targetFound++;
        if (entry.triggered) triggerable++;
      } else {
        missingSet.add(entry.targetPath);
      }
    }

    const missingTargets = [...missingSet].sort((a, b) => a.localeCompare(b));

    return {
      total: perRule.length,
      targetFound,
      targetMissing: perRule.length - targetFound,
      triggerable,
      missingTargets,
      perRule,
    };
  }

  /**
   * 检查规则条件是否满足
   */
  private checkCondition(value: unknown, condition: GrammarRuleCondition): boolean {
    if (typeof value !== "number" && typeof condition.value === "number") {
      return false;
    }

    const v = value as number;

    // between / not_between：value 必须为 [min, max] 元组
    if (condition.operator === "between" || condition.operator === "not_between") {
      if (!Array.isArray(condition.value) || condition.value.length !== 2) {
        return false;
      }
      const [min, max] = condition.value as [number, number];
      const inRange = v >= min && v <= max;
      return condition.operator === "between" ? inRange : !inRange;
    }

    const threshold = condition.value as number;

    switch (condition.operator) {
      case "<":
        return v < threshold;
      case ">":
        return v > threshold;
      case "<=":
        return v <= threshold;
      case ">=":
        return v >= threshold;
      case "==":
        return deepEqual(v, threshold);
      case "!=":
        return !deepEqual(v, threshold);
      default:
        return false;
    }
  }

  /**
   * 阶段 2：Mutation Planner
   * 从触发的规则评估结果构建 RFC 6902 补丁
   */
  private buildPatches(evaluations: RuleEvaluationResult[]): RFC6902Op[] {
    const patches: RFC6902Op[] = [];

    for (const evalResult of evaluations) {
      if (!evalResult.triggered || !evalResult.targetFound) continue;

      const { rule, originalValue } = evalResult;
      const audit: AuditMetadata = {
        ruleId: rule.ruleId,
        principle: rule.principle,
        reason: rule.reason,
        fromValue: originalValue,
      };

      // 多补丁模式：若 rule.patches 存在且非空，优先使用
      if (rule.patches && rule.patches.length > 0) {
        for (const patch of rule.patches) {
          if (patch.op === "remove") {
            patches.push({ op: "remove", path: patch.path, audit });
          } else if (patch.value !== undefined) {
            patches.push({
              op: patch.op,
              path: patch.path,
              value: patch.value,
              audit,
            });
          }
        }
        continue;
      }

      // 单补丁模式（向后兼容）
      if (rule.mutation.op === "replace" && rule.mutation.value !== undefined) {
        patches.push({
          op: "replace",
          path: rule.targetPath,
          value: rule.mutation.value,
          audit,
        });
      } else if (rule.mutation.op === "add" && rule.mutation.value !== undefined) {
        patches.push({
          op: "add",
          path: rule.targetPath,
          value: rule.mutation.value,
          audit,
        });
      } else if (rule.mutation.op === "remove") {
        patches.push({
          op: "remove",
          path: rule.targetPath,
          audit,
        });
      }
    }

    return patches;
  }

  /**
   * 阶段 3：Deterministic Sorter
   * 按 audit.ruleId 字典序（ASCII 升序）排序
   */
  private sortPatches(patches: RFC6902Op[]): RFC6902Op[] {
    return [...patches].sort((a, b) => a.audit.ruleId.localeCompare(b.audit.ruleId));
  }

  /**
   * 从 rawIR 构建 ValidatedSceneGraph 深拷贝
   * P0 物理同构：RawDesignIR 的 composition/camera/lighting/materials/color 与 ValidatedSceneGraph 结构一致
   */
  private buildSceneGraph(rawIR: RawDesignIR): ValidatedSceneGraph {
    return structuredClone({
      composition: rawIR.composition,
      camera: rawIR.camera,
      lighting: rawIR.lighting,
      materials: rawIR.materials,
      color: rawIR.color,
    }) as ValidatedSceneGraph;
  }

  /**
   * 阶段 4：RFC 6902 Applier
   * 顺序应用补丁到 sceneGraph，记录统计信息
   */
  private applyPatches(sceneGraph: ValidatedSceneGraph, patches: RFC6902Op[]): ApplyStats {
    const stats: ApplyStats = {
      mutationsApplied: 0,
      testsPassed: 0,
      testsFailed: 0,
      violations: [],
      ruleInputs: [],
    };

    for (const patch of patches) {
      switch (patch.op) {
        case "replace":
          this.applyReplace(sceneGraph, patch);
          stats.mutationsApplied++;
          stats.violations.push({
            ruleId: patch.audit.ruleId,
            severity: "P1_WARNING",
            actionTaken: "MUTATED",
            message: patch.audit.reason,
          });
          stats.ruleInputs.push(this.buildRuleInput(patch));
          break;

        case "add":
          this.applyAdd(sceneGraph, patch);
          stats.mutationsApplied++;
          stats.violations.push({
            ruleId: patch.audit.ruleId,
            severity: "P1_WARNING",
            actionTaken: "MUTATED",
            message: patch.audit.reason,
          });
          stats.ruleInputs.push(this.buildRuleInput(patch));
          break;

        case "remove":
          this.applyRemove(sceneGraph, patch);
          stats.mutationsApplied++;
          stats.violations.push({
            ruleId: patch.audit.ruleId,
            severity: "P0_CRITICAL",
            actionTaken: "MUTATED",
            message: patch.audit.reason,
          });
          break;

        case "move":
          this.applyMove(sceneGraph, patch);
          stats.mutationsApplied++;
          break;

        case "copy":
          this.applyCopy(sceneGraph, patch);
          stats.mutationsApplied++;
          break;

        case "test":
          try {
            this.applyTest(sceneGraph, patch);
            stats.testsPassed++;
            stats.violations.push({
              ruleId: patch.audit.ruleId,
              severity: "P2_INFO",
              actionTaken: "TESTED",
              message: `Test passed at ${patch.path}`,
            });
          } catch {
            stats.testsFailed++;
            stats.violations.push({
              ruleId: patch.audit.ruleId,
              severity: "P0_CRITICAL",
              actionTaken: "REJECTED_ERROR",
              message: `Test failed at ${patch.path}`,
            });
          }
          break;
      }
    }

    return stats;
  }

  /**
   * 构建 ScoringEngine 的 RuleEvaluationInput
   */
  private buildRuleInput(
    patch: Extract<RFC6902Op, { op: "replace" | "add" }>,
  ): RuleEvaluationInput {
    // 根据规则 severity 设置阻尼系数（四级约束空间的阻尼平滑）
    const rule = this.grammar.rules.find((r) => r.ruleId === patch.audit.ruleId);
    const dampingFactor = rule
      ? rule.severity === "P0_CRITICAL"
        ? 1.0
        : rule.severity === "P1_WARNING"
          ? 0.8
          : 0.5
      : 0.8;

    return {
      ruleId: patch.audit.ruleId,
      category: this.inferCategoryFromPath(patch.path),
      mutated: true,
      originalValue: typeof patch.audit.fromValue === "number" ? patch.audit.fromValue : undefined,
      targetValue: typeof patch.value === "number" ? patch.value : undefined,
      dampingFactor,
    };
  }

  /**
   * 从路径推断规则分类（用于 ScoringEngine）
   */
  private inferCategoryFromPath(path: string): "composition" | "lighting" | "color" | "materials" {
    if (path.startsWith("/composition")) return "composition";
    if (path.startsWith("/lighting")) return "lighting";
    if (path.startsWith("/color")) return "color";
    if (path.startsWith("/materials")) return "materials";
    return "composition";
  }

  // ==========================================================================
  // RFC 6902 原子操作实现
  // ==========================================================================

  /**
   * add 操作
   * - 对象：属性已存在则覆盖，不存在则插入
   * - 数组：/path/0 在索引 0 处插入（后续后移），/path/- 末尾追加
   */
  private applyAdd(
    doc: ValidatedSceneGraph,
    patch: Extract<RFC6902Op, { op: "add" }>,
  ): void {
    const parentResult = this.resolveParent(doc, patch.path);

    if (parentResult.parent === null || parentResult.key === null) {
      throw new CompilerError(
        CompilerErrorCode.PATCH_PATH_NOT_FOUND,
        `add: cannot resolve parent for path ${patch.path}`,
      );
    }

    const { parent, key, isEndOfArray } = parentResult;

    if (Array.isArray(parent)) {
      if (isEndOfArray) {
        parent.push(patch.value);
      } else {
        const index = Number(key);
        parent.splice(index, 0, patch.value);
      }
    } else {
      (parent as Record<string, unknown>)[key] = patch.value;
    }

    // 参数状态递进：如果目标是参数的 value 字段，标记父参数为 grammar-derived
    this.markGrammarDerivedIfParameter(doc, patch.path, patch.audit.ruleId);
  }

  /**
   * remove 操作 — 目标路径必须存在
   */
  private applyRemove(
    doc: ValidatedSceneGraph,
    patch: Extract<RFC6902Op, { op: "remove" }>,
  ): void {
    const resolved = JsonPointerResolver.resolve(doc, patch.path);
    if (!resolved.found) {
      throw new CompilerError(
        CompilerErrorCode.PATCH_PATH_NOT_FOUND,
        `remove: target path not found: ${patch.path}`,
      );
    }

    const parentResult = this.resolveParent(doc, patch.path);
    if (parentResult.parent === null || parentResult.key === null) return;

    const { parent, key } = parentResult;
    if (Array.isArray(parent)) {
      const index = Number(key);
      parent.splice(index, 1);
    } else {
      delete (parent as Record<string, unknown>)[key];
    }
  }

  /**
   * replace 操作 — 目标路径必须存在
   */
  private applyReplace(
    doc: ValidatedSceneGraph,
    patch: Extract<RFC6902Op, { op: "replace" }>,
  ): void {
    const resolved = JsonPointerResolver.resolve(doc, patch.path);
    if (!resolved.found) {
      throw new CompilerError(
        CompilerErrorCode.PATCH_PATH_NOT_FOUND,
        `replace: target path not found: ${patch.path}`,
      );
    }

    const parentResult = this.resolveParent(doc, patch.path);
    if (parentResult.parent === null || parentResult.key === null) return;

    const { parent, key } = parentResult;
    if (Array.isArray(parent)) {
      const index = Number(key);
      parent[index] = patch.value;
    } else {
      (parent as Record<string, unknown>)[key] = patch.value;
    }

    // 参数状态递进：标记父参数为 grammar-derived
    this.markGrammarDerivedIfParameter(doc, patch.path, patch.audit.ruleId);
  }

  /**
   * move 操作 — 等价于 remove(from) 后 add(path, value)
   */
  private applyMove(
    doc: ValidatedSceneGraph,
    patch: Extract<RFC6902Op, { op: "move" }>,
  ): void {
    const fromResolved = JsonPointerResolver.resolve(doc, patch.from);
    if (!fromResolved.found) {
      throw new CompilerError(
        CompilerErrorCode.PATCH_PATH_NOT_FOUND,
        `move: source path not found: ${patch.from}`,
      );
    }

    const value = fromResolved.value;
    this.applyRemove(doc, { op: "remove", path: patch.from, audit: patch.audit });
    this.applyAdd(doc, { op: "add", path: patch.path, value, audit: patch.audit });
  }

  /**
   * copy 操作 — 读取 from 的值并 add(path, value)
   */
  private applyCopy(
    doc: ValidatedSceneGraph,
    patch: Extract<RFC6902Op, { op: "copy" }>,
  ): void {
    const fromResolved = JsonPointerResolver.resolve(doc, patch.from);
    if (!fromResolved.found) {
      throw new CompilerError(
        CompilerErrorCode.PATCH_PATH_NOT_FOUND,
        `copy: source path not found: ${patch.from}`,
      );
    }

    const value = structuredClone(fromResolved.value);
    this.applyAdd(doc, { op: "add", path: patch.path, value, audit: patch.audit });
  }

  /**
   * test 操作 — 深度相等核对，不相等则抛出 PATCH_TEST_FAILED
   */
  private applyTest(
    doc: ValidatedSceneGraph,
    patch: Extract<RFC6902Op, { op: "test" }>,
  ): void {
    const resolved = JsonPointerResolver.resolve(doc, patch.path);
    if (!resolved.found) {
      throw new CompilerError(
        CompilerErrorCode.PATCH_TEST_FAILED,
        `test: target path not found: ${patch.path}`,
      );
    }

    if (!deepEqual(resolved.value, patch.value)) {
      throw new CompilerError(
        CompilerErrorCode.PATCH_TEST_FAILED,
        `test: value mismatch at ${patch.path}`,
      );
    }
  }

  // ==========================================================================
  // 辅助函数
  // ==========================================================================

  /**
   * 解析路径的父节点和键名
   */
  private resolveParent(
    doc: ValidatedSceneGraph,
    pointer: string,
  ): { parent: unknown; key: string | null; isEndOfArray: boolean } {
    const tokens = JsonPointerResolver.parse(pointer);
    if (tokens.length === 0) {
      return { parent: null, key: null, isEndOfArray: false };
    }

    const parentPath = "/" + tokens.slice(0, -1).join("/");
    const key = tokens[tokens.length - 1];

    const parentResolved = JsonPointerResolver.resolve(doc, parentPath);
    if (!parentResolved.found) {
      return { parent: null, key: null, isEndOfArray: false };
    }

    const isEndOfArray = Array.isArray(parentResolved.value) && key === "-";
    return { parent: parentResolved.value, key, isEndOfArray };
  }

  /**
   * 参数状态递进：如果目标路径指向参数的 value 字段，标记父参数为 grammar-derived
   *
   * 例如 /composition/negativeSpaceRatio/value → 父节点 /composition/negativeSpaceRatio 是参数节点
   * 标记其 status="grammar-derived", source="grammar-rule", derivedFrom=ruleId
   */
  private markGrammarDerivedIfParameter(
    doc: ValidatedSceneGraph,
    targetPath: string,
    ruleId: string,
  ): void {
    const tokens = JsonPointerResolver.parse(targetPath);
    if (tokens.length < 2) return;

    // 检查最后一个 token 是否为 "value"
    const lastToken = tokens[tokens.length - 1];
    if (lastToken !== "value") return;

    // 父节点路径
    const parentPath = "/" + tokens.slice(0, -1).join("/");
    const parentResolved = JsonPointerResolver.resolve(doc, parentPath);

    if (!parentResolved.found) return;

    const parent = parentResolved.value as Record<string, unknown>;
    // 检查是否为参数节点（有 confidence/status/evidence/source 字段）
    if (
      typeof parent.confidence === "number" &&
      typeof parent.status === "string" &&
      Array.isArray(parent.evidence) &&
      typeof parent.source === "string"
    ) {
      parent.status = "grammar-derived";
      parent.source = "grammar-rule";
      parent.derivedFrom = ruleId;
    }
  }
}
