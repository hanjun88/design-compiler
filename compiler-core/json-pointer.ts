import { CompilerError, CompilerErrorCode } from "./error-codes";

export class JsonPointerResolver {
  public static unescapeToken(token: string): string {
    return token.replace(/~1/g, "/").replace(/~0/g, "~");
  }

  public static parse(pointer: string): string[] {
    if (pointer === "") {
      return [];
    }
    if (!pointer.startsWith("/")) {
      throw new CompilerError(
        CompilerErrorCode.PATCH_POINTER_INVALID,
        `Invalid JSON Pointer syntax (must start with '/'): ${pointer}`
      );
    }
    return pointer.slice(1).split("/").map(this.unescapeToken);
  }

  /**
   * RFC 6901 寻址实现
   * 约束: 数组标记 '-' 仅供 Patch Engine 'add' 操作执行 append，在寻址读取时恒返回 found=false
   */
  public static resolve(
    doc: unknown,
    pointer: string
  ): { found: boolean; value: unknown; parent: unknown; key: string | null; isEndOfArray?: boolean } {
    const tokens = this.parse(pointer);
    if (tokens.length === 0) {
      return { found: true, value: doc, parent: null, key: null };
    }

    let current: any = doc;
    let parent: any = null;
    let lastKey: string | null = null;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (current === null || typeof current !== "object") {
        return { found: false, value: undefined, parent: null, key: null };
      }
      parent = current;
      lastKey = token;

      if (Array.isArray(current)) {
        if (token === "-") {
          // '-' 仅在作为 Pointer 终点时指示追加语义，读取恒判定为未找到
          const isFinalToken = i === tokens.length - 1;
          return { found: false, value: undefined, parent, key: "-", isEndOfArray: isFinalToken };
        }
        const index = Number(token);
        if (!Number.isInteger(index) || index < 0 || index >= current.length) {
          return { found: false, value: undefined, parent, key: lastKey };
        }
        current = current[index];
      } else {
        if (!Object.prototype.hasOwnProperty.call(current, token)) {
          return { found: false, value: undefined, parent, key: lastKey };
        }
        current = current[token];
      }
    }

    return { found: current !== undefined, value: current, parent, key: lastKey };
  }
}
