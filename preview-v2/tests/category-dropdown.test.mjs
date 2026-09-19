import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('main category uses an accessible dropdown and retains classification handler', () => {
  const source = readFileSync(new URL('../components/seller-pages.tsx', import.meta.url), 'utf8');
  assert.match(source, /<select id="ad-category" value=\{form.category\}/);
  assert.match(source, /onChange=\{event => chooseCategory\(event.target.value\)\}/);
  assert.match(source, /htmlFor="ad-category"/);
  assert.doesNotMatch(source, /className="seller-category-grid"/);
});
