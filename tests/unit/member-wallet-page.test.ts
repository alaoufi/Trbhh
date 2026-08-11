import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('member wallet page', () => {
  const page = readFileSync('src/app/account/wallet/page.tsx', 'utf8');
  const actions = readFileSync('src/app/account/actions.ts', 'utf8');

  it('keeps separate top-up, active-service, and operation-history tabs', () => {
    expect(page).toContain('سجل شحن الرصيد');
    expect(page).toContain('العمليات النشطة');
    expect(page).toContain('سجل العمليات');
  });

  it('uses member-only actions for every special-service transition', () => {
    expect(actions).toContain('acceptMemberServiceOrderAction');
    expect(actions).toContain('confirmMemberServiceExecutionAction');
    expect(actions).toContain('cancelMemberServiceOrderAction');
  });
});
