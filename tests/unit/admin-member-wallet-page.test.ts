import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('administrator member wallets', () => {
  const nav = readFileSync('src/components/admin-nav-def.ts', 'utf8');
  const page = readFileSync('src/app/admin/revenue/page.tsx', 'utf8');
  const actions = readFileSync('src/app/admin/actions.ts', 'utf8');

  it('adds a wallet workspace under the money group', () => {
    expect(nav).toContain("href: '/admin/revenue?tab=wallets'");
    expect(nav).toContain('محافظ الأعضاء');
    expect(page).toContain("tab === 'wallets'");
    expect(page).toContain('بحث ذكي في المحافظ');
  });

  it('creates special services only through administrator actions', () => {
    expect(actions).toContain('createMemberServiceOrderAction');
    expect(actions).toContain('cancelPendingMemberServiceOrderAdminAction');
  });
});
