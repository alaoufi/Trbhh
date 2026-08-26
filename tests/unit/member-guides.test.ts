import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
describe('member account guide links', () => {
  it('offers direct account and administration paths', () => {
    expect(read('src/app/guide/page.tsx')).toContain("href: '/account/identities'");
    expect(read('src/app/guide/store/page.tsx')).toContain("href: '/account/identities'");
    expect(read('src/app/admin/guide/page.tsx')).toContain("href: '/admin/users'");
  });
});
