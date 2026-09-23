import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';

const state = vi.hoisted(() => ({ keys: new Set<string>(), logs: vi.fn(), user: vi.fn(), dependencies: vi.fn() }));
vi.mock('@/lib/access-control/guards', () => ({ requireAdminPage: async () => ({ uid: 9 }), readActorAccess: async () => ({ ready: true, keys: state.keys, roles: [] }) }));
vi.mock('@/components/access-boundary', () => ({ AccessPage: ({ children }: { children: ReactNode }) => children, AccessBoundary: ({ children, module, action = 'view' }: { children: ReactNode; module: string; action?: string }) => state.keys.has(`${module}:${action}`) ? children : null }));
vi.mock('@/lib/audit', () => ({ listAdminLog: state.logs, getUserAdminLog: state.logs, countAdminLog: async () => 1 }));
vi.mock('@/lib/prisma', () => ({ prisma: { users: { findUnique: state.user }, ads: { count: async () => 0 }, user_strikes: { findMany: async () => [] }, dup_attempts: { findUnique: async () => null } } }));
vi.mock('@/lib/wallet', () => ({ getBalance: async () => 0, listTxns: async () => [] }));
vi.mock('@/lib/moderation', () => ({ getModLog: async () => [], DUP_LIMIT: 3, CONTENT_STRIKE_LIMIT: 3 }));
vi.mock('@/lib/account-links', () => ({ linkedAccounts: async () => [] }));
vi.mock('@/lib/content-guard', () => ({ CATEGORY_LABEL: {} }));
vi.mock('@/lib/member-disposition', () => ({ inspectMemberDependencies: state.dependencies, dispositionFor: () => 'archive' }));
vi.mock('@/components/confirm-submit', () => ({ ConfirmSubmit: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/app/admin/actions', () => ({ updateUserAction: vi.fn(), sendUserPasswordAction: vi.fn(), setUserPasswordAction: vi.fn(), adjustUserBalanceAction: vi.fn(), unlinkMemberAccountAction: vi.fn(), disposeMemberAccountAction: vi.fn() }));
import AuditPage from '@/app/admin/audit/page';
import UserPage from '@/app/admin/users/[id]/page';

const privateNote = 'PRIVATE-WALLET-AMOUNT-12345';
const privateTarget = 'PRIVATE-MEMBER-IDENTITY';
const row = { id: 1, adminId: 9, adminName: 'Operator', action: 'إضافة رصيد', target: privateTarget, note: privateNote, at: '2026-09-22T10:00:00.000Z' };
const auditHtml = async () => renderToStaticMarkup(await AuditPage({ searchParams: Promise.resolve({}) }));
const userHtml = async () => renderToStaticMarkup(await UserPage({ params: Promise.resolve({ id: '7' }), searchParams: Promise.resolve({}) }));
beforeEach(() => {
  vi.clearAllMocks(); state.keys = new Set(['audit:view', 'users:view', 'users:delete']);
  state.logs.mockResolvedValue([row]);
  state.user.mockResolvedValue({ id: 7n, name: 'Member', userName: 'member', ban: 'no', created_at: null });
  state.dependencies.mockResolvedValue({ advertisements: 132, stores: 143, balanceHalala: 987654, walletTransactions: 827, topups: 739, messages: 651 });
});

describe('legacy administration pages respect source grants', () => {
  it.each([['audit', auditHtml], ['member timeline', userHtml]] as const)('hides wallet target and note in %s without wallet view', async (_name, render) => {
    const html = await render(); expect(html).toContain('إضافة رصيد');
    expect(html).not.toContain(privateNote); expect(html).not.toContain(privateTarget);
    state.keys.add('wallets:view'); expect(await render()).toContain(privateNote);
  });
  it('unknown action text is not trusted as safe audit metadata', async () => {
    state.logs.mockResolvedValue([{ ...row, action: 'future action with ' + privateNote }]);
    for (const grant of ['wallets:view', 'payments:view', 'expenses:view', 'topups:view']) state.keys.add(grant);
    const html = await auditHtml(); expect(html).not.toContain(privateNote); expect(html).not.toContain(privateTarget); expect(html).toContain('إجراء إداري');
  });
  it.each([
    ['إضافة مصروف', ['expenses:view']], ['إضافة حساب شحن', ['payments:view']],
    ['تأكيد شحن رصيد', ['topups:view']], ['بدء شحن خاص بالراجحي', ['payments:view', 'topups:view']],
    ['موافقة توثيق مدفوع (رصيد غير كافٍ)', ['stores:view', 'verifications:view', 'wallets:view']],
    ['رسالة لصاحب إعلان', ['ads:view', 'messages:view']],
  ])('requires every recorded source grant for %s', async (action, grants) => {
    state.logs.mockResolvedValue([{ ...row, action }]);
    for (const grant of grants) {
      expect(await auditHtml()).not.toContain(privateNote);
      state.keys.add(grant);
    }
    expect(await auditHtml()).toContain(privateNote);
  });
  it('account deletion still offers safe archiving without disclosing source counts or balance', async () => {
    const html = await userHtml(); expect(html).toContain('أرشفة آمنة وإخفاء الحساب');
    for (const value of ['9876.54', '827', '739', '1566', '132', '143', '651']) expect(html).not.toContain(value);
    expect(state.dependencies).toHaveBeenCalledWith(7);
  });
  it('wallet and topup dependency details require their own independent view grants', async () => {
    state.keys.add('wallets:view'); const wallets = await userHtml();
    expect(wallets).toContain('9876.54'); expect(wallets).toContain('827'); expect(wallets).not.toContain('739');
    state.keys.delete('wallets:view'); state.keys.add('topups:view'); const topups = await userHtml();
    expect(topups).toContain('739'); expect(topups).not.toContain('9876.54'); expect(topups).not.toContain('827');
  });
});
