import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(import.meta.dirname, '../../src/app/account/layout.tsx'), 'utf8');

describe('member service navigation', () => {
  it('groups existing member routes by their purpose', () => {
    expect(source).toContain('الحساب والهويات');
    expect(source).toContain('الإعلانات والمتجر');
    expect(source).toContain('المحفظة والمدفوعات');
    expect(source).toContain("href: '/account/wallet'");
  });
});
