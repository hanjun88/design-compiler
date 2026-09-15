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

  /** Downstream hash: full RFC8785 entity; never written into ValidatedDesignIR. */
  public static computeValidatedIRHash(validatedIR: Record<string, unknown>): string {
    return this.computeHash(validatedIR);
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
