/**
 * validate-schemas.mjs — 校验所有 JSON Schema 文件的有效性
 *
 * 框架占位 — 具体校验逻辑待实现（需要 ajv 或类似库）。
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SCHEMAS_DIR = resolve(import.meta.dirname, '..', 'schemas');

function main() {
  console.log('=== JSON Schema 校验 ===');
  console.log(`Schema 目录: ${SCHEMAS_DIR}`);

  const files = readdirSync(SCHEMAS_DIR).filter(f => f.endsWith('.schema.json'));
  console.log(`发现 ${files.length} 个 Schema 文件:\n`);

  let passed = 0;
  let failed = 0;

  for (const file of files) {
    const path = join(SCHEMAS_DIR, file);
    try {
      const content = JSON.parse(readFileSync(path, 'utf8'));
      const hasId = !!content.$id;
      const hasSchema = !!content.$schema;
      const hasTitle = !!content.title;

      console.log(`  ✓ ${file}`);
      console.log(`    $id: ${content.$id || '(missing)'}`);
      console.log(`    title: ${content.title || '(missing)'}`);
      console.log(`    required: ${(content.required || []).join(', ') || '(none)'}`);
      console.log();

      if (hasId && hasSchema && hasTitle) {
        passed++;
      } else {
        failed++;
      }
    } catch (e) {
      console.log(`  ✗ ${file}: ${e.message}`);
      failed++;
    }
  }

  console.log(`\n=== 结果: ${passed} 通过, ${failed} 失败 ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
