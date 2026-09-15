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
  /**
   * 计算 RFC8785 + SHA-256 哈希
   * 约束：输入即哈希，不重排、不过滤、不裁剪
   */
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

  /**
   * 验证哈希是否与输入匹配
   */
  public static verifyHash(payload: unknown, expectedHash: string): boolean {
    const computed = this.computeHash(payload);
    return computed === expectedHash;
  }

  /**
   * 计算带排除字段的哈希（用于自闭环哈希预映像）
   * 约束：仅排除明确指定的字段，不得隐式排除其他字段
   */
  public static computeHashWithExclusion(
    payload: Record<string, unknown>,
    excludePaths: string[]
  ): string {
    // 深拷贝，避免修改原对象
    const preimage = JSON.parse(JSON.stringify(payload));
    for (const path of excludePaths) {
      this.deletePath(preimage, path);
    }
    return this.computeHash(preimage);
  }

  /**
   * 规范化 PixelBuffer 并计算哈希
   * 支持 8-bit (Uint8ClampedArray) 和 16-bit (Uint16Array)
   */
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

  /**
   * 规范化 PixelBuffer（不计算哈希，仅返回规范化对象）
   */
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

  /**
   * 检测实体注入：检查预映像中是否包含禁止的自引用字段
   */
  public static detectInjection(payload: Record<string, unknown>, forbiddenKeys: string[]): boolean {
    for (const key of forbiddenKeys) {
      if (key in payload) {
        return true;
      }
    }
    // 递归检查嵌套对象
    for (const value of Object.values(payload)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (this.detectInjection(value as Record<string, unknown>, forbiddenKeys)) {
          return true;
        }
      }
    }
    return false;
  }

  // --------------------------------------------------------------------------
  // 内部工具
  // --------------------------------------------------------------------------

  private static deletePath(obj: Record<string, unknown>, path: string): void {
    const segments = path.startsWith('/') ? path.slice(1).split('/') : path.split('.');
    let current: any = obj;
    for (let i = 0; i < segments.length - 1; i++) {
      if (current[segments[i]] && typeof current[segments[i]] === 'object') {
        current = current[segments[i]];
      } else {
        return; // 路径不存在，无需删除
      }
    }
    delete current[segments[segments.length - 1]];
  }
}
