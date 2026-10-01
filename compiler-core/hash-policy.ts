import canonicalize from 'canonicalize';
import { createHash } from 'crypto';
import { CompilerError, CompilerErrorCode } from './error-codes';

/**
 * ============================================================================
 * HASH POLICY (ABI 1.0.0 SSOT)
 * ============================================================================
 * 核心约束：
 * 1. 输入即哈希 —— 不得对输入对象执行任何隐式重排、过滤或字段裁剪。
 * 2. 规范化唯一 —— 所有哈希必须基于 RFC 8785 (JSON Canonicalization Scheme)。
 * 3. 预映像可复现 —— 给定相同输入，哈希结果必须位级一致。
 * 4. 实体注入禁止 —— 严禁在预映像中注入虚构字段（如 selfHash、_internal 等）。
 *
 * PixelBuffer 规范化：
 * - 8-bit:  Uint8ClampedArray → 规范化为 { width, height, depth: 8, data: number[] }
 * - 16-bit: Uint16Array → 规范化为 { width, height, depth: 16, data: number[] }
 * - 规范化后再走 RFC8785 + SHA-256，确保跨运行时位级一致。
 *
 * ----------------------------------------------------------------------------
 * Determinism Guarantees (same input → same hash)
 * ----------------------------------------------------------------------------
 * 每个下游哈希只排除"运行时注入、与语义输入无关"的字段；其余字段全部参与
 * 预映像，以保证"过度排除"不会掩盖真实的语义漂移。
 *
 *   - rawIRHash          排除 /provenance/rawIRHash
 *                        （RawIR 自引用：该字段存储的是哈希自身，参与预映像
 *                          会造成自闭环；排除后哈希才可复现。）
 *
 *   - validatedIRHash    排除 /meta/compiledAt
 *                        （PatchEngine.compile 写入的运行时时间戳
 *                          `new Date().toISOString()`，仅用于审计追踪；
 *                          同一输入在不同时刻编译会产生不同时间戳，若参与
 *                          预映像会破坏 same input → same hash。
 *                          该字段保留在 validatedIR.meta 中用于审计，
 *                          只是不参与哈希计算。）
 *                        注意：/meta 下的 grammarPack / grammarVersion 是
 *                        确定性字段，必须参与哈希（grammar 变更必须改变哈希）。
 *
 *   - executionPlanHash  无排除
 *                        （RuntimeExecutionPlan 必须完全确定：不允许任何
 *                          运行时时间戳 / 随机数进入执行计划；若未来引入
 *                          此类字段，必须在此显式排除并同步更新本段落。）
 *
 * 保证范围：在"语义输入 + grammar pack + host capabilities + capturedAt"
 * 完全一致的前提下，rawIRHash / validatedIRHash / executionPlanHash 三个
 * 下游哈希必须位级一致。任何对语义输入、grammar 规则或 host capabilities
 * 的真实变更都必须改变对应哈希。
 * ============================================================================
 */

export type PixelDepth = 8 | 16;

export interface NormalizedPixelBuffer {
  width: number;
  height: number;
  depth: PixelDepth;
  data: number[];
}

export class HashPolicy {
  public static computeHash(payload: unknown): string {
    const canonicalJson = canonicalize(payload);
    if (canonicalJson === undefined) {
      throw new CompilerError(
        CompilerErrorCode.HASH_CANONICALIZATION_FAILED,
        'Payload contains non-serializable data per RFC 8785'
      );
    }
    return `sha256:${createHash('sha256').update(canonicalJson, 'utf8').digest('hex')}`;
  }

  public static verifyHash(payload: unknown, expectedHash: string): boolean {
    const computed = this.computeHash(payload);
    return computed === expectedHash;
  }

  public static computeHashWithExclusion(
    payload: Record<string, unknown>,
    excludePaths: string[]
  ): string {
    const preimage = JSON.parse(JSON.stringify(payload));
    for (const path of excludePaths) {
      this.deletePath(preimage, path);
    }
    return this.computeHash(preimage);
  }

  public static computeRawIRHash(rawIR: Record<string, unknown>): string {
    return this.computeHashWithExclusion(rawIR, ["/provenance/rawIRHash"]);
  }

  /**
   * Downstream hash: full RFC8785 entity; never written into ValidatedDesignIR.
   *
   * 排除 /meta/compiledAt（PatchEngine.compile 写入的运行时时间戳
   * `new Date().toISOString()`），保证 same input → same hash。
   * compiledAt 仍保留在 validatedIR.meta 中用于审计追踪，只是不参与哈希。
   * /meta/grammarPack 与 /meta/grammarVersion 是确定性字段，必须参与哈希。
   */
  public static computeValidatedIRHash(validatedIR: Record<string, unknown>): string {
    return this.computeHashWithExclusion(validatedIR, ["/meta/compiledAt"]);
  }

  /** Downstream hash: full RFC8785 entity; never written into RuntimeExecutionPlan. */
  public static computeExecutionPlanHash(executionPlan: Record<string, unknown>): string {
    return this.computeHash(executionPlan);
  }

  public static computePixelBufferHash(
    data: Uint8ClampedArray | Uint16Array,
    width: number,
    height: number
  ): string {
    const depth: PixelDepth = data instanceof Uint16Array ? 16 : 8;
    const normalized: NormalizedPixelBuffer = {
      width,
      height,
      depth,
      data: Array.from(data),
    };
    return this.computeHash(normalized);
  }

  public static normalizePixelBuffer(
    data: Uint8ClampedArray | Uint16Array,
    width: number,
    height: number
  ): NormalizedPixelBuffer {
    const depth: PixelDepth = data instanceof Uint16Array ? 16 : 8;
    return {
      width,
      height,
      depth,
      data: Array.from(data),
    };
  }

  public static detectInjection(payload: Record<string, unknown>, forbiddenKeys: string[]): boolean {
    for (const key of forbiddenKeys) {
      if (key in payload) {
        return true;
      }
    }
    for (const value of Object.values(payload)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (this.detectInjection(value as Record<string, unknown>, forbiddenKeys)) {
          return true;
        }
      }
    }
    return false;
  }

  private static deletePath(obj: Record<string, unknown>, path: string): void {
    const segments = path.startsWith('/') ? path.slice(1).split('/') : path.split('.');
    let current: any = obj;
    for (let i = 0; i < segments.length - 1; i++) {
      if (current[segments[i]] && typeof current[segments[i]] === 'object') {
        current = current[segments[i]];
      } else {
        return;
      }
    }
    delete current[segments[segments.length - 1]];
  }
}
