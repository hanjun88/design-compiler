import { JsonPointerResolver } from "../../compiler-core/json-pointer";
import { CompilerError, CompilerErrorCode } from "../../compiler-core/error-codes";

describe("JSON Pointer — RFC 6901 寻址与约束验证", () => {
  // --------------------------------------------------------------------------
  // 1. 基本寻址
  // --------------------------------------------------------------------------
  describe("基本寻址", () => {
    const doc = {
      foo: "bar",
      nested: {
        value: 42,
        deep: {
          key: "found"
        }
      },
      list: [1, 2, 3]
    };

    test("根指针 '' 必须返回整个文档", () => {
      const result = JsonPointerResolver.resolve(doc, "");
      expect(result.found).toBe(true);
      expect(result.value).toBe(doc);
    });

    test("顶层字段寻址必须正确", () => {
      const result = JsonPointerResolver.resolve(doc, "/foo");
      expect(result.found).toBe(true);
      expect(result.value).toBe("bar");
    });

    test("嵌套字段寻址必须正确", () => {
      const result = JsonPointerResolver.resolve(doc, "/nested/deep/key");
      expect(result.found).toBe(true);
      expect(result.value).toBe("found");
    });

    test("数组索引寻址必须正确", () => {
      const result = JsonPointerResolver.resolve(doc, "/list/1");
      expect(result.found).toBe(true);
      expect(result.value).toBe(2);
    });

    test("不存在的路径必须返回 found=false", () => {
      const result = JsonPointerResolver.resolve(doc, "/nonexistent");
      expect(result.found).toBe(false);
      expect(result.value).toBeUndefined();
    });

    test("数组越界索引必须返回 found=false", () => {
      const result = JsonPointerResolver.resolve(doc, "/list/99");
      expect(result.found).toBe(false);
    });

    test("非整数数组索引必须返回 found=false", () => {
      const result = JsonPointerResolver.resolve(doc, "/list/abc");
      expect(result.found).toBe(false);
    });

    test("负索引必须返回 found=false", () => {
      const result = JsonPointerResolver.resolve(doc, "/list/-1");
      expect(result.found).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 2. 转义字符 (~0 / ~1)
  // --------------------------------------------------------------------------
  describe("转义字符", () => {
    const doc = {
      "a/b": "slash",
      "c~d": "tilde",
      "e/f~g": "both"
    };

    test("~1 必须转义为 /", () => {
      const result = JsonPointerResolver.resolve(doc, "/a~1b");
      expect(result.found).toBe(true);
      expect(result.value).toBe("slash");
    });

    test("~0 必须转义为 ~", () => {
      const result = JsonPointerResolver.resolve(doc, "/c~0d");
      expect(result.found).toBe(true);
      expect(result.value).toBe("tilde");
    });

    test("~0 和 ~1 组合必须正确转义", () => {
      const result = JsonPointerResolver.resolve(doc, "/e~1f~0g");
      expect(result.found).toBe(true);
      expect(result.value).toBe("both");
    });

    test("unescapeToken 必须正确处理 ~0 和 ~1", () => {
      expect(JsonPointerResolver.unescapeToken("a~1b")).toBe("a/b");
      expect(JsonPointerResolver.unescapeToken("c~0d")).toBe("c~d");
      expect(JsonPointerResolver.unescapeToken("e~1f~0g")).toBe("e/f~g");
    });
  });

  // --------------------------------------------------------------------------
  // 3. '-' 终点追加限制（核心约束）
  // --------------------------------------------------------------------------
  describe("'-' 终点追加限制", () => {
    const doc = {
      list: [1, 2, 3],
      nested: {
        items: ["a", "b"]
      }
    };

    test("'-' 作为数组终点时读取必须返回 found=false", () => {
      const result = JsonPointerResolver.resolve(doc, "/list/-");
      expect(result.found).toBe(false);
      expect(result.isEndOfArray).toBe(true);
      expect(result.key).toBe("-");
      expect(result.parent).toBe(doc.list);
    });

    test("'-' 作为嵌套数组终点时必须返回 found=false", () => {
      const result = JsonPointerResolver.resolve(doc, "/nested/items/-");
      expect(result.found).toBe(false);
      expect(result.isEndOfArray).toBe(true);
    });

    test("'-' 不是终点时（后续还有路径）必须返回 found=false", () => {
      const result = JsonPointerResolver.resolve(doc, "/list/-/name");
      expect(result.found).toBe(false);
      // '-' 不是最终 token，isEndOfArray 应为 false 或 undefined
      expect(result.isEndOfArray).toBeFalsy();
    });

    test("'-' 在非数组对象上必须返回 found=false", () => {
      const result = JsonPointerResolver.resolve(doc, "/nested/-");
      expect(result.found).toBe(false);
    });

    test("空数组的 '-' 终点必须返回 found=false 且 isEndOfArray=true", () => {
      const emptyDoc = { items: [] };
      const result = JsonPointerResolver.resolve(emptyDoc, "/items/-");
      expect(result.found).toBe(false);
      expect(result.isEndOfArray).toBe(true);
      expect(result.parent).toBe(emptyDoc.items);
    });
  });

  // --------------------------------------------------------------------------
  // 4. 语法校验
  // --------------------------------------------------------------------------
  describe("语法校验", () => {
    test("非空指针必须以 / 开头，否则抛出 PATCH_POINTER_INVALID", () => {
      expect(() => JsonPointerResolver.resolve({}, "invalid")).toThrow(CompilerError);
      expect(() => JsonPointerResolver.resolve({}, "invalid")).toThrow(
        /Invalid JSON Pointer syntax/
      );
    });

    test("parse 必须正确分割路径", () => {
      const tokens = JsonPointerResolver.parse("/foo/bar/baz");
      expect(tokens).toEqual(["foo", "bar", "baz"]);
    });

    test("parse 空字符串必须返回空数组", () => {
      const tokens = JsonPointerResolver.parse("");
      expect(tokens).toEqual([]);
    });

    test("parse 必须处理转义字符", () => {
      const tokens = JsonPointerResolver.parse("/a~1b/c~0d");
      expect(tokens).toEqual(["a/b", "c~d"]);
    });
  });

  // --------------------------------------------------------------------------
  // 5. parent 和 key 返回值
  // --------------------------------------------------------------------------
  describe("parent 和 key 返回值", () => {
    const doc = {
      foo: { bar: 42 },
      list: [1, 2, 3]
    };

    test("顶层字段必须返回正确的 parent 和 key", () => {
      const result = JsonPointerResolver.resolve(doc, "/foo");
      expect(result.parent).toBe(doc);
      expect(result.key).toBe("foo");
    });

    test("嵌套字段必须返回正确的 parent 和 key", () => {
      const result = JsonPointerResolver.resolve(doc, "/foo/bar");
      expect(result.parent).toBe(doc.foo);
      expect(result.key).toBe("bar");
    });

    test("数组元素必须返回正确的 parent 和 key", () => {
      const result = JsonPointerResolver.resolve(doc, "/list/1");
      expect(result.parent).toBe(doc.list);
      expect(result.key).toBe("1");
    });

    test("根指针必须返回 parent=null 和 key=null", () => {
      const result = JsonPointerResolver.resolve(doc, "");
      expect(result.parent).toBeNull();
      expect(result.key).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // 6. 边界情况
  // --------------------------------------------------------------------------
  describe("边界情况", () => {
    test("null 值字段必须正确寻址", () => {
      const doc = { value: null };
      const result = JsonPointerResolver.resolve(doc, "/value");
      expect(result.found).toBe(true);
      expect(result.value).toBeNull();
    });

    test("false 值字段必须正确寻址", () => {
      const doc = { value: false };
      const result = JsonPointerResolver.resolve(doc, "/value");
      expect(result.found).toBe(true);
      expect(result.value).toBe(false);
    });

    test("0 值字段必须正确寻址", () => {
      const doc = { value: 0 };
      const result = JsonPointerResolver.resolve(doc, "/value");
      expect(result.found).toBe(true);
      expect(result.value).toBe(0);
    });

    test("空字符串字段必须正确寻址", () => {
      const doc = { value: "" };
      const result = JsonPointerResolver.resolve(doc, "/value");
      expect(result.found).toBe(true);
      expect(result.value).toBe("");
    });

    test("穿过 null 中间节点必须返回 found=false", () => {
      const doc = { a: null };
      const result = JsonPointerResolver.resolve(doc, "/a/b");
      expect(result.found).toBe(false);
    });

    test("穿过 number 中间节点必须返回 found=false", () => {
      const doc = { a: 42 };
      const result = JsonPointerResolver.resolve(doc, "/a/b");
      expect(result.found).toBe(false);
    });
  });
});
