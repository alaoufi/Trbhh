import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');

describe('private live Al Rajhi top-up', () => {
  it('keeps the real checkout page admin-only and out of search', () => {
    const file = resolve(root, 'src/app/admin/payments/private-topup/page.tsx');
    expect(existsSync(file)).toBe(true);
    const source = readFileSync(file, 'utf8');
    const formSource = readFileSync(resolve(root, 'src/app/admin/payments/private-topup/private-topup-form.tsx'), 'utf8');
    expect(source).toContain("requireAction('users', 'edit')");
    expect(source).toContain('index: false');
    expect(source).toContain('startAlrajhiPrivateTopupAction');
    expect(formSource).toContain('dir="ltr"');
  });

  it('never allows a staff member to manually approve an online top-up', () => {
    const source = readFileSync(resolve(root, 'src/lib/wallet.ts'), 'utf8');
    const start = source.indexOf('export async function approveTopup');
    const end = source.indexOf('/** إلغاء تأكيد شحن', start);
    const block = source.slice(start, end);
    expect(block).toContain("req.source === 'online'");
  });
});
