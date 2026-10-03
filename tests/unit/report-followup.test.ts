import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  user: vi.fn(), permission: vi.fn(), enabled: vi.fn(), readonly: vi.fn(),
  ad: vi.fn(), general: vi.fn(), list: vi.fn(), create: vi.fn(), notify: vi.fn(), admin: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ requireUser: m.user }));
vi.mock('@/lib/roles', () => ({ hasAction: m.permission }));
vi.mock('@/lib/settings', () => ({ getSettingBool: m.enabled }));
vi.mock('@/lib/read-only-preview', () => ({ isReadOnlyPreview: m.readonly }));
vi.mock('@/data/schema-sync', () => ({ ensureSchema: vi.fn() }));
vi.mock('@/lib/admin-inbox', () => ({ getPrimaryAdminId: m.admin }));
vi.mock('@/lib/prisma', () => {
  const db = { repord_ads: { findUnique: m.ad }, reports: { findUnique: m.general },
    report_replies: { findMany: m.list, create: m.create }, notfications: { create: m.notify } };
  return { prisma: { ...db, $transaction: (fn: (tx: typeof db) => unknown) => fn(db) } };
});

describe('private report follow-up', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.user.mockResolvedValue({ uid: 7 }); m.permission.mockResolvedValue(false);
    m.enabled.mockResolvedValue(true); m.readonly.mockReturnValue(false); m.admin.mockResolvedValue(1);
    m.ad.mockResolvedValue({ id: 3n, user_id: 7, ads_id: 22, comment: 'بلاغ', status: 0 });
    m.general.mockResolvedValue({ id: 3n, user_id: 7n, comment_id: 0n, message: 'بلاغ موقع' });
    m.list.mockResolvedValue([]); m.create.mockResolvedValue({ id: 1n }); m.notify.mockResolvedValue({});
  });
  async function api() { return import('@/lib/report-followup'); }
  it('allows the reporter to read either existing report kind', async () => {
    const { getReportConversation } = await api();
    expect((await getReportConversation('ad', '3')).report.ownerId).toBe(7);
    expect((await getReportConversation('general', '3')).report.ownerId).toBe(7);
  });
  it('denies other members including reported owners before reading replies', async () => {
    m.user.mockResolvedValue({ uid: 22 });
    await expect((await api()).getReportConversation('ad', '3')).rejects.toThrow();
    expect(m.list).not.toHaveBeenCalled();
  });
  it('requires reports:view for admin access and reports:add for replies', async () => {
    m.user.mockResolvedValue({ uid: 1 });
    await expect((await api()).getReportConversation('ad', '3', true)).rejects.toThrow();
    m.permission.mockImplementation(async (_uid, _service, action) => action === 'view');
    await expect((await api()).getReportConversation('ad', '3', true)).resolves.toBeDefined();
    await expect((await api()).replyToReport('ad', '3', 'رد', '12345678-1234-4234-8234-123456789012', true)).rejects.toThrow();
    expect(m.create).not.toHaveBeenCalled();
  });
  it('appends repeated follow-ups without replacing older replies', async () => {
    const { replyToReport } = await api();
    await replyToReport('ad', '3', 'استفسار أول', '12345678-1234-4234-8234-123456789012');
    await replyToReport('ad', '3', 'استفسار ثان', '12345678-1234-4234-8234-123456789013');
    expect(m.create).toHaveBeenCalledTimes(2); expect(m.notify).toHaveBeenCalledTimes(2);
  });
  it('notifies only the reporter when authorized staff replies', async () => {
    m.user.mockResolvedValue({ uid: 1 }); m.permission.mockResolvedValue(true);
    await (await api()).replyToReport('general', '3', 'الرد', '12345678-1234-4234-8234-123456789012', true);
    expect(m.notify).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ user_id: '7', route: '/account/submitted-reports/general/3' }) }));
  });
  it.each(['bad', '0', '-1', '1.2', '9007199254740992'])('rejects invalid report id %s', async id => {
    await expect((await api()).getReportConversation('ad', id)).rejects.toThrow();
    expect(m.ad).not.toHaveBeenCalled();
  });
  it('blocks readonly preview and disabled follow-up writes', async () => {
    const { replyToReport } = await api(); m.readonly.mockReturnValue(true);
    await expect(replyToReport('ad', '3', 'رد', '12345678-1234-4234-8234-123456789012')).rejects.toThrow();
    m.readonly.mockReturnValue(false); m.enabled.mockResolvedValue(false);
    await expect(replyToReport('ad', '3', 'رد', '12345678-1234-4234-8234-123456789012')).rejects.toThrow();
    expect(m.create).not.toHaveBeenCalled();
  });
  it('rejects blank/oversized text and malformed submission tokens', async () => {
    const { replyToReport } = await api();
    for (const text of ['', ' ', 'a'.repeat(2001)]) await expect(replyToReport('ad', '3', text, '12345678-1234-4234-8234-123456789012')).rejects.toThrow();
    await expect(replyToReport('ad', '3', 'رد', 'bad')).rejects.toThrow();
    expect(m.create).not.toHaveBeenCalled();
  });
  it('refuses unknown kinds and missing reports', async () => {
    await expect((await api()).getReportConversation('member', '3')).rejects.toThrow();
    m.ad.mockResolvedValue(null);
    await expect((await api()).getReportConversation('ad', '3')).rejects.toThrow();
    expect(m.list).not.toHaveBeenCalled();
  });
  it('deduplicates retried submissions without a second notification', async () => {
    m.create.mockRejectedValue({ code: 'P2002' });
    await expect((await api()).replyToReport('ad', '3', 'رد', '12345678-1234-4234-8234-123456789012')).resolves.toBeUndefined();
    expect(m.notify).not.toHaveBeenCalled();
  });
  it('does not hide database errors as successful sends', async () => {
    m.create.mockRejectedValue(new Error('unavailable'));
    await expect((await api()).replyToReport('ad', '3', 'رد', '12345678-1234-4234-8234-123456789012')).rejects.toThrow('unavailable');
  });
  it('does not allow forged admin mode by another member', async () => {
    m.user.mockResolvedValue({ uid: 99 });
    await expect((await api()).replyToReport('general', '3', 'رد', '12345678-1234-4234-8234-123456789012', true)).rejects.toThrow();
    expect(m.create).not.toHaveBeenCalled();
  });
});
