import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import config from '../next.config.mjs';

test('shared seller graph stays inside the standalone preview package and its dependencies', () => {
  const root = fileURLToPath(new URL('../', import.meta.url)).replace(/[\\/]$/, '');
  assert.equal(config.turbopack.root, root);
  const seen = new Set();
  function visit(file) {
    if (seen.has(file)) return;
    seen.add(file);
    assert.ok(file.startsWith(root + sep), `Outside preview package: ${file}`);
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    for (const statement of source.statements) {
      if ((!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const id = statement.moduleSpecifier.text;
      if (!id.startsWith('.')) {
        const resolved = createRequire(file).resolve(id);
        assert.ok(resolved.startsWith(root + sep + 'node_modules' + sep), `Parent dependency: ${id} from ${file}`);
        continue;
      }
      const base = resolve(dirname(file), id);
      const target = [base, base+'.ts', base+'.tsx'].find(existsSync);
      assert.ok(target, `Unresolved shared import: ${id}`);
      if (!target.endsWith('.css')) visit(target);
    }
  }
  visit(resolve(root, 'components/preview-local-seller.tsx'));
});
