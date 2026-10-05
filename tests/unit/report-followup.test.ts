import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  user: vi.fn(), permission: vi.fn(), enabled: vi.fn(), readonly: vi.fn(), update: vi.fn(),
  ad: vi.fn(), general: vi.fn(), list: vi.fn(), create: vi.fn(), notify: vi.fn(), admin: vi.fn(), targetAd: vi.fn(), targetUser: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ requireUser: m.user }));
vi.mock('@/lib/roles', () => ({ hasAction: m.permission }));
vi.mock('@/lib/settings', () => ({ getSettingBool: m.enabled }));
vi.mock('@/lib/read-only-preview', () => ({ isReadOnlyPreview: m.readonly }));
vi.mock('@/data/schema-sync', () => ({ ensureSchema: vi.fn() }));
vi.mock('@/lib/admin-inbox', () => ({ getPrimaryAdminId: m.admin }));
vi.mock('@/lib/prisma', () => {
  const db = { ads: { findUnique: m.targetAd }, users: { findUnique: m.targetUser }, repord_ads: { findUnique: m.ad, updateMany:m.update }, reports: { findUnique: m.general },
    report_replies: { findMany: m.list, create: m.create }, notfications: { create: m.notify } };
  return { prisma: { ...db, $transaction: (fn: (tx: typeof db) => unknown) => fn(db) } };
});

describe('private report follow-up', () => {
  it('handles the pending ad alert transactionally when staff replies',async()=>{
    m.user.mockResolvedValue({uid:1});m.permission.mockResolvedValue(true);
    await (await api()).replyToReport('ad','3','رد الإدارة','12345678-1234-4234-8234-123456789012',true);
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({where:{id:3n,status:0},data:expect.objectContaining({status:1,action:'reply',handled_by:1n})}));
  });
  it('reopens only reply-handled reports when a member follows up, never final decisions',async()=>{
    await (await api()).replyToReport('ad','3','متابعة','12345678-1234-4234-8234-123456789012');
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({where:{id:3n,status:1,action:'reply'},data:expect.objectContaining({status:0})}));
  });
  beforeEach(() => {
    vi.resetAllMocks();
    m.user.mockResolvedValue({ uid: 7 }); m.permission.mockResolvedValue(false);
    m.enabled.mockResolvedValue(true); m.readonly.mockReturnValue(false); m.admin.mockResolvedValue(1);
    m.ad.mockResolvedValue({ id: 3n, user_id: 7, ads_id: 22, comment: 'بلاغ', status: 0 });
    m.general.mockResolvedValue({ id: 3n, user_id: 7n, comment_id: 0n, message: 'بلاغ موقع' });
    m.list.mockResolvedValue([]); m.create.mockResolvedValue({ id: 1n }); m.notify.mockResolvedValue({});
  });
  async function api() { return import('@/lib/report-followup'); }
  it('resolves the reported ad owner for authorized staff without report content', async () => {
    m.permission.mockResolvedValue(true); m.targetAd.mockResolvedValue({ user_id: 22n }); m.targetUser.mockResolvedValue({ id: 22n });
    expect(await (await api()).getReportedMemberContact('ad', '3')).toEqual({ id: '22' });
  });
  it('resolves an explicitly identified member and rejects ambiguous legacy reports', async () => {
    m.permission.mockResolvedValue(true); m.targetUser.mockResolvedValue({ id: 22n });
    m.general.mockResolvedValue({ user_id: 7n, comment_id: 22n, message: 'بلاغ عن عضو #22 — شكوى' });
    expect(await (await api()).getReportedMemberContact('general', '3')).toEqual({ id: '22' });
    m.general.mockResolvedValue({ user_id: 7n, comment_id: 22n, message: 'بلاغ محتوى #22 — شكوى' });
    expect(await (await api()).getReportedMemberContact('general', '3')).toBeNull();
    m.general.mockResolvedValue({ user_id: 7n, comment_id: 23n, message: 'بلاغ عن عضو #22 — شكوى' });
    expect(await (await api()).getReportedMemberContact('general', '3')).toBeNull();
  });
  it('requires staff write permission even when the caller owns the report', async () => {
    await expect((await api()).getReportedMemberContact('ad', '3')).rejects.toThrow();
    expect(m.targetAd).not.toHaveBeenCalled();
    m.permission.mockImplementation(async (_id, _service, action) => action === 'view');
    await expect((await api()).getReportedMemberContact('ad', '3')).rejects.toThrow();
  });
  it('does not invent a recipient for site reports or missing users/ads, and honors disable', async () => {
    m.permission.mockResolvedValue(true);
    expect(await (await api()).getReportedMemberContact('general', '3')).toBeNull();
    m.targetAd.mockResolvedValue(null);
    expect(await (await api()).getReportedMemberContact('ad', '3')).toBeNull();
    m.targetAd.mockResolvedValue({ user_id: 22n }); m.targetUser.mockResolvedValue(null);
    expect(await (await api()).getReportedMemberContact('ad', '3')).toBeNull();
    m.enabled.mockResolvedValue(false);
    expect(await (await api()).getReportedMemberContact('ad', '3')).toBeNull();
  });
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
