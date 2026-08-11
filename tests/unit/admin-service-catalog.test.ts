import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(import.meta.dirname, '../../src/components/admin-nav-def.ts'), 'utf8');

describe('admin service catalog', () => {
  it('exposes bank top-up accounts directly with searchable terms', () => {
    expect(source).toContain("href: '/admin/revenue?tab=accounts'");
    expect(source).toContain("label: 'حسابات الشحن البنكية'");
    expect(source).toContain("'الحساب البنكي'");
    expect(source).toContain("'آيبان'");
  });
});
