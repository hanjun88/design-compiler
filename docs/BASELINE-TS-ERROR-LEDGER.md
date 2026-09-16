# Baseline TypeScript Error Ledger

> **契约性质**：本文件是 Repository-wide TypeScript 门禁的**唯一基线白名单**。
> 任何超出此清单的类型错误均触发编译熔断（GATE-B FAIL）。
> 本清单中的错误属于历史只读保护区（compiler-core/、evaluation/）的既有负债，
> 不代表"可接受的代码质量"，仅代表"已锁定、不扩散、待远期清偿"。

## 门禁契约（双轨）

| 门禁 | 命令 | 预期 | 判定 |
|---|---|---|---|
| **GATE-A** Scoped Typecheck | `npx tsc --noEmit`（仅 chinese-aesthetic/ 范围） | 0 errors, 0 warnings | **STRICT PASS** |
| **GATE-B** Baseline Matching | `npx tsc --noEmit`（全域）+ 指纹匹配 | 恰好 3 个诊断，全部命中白名单 | **BASELINE-MATCHED PASS** |

> **禁止表述**："全域 TypeScript PASS"、"全域零错误"、"Repository-wide clean"。
> **正确表述**："Scoped TypeScript: PASS"、"Repository-wide baseline matching: PASS"、"Repository-wide zero-error compilation: FAIL（3 项基线遗留）"。

## 基线验证记录

| 验证项 | 结果 |
|---|---|
| 基线 commit | `05f4408`（master FROZEN） |
| 验证命令 | `git worktree add ../baseline-ts-audit 05f4408 && npx tsc --noEmit` |
| 当前 commit | `45c29bd`（feature/chinese-aesthetic-disk-emitter） |
| 错误数量 | 基线 3 项 == 当前 3 项 |
| 文件路径 | 完全一致 |
| 行列号 | 完全一致 |
| TS 错误码 | 完全一致 |
| 错误文本 | 完全一致 |
| 验证状态 | **BASELINE_VERIFIED** |

## 基线错误指纹（3 项）

### BL-TS-001

```json
{
  "id": "BL-TS-001",
  "errorCode": "TS2345",
  "file": "compiler-core/execution-planner.ts",
  "line": 108,
  "column": 25,
  "anchor": "Record<string, unknown> assignment from {}",
  "messagePattern": "Argument of type '{}' is not assignable to parameter of type 'Record<string, unknown>'",
  "introducedBy": "05f4408",
  "scope": "protected-baseline",
  "allowance": "read-only-baseline",
  "note": "compiler-core/ 为历史只读保护区，ZERO DIFF 约束下不得修改"
}
```

### BL-TS-002

```json
{
  "id": "BL-TS-002",
  "errorCode": "TS2305",
  "file": "evaluation/feedback-engine.ts",
  "line": 14,
  "column": 15,
  "anchor": "EvaluationResult import from ./index.js",
  "messagePattern": "no exported member 'EvaluationResult'",
  "introducedBy": "05f4408",
  "scope": "protected-baseline",
  "allowance": "read-only-baseline",
  "note": "evaluation/ 为历史只读保护区，ZERO DIFF 约束下不得修改"
}
```

### BL-TS-003

```json
{
  "id": "BL-TS-003",
  "errorCode": "TS7006",
  "file": "evaluation/feedback-engine.ts",
  "line": 92,
  "column": 55,
  "anchor": "implicit any parameter 'v'",
  "messagePattern": "Parameter 'v' implicitly has an 'any' type",
  "introducedBy": "05f4408",
  "scope": "protected-baseline",
  "allowance": "read-only-baseline",
  "note": "evaluation/ 为历史只读保护区，ZERO DIFF 约束下不得修改"
}
```

## 指纹匹配规则

匹配优先级（从严格到宽松）：

1. **精确匹配**：`errorCode` + `file` + `messagePattern`（子串匹配）全部命中
2. **行列号**：作为辅助信息，不参与匹配判定（行列号会因无关代码插入而漂移）
3. **未匹配错误**：任何不命中白名单的诊断 → GATE-B FAIL，触发熔断
4. **缺失基线错误**：若某基线错误不再出现 → 记录为"已修复"，需更新本账本并重新封签

## 变更管理

- 新增基线错误：**禁止**。任何新类型错误必须在引入阶段修复，不得加入白名单。
- 移除基线错误：当历史保护区被正式重构并修复后，从本清单移除，并更新基线 commit。
- 修改指纹：仅当错误文本因 TypeScript 版本升级而变化时，需同步更新 `messagePattern` 并重新验证。
