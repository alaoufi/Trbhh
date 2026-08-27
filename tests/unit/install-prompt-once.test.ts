import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'src/components/install-prompt.tsx'), 'utf8');

describe('install prompt dismissal', () => {
  it('persists closing the prompt in local storage rather than only this browser session', () => {
    expect(source).toContain("const close = () => { setShow(false); try { localStorage.setItem(neverKey, '1'); }");
    expect(source).not.toContain("const close = () => { setShow(false); try { sessionStorage.setItem(sessionKey, '1'); }");
  });
});
