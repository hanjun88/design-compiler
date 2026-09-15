import { CompilerError, CompilerErrorCode } from "./error-codes";

export interface RuleEvaluationInput {
  ruleId: string;
  category: "composition" | "lighting" | "color" | "materials";
  mutated: boolean;
  originalValue?: number;
  targetValue?: number;
  dampingFactor?: number;
}

export interface ComplianceScoringWeights {
  composition: number;
  lighting: number;
  color: number;
  materials: number;
}

export class ScoringEngine {
  /**
   * 静态加载门禁：断言全部分类权重之和必须等于 1.0 (容差 1e-4)
   */
  public static validateWeights(weights: ComplianceScoringWeights): void {
    const sum = weights.composition + weights.lighting + weights.color + weights.materials;
    if (Math.abs(sum - 1.0) > 0.0001) {
      throw new CompilerError(
        CompilerErrorCode.SCHEMA_INVALID,
        `Compliance weights must sum to 1.0, but got ${sum}`
      );
    }
  }

  public static calculateRuleScore(input: RuleEvaluationInput): number {
    if (!input.mutated) {
      return 1.0;
    }
    if (
      input.originalValue === undefined ||
      input.targetValue === undefined ||
      input.dampingFactor === undefined
    ) {
      return 0.8;
    }

    const appliedValue =
      input.originalValue + input.dampingFactor * (input.targetValue - input.originalValue);
    const denominator = Math.max(Math.abs(input.targetValue), 1.0);
    const residual = Math.abs(input.targetValue - appliedValue) / denominator;

    return Math.max(0.0, Math.min(1.0, 1.0 - residual));
  }

  public static computeComplianceScore(
    evaluations: RuleEvaluationInput[],
    weights: ComplianceScoringWeights
  ): number {
    this.validateWeights(weights);

    const categories: Array<keyof ComplianceScoringWeights> = [
      "composition",
      "lighting",
      "color",
      "materials"
    ];

    let weightedSum = 0;

    for (const cat of categories) {
      const catRules = evaluations.filter((e) => e.category === cat);
      const catWeight = weights[cat];

      if (catRules.length === 0) {
        weightedSum += catWeight * 1.0;
      } else {
        const catScore = catRules.reduce((acc, r) => acc + this.calculateRuleScore(r), 0) / catRules.length;
        weightedSum += catWeight * catScore;
      }
    }

    return Number(weightedSum.toFixed(4));
  }
}
