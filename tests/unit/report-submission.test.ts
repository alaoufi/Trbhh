import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ ad: vi.fn(), general: vi.fn(), reply: vi.fn(), notify: vi.fn(), reasons: vi.fn(), readonly: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireUser: async () => ({ uid: 7 }) }));
vi.mock('@/lib/read-only-preview', () => ({ isReadOnlyPreview: m.readonly }));
vi.mock('@/lib/admin-inbox', () => ({ getPrimaryAdminId: async () => 1 }));
vi.mock('@/lib/settings', () => ({ getSetting: async (_key: string, fallback: string) => fallback }));
vi.mock('@/lib/content-guard', () => ({ scanContent: async () => null }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); }, unstable_rethrow: () => {} }));
vi.mock('@/lib/prisma', () => {
  const db = { repord_ads: { create: m.ad }, reports: { create: m.general }, report_replies: { create: m.reply }, notfications: { create: m.notify } };
  return { prisma: { ...db, report_resons: { findMany: m.reasons }, ads: { findUnique: async () => ({ id: 22n }) }, users: { findUnique: async () => ({ id: 22n }) }, $transaction: (fn: (tx: typeof db) => unknown) => fn(db) } };
});
function form(type: string, reason = '', message = '') {
  const f = new FormData(); f.set('type', type); f.set('targetId', '22'); f.set('reasonId', reason); f.set('message', message); return f;
}
describe('required report reason on the server', () => {
  beforeEach(() => {
    vi.resetAllMocks(); m.reasons.mockResolvedValue([{ id: 5n, reason: 'معلومات مضللة' }]);
    m.ad.mockResolvedValue({ id: 3n }); m.general.mockResolvedValue({ id: 3n }); m.reply.mockResolvedValue({ id: 9n });
  });
  async function submit(f: FormData) { return (await import('@/app/report/actions')).submitReportAction(f); }
  it.each(['ad', 'site', 'member', 'content'])('rejects %s without a reason even when explanation is present', async type => {
    expect(await submit(form(type, '', 'توضيح'))).toMatchObject({ error: expect.any(String) });
    expect(m.ad).not.toHaveBeenCalled(); expect(m.general).not.toHaveBeenCalled();
  });
  it.each(['0', 'db:999', 'forged', 'db:-1'])('rejects unknown reason %s', async reason => {
    expect(await submit(form('site', reason))).toMatchObject({ error: expect.any(String) });
    expect(m.general).not.toHaveBeenCalled();
  });
  it('requires nonblank detail for other and rejects oversized detail', async () => {
    expect(await submit(form('site', 'other', '  '))).toMatchObject({ error: expect.any(String) });
    expect(await submit(form('site', 'db:5', 'ع'.repeat(2001)))).toMatchObject({ error: expect.any(String) });
    expect(m.general).not.toHaveBeenCalled();
  });
  it.each(['ad', 'site', 'member', 'content'])('saves the verified reason and full private explanation for %s', async type => {
    const details = 'توضيح خاص '.repeat(70);
    await expect(submit(form(type, 'db:5', details))).rejects.toThrow('REDIRECT:/account/submitted-reports/');
    const saved = (type === 'ad' ? m.ad : m.general).mock.calls[0][0].data;
    expect(saved.comment || saved.message).toContain('معلومات مضللة');
    expect((saved.comment || saved.message).length).toBeLessThan(255);
    expect(m.reply).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ body: details.trim(), author_id: 7n, is_staff: false }) }));
    expect(m.notify).toHaveBeenCalledTimes(1);
  });
  it('accepts a common selected reason without forcing additional explanation', async () => {
    await expect(submit(form('site', 'db:5'))).rejects.toThrow('REDIRECT:/account/submitted-reports/');
    expect(m.reply).not.toHaveBeenCalled();
  });
  it('rejects readonly writes and reports storage failure without success', async () => {
    m.readonly.mockReturnValue(true);
    expect(await submit(form('site', 'db:5'))).toMatchObject({ error: expect.any(String) });
    expect(m.general).not.toHaveBeenCalled(); m.readonly.mockReturnValue(false);
    m.general.mockRejectedValue(new Error('storage error'));
    expect(await submit(form('site', 'db:5'))).toMatchObject({ error: expect.any(String) });
  });
});
