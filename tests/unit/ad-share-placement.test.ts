import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'src/app/ads/[id]/page.tsx'), 'utf8');

describe('ad detail sharing', () => {
  it('keeps one compact share menu and removes the duplicate row below the title', () => {
    expect((source.match(/<ShareButtons/g) || []).length).toBe(1);
    expect(source).not.toContain('/* Share buttons */');
  });
});
