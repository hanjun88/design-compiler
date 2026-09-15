/**
 * Deep Equal — 轻量级确定性深度相等比对
 *
 * 服务于 RFC 6902 test 操作：使用深度相等核对路径上的值。
 *
 * 约束：
 * - 100% 纯函数，无副作用
 * - 确定性：相同输入必须返回相同结果
 * - 支持：基本类型、数组、普通对象、Date、RegExp
 * - 不支持：循环引用（会栈溢出）、Map/Set/WeakMap（按普通对象处理）
 */

export function deepEqual(a: unknown, b: unknown): boolean {
  // 1. 引用相等或基本类型相等
  if (a === b) return true;

  // 2. null / undefined 处理
  if (a === null || b === null || a === undefined || b === undefined) {
    return a === b;
  }

  // 3. 类型不同
  if (typeof a !== typeof b) return false;

  // 4. NaN 特殊处理（NaN !== NaN，但语义上相等）
  if (typeof a === "number" && typeof b === "number") {
    if (Number.isNaN(a) && Number.isNaN(b)) return true;
    return a === b;
  }

  // 5. Date 比较
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  // 6. RegExp 比较
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source && a.flags === b.flags;
  }

  // 7. 数组比较
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  // 8. 数组 vs 非数组
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  // 9. 普通对象比较
  if (typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a as Record<string, unknown>);
    const bKeys = Object.keys(b as Record<string, unknown>);

    if (aKeys.length !== bKeys.length) return false;

    for (const key of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (
        !deepEqual(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key],
        )
      ) {
        return false;
      }
    }

    return true;
  }

  // 10. 其他类型（function, symbol 等）按引用比较
  return a === b;
}
