/**
 * Compiler Core — 编译内核公开入口
 *
 * DesignCompiler 是现有 PipelineRunner 的稳定包装层：它负责输入边界、
 * 编译上下文、终止态和哈希链；G1/G2/G3 的实际门禁仍由 PipelineRunner 执行。
 */

export * from './types';
export * from './data-gate';
export * from './patch-engine';
export * from './capability-negotiator';
export * from './execution-planner';
export { PipelineRunner } from './pipeline-runner';
export type { PipelineOutput, PipelineRunnerDependencies } from './pipeline-runner';

import { CompilerError, CompilerErrorCode } from './error-codes';
import type { HostCapabilities } from './capability-negotiator';
import type { RawDesignIR, RuntimeExecutionPlan } from './contracts';
import {
  PipelineRunner,
  type PipelineOutput,
  type PipelineRunnerDependencies,
} from './pipeline-runner';
import type {
  CompileContext,
  CompileStatus,
  ProvenanceChain,
  VersionFingerprint,
} from './types';

export interface DesignCompilerOptions {
  pipeline: PipelineRunnerDependencies;
  hostCapabilities: HostCapabilities;
  testCaseId?: string;
}

export interface DesignCompilerResult {
  success: boolean;
  context: CompileContext;
  executionPlan?: RuntimeExecutionPlan;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRawDesignIR(value: unknown): value is RawDesignIR {
  if (!isRecord(value) || !isRecord(value.provenance)) return false;
  return typeof value.provenance.inputHash === 'string' && value.provenance.inputHash.length > 0;
}

function emptyProvenance(inputHash = ''): ProvenanceChain {
  return {
    inputHash,
    rawIrHash: '',
    validatedIrHash: '',
    executionPlanHash: '',
    chain: [],
  };
}

function errorContext(
  context: CompileContext,
  code: CompilerErrorCode,
  message: string,
  stage: string,
): void {
  context.status = 'FAILED';
  context.endTime = new Date().toISOString();
  context.errors.push({ code, message, stage, fatal: true });
}

function setTerminalContext(
  context: CompileContext,
  output: Extract<PipelineOutput, { status: 'TERMINAL_HALT' }>,
): void {
  const stage = output.haltStage;
  context.status = stage === 'G1_DATA_GATE' ? 'BLOCKED_DATA' : 'BLOCKED_ENV';
  context.endTime = new Date().toISOString();
  context.errors.push({
    code: stage === 'G1_DATA_GATE'
      ? CompilerErrorCode.DATA_GATE_BLOCKED
      : CompilerErrorCode.CAPABILITY_UNAVAILABLE,
    message: output.evaluation.diagnostics?.join('; ') ?? `Compilation halted at ${stage}`,
    stage,
    fatal: true,
  });
  context.provenance = {
    ...emptyProvenance(output.evaluation.provenance.hashChain.inputHash),
    chain: [{
      stage,
      hash: output.evaluation.provenance.hashChain.inputHash,
      timestamp: context.endTime,
    }],
  };
}

/**
 * 创建编译上下文。每次 compile 都创建新上下文，避免重复调用污染上一次结果。
 */
export function createCompileContext(versionFingerprint: VersionFingerprint): CompileContext {
  return {
    compileId: `compile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    status: 'PENDING',
    versionFingerprint,
    provenance: emptyProvenance(),
    startTime: new Date().toISOString(),
    errors: [],
    warnings: [],
  };
}

export class DesignCompiler {
  private context: CompileContext;
  private readonly options?: DesignCompilerOptions;
  private readonly pipeline?: PipelineRunner;

  constructor(versionFingerprint: VersionFingerprint, options?: DesignCompilerOptions) {
    this.options = options;
    this.pipeline = options ? new PipelineRunner(options.pipeline) : undefined;
    this.context = createCompileContext(versionFingerprint);
  }

  /**
   * 执行完整编译管线：输入校验 → G1 → G2 → G3 → 哈希链装配。
   * 终止态返回 success=false，不把空计划或空哈希伪装成成功。
   */
  async compile(rawIR: unknown): Promise<DesignCompilerResult> {
    this.context = createCompileContext(this.context.versionFingerprint);

    if (!isRawDesignIR(rawIR)) {
      errorContext(
        this.context,
        CompilerErrorCode.SCHEMA_INVALID,
        'compile() requires a RawDesignIR with a non-empty provenance.inputHash',
        'INPUT_VALIDATION',
      );
      return { success: false, context: this.context };
    }
    if (!this.options || !this.pipeline) {
      errorContext(
        this.context,
        CompilerErrorCode.SCHEMA_INVALID,
        'DesignCompiler requires pipeline dependencies and host capabilities',
        'COMPILER_CONFIGURATION',
      );
      return { success: false, context: this.context };
    }

    try {
      const inputHash = rawIR.provenance.inputHash;
      this.context.provenance = { ...emptyProvenance(inputHash) };
      const output = this.pipeline.execute(
        rawIR,
        this.options.hostCapabilities,
        this.options.testCaseId ?? 'DESIGN_COMPILER',
      );

      if (output.status === 'TERMINAL_HALT') {
        setTerminalContext(this.context, output);
        return { success: false, context: this.context };
      }

      const { hashChain, executionPlan } = output;
      const endTime = new Date().toISOString();
      this.context.status = 'COMPLETE';
      this.context.endTime = endTime;
      this.context.provenance = {
        inputHash: hashChain.inputHash,
        rawIrHash: hashChain.rawIRHash,
        validatedIrHash: hashChain.validatedIRHash,
        executionPlanHash: hashChain.executionPlanHash,
        chain: [
          { stage: 'INPUT', hash: hashChain.inputHash, timestamp: this.context.startTime },
          { stage: 'G1_RAW_IR', hash: hashChain.rawIRHash, timestamp: endTime },
          { stage: 'G2_VALIDATED_IR', hash: hashChain.validatedIRHash, timestamp: endTime },
          { stage: 'G3_EXECUTION_PLAN', hash: hashChain.executionPlanHash, timestamp: endTime },
        ],
      };
      return { success: true, context: this.context, executionPlan };
    } catch (error) {
      const compilerError = error instanceof CompilerError
        ? error
        : new CompilerError(
          CompilerErrorCode.SCHEMA_INVALID,
          error instanceof Error ? error.message : 'Unknown compiler failure',
        );
      errorContext(
        this.context,
        compilerError.code,
        compilerError.message,
        'COMPILER_EXECUTION',
      );
      return { success: false, context: this.context };
    }
  }

  getContext(): CompileContext {
    return this.context;
  }

  getStatus(): CompileStatus {
    return this.context.status;
  }
}
