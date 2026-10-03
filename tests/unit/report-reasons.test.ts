import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ rows: vi.fn(), setting: vi.fn(), write: vi.fn(), permission: vi.fn(), readonly: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { report_resons: { findMany: m.rows } } }));
vi.mock('@/lib/settings', () => ({ getSetting: m.setting, setSetting: m.write }));
vi.mock('@/lib/roles', () => ({ requireAction: m.permission }));
vi.mock('@/lib/read-only-preview', () => ({ isReadOnlyPreview: m.readonly }));
vi.mock('@/lib/report-followup', () => ({ REPORT_FOLLOWUP_ENABLED: 'report_followup_enabled' }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(url); } }));
describe('shared report reasons', () => {
  beforeEach(() => { vi.resetAllMocks(); m.rows.mockResolvedValue([]); m.setting.mockImplementation(async (_k, fallback) => fallback); });
  it('has distinct stable options and other when database reasons are absent', async () => {
    const { getReportReasons } = await import('@/lib/report-reasons'); const reasons = await getReportReasons();
    expect(reasons.length).toBeGreaterThan(4);
    expect(new Set(reasons.map(r => r.value)).size).toBe(reasons.length);
    expect(reasons.at(-1)?.value).toBe('other');
    expect(await getReportReasons()).toEqual(reasons);
  });
  it('deduplicates labels and reads the administrative custom list', async () => {
    m.rows.mockResolvedValue([{ id: 5n, reason: 'احتيال' }]); m.setting.mockResolvedValue('احتيال\nخلل تقني\nخلل تقني\n');
    const reasons = await (await import('@/lib/report-reasons')).getReportReasons();
    expect(reasons.map(r => r.label)).toEqual(['احتيال', 'خلل تقني', 'سبب آخر']);
  });
  it('keeps only the required-explanation Other option across legacy spellings', async () => {
    m.rows.mockResolvedValue([{ id: 5n, reason: 'أخرى' }, { id: 6n, reason: 'سبب اخر' }]);
    m.setting.mockResolvedValue('other\nاخرى\nسبب آخر');
    expect(await (await import('@/lib/report-reasons')).getReportReasons()).toEqual([{ value: 'other', label: 'سبب آخر', legacyId: 0 }]);
  });
  it('allows editing the list only with reports:edit, blocks preview and rejects invalid lengths', async () => {
    const { saveReportReasons } = await import('@/app/admin/reports/followup-actions'); const f = new FormData(); f.set('commonReasons', 'سبب معروف');
    m.permission.mockRejectedValueOnce(new Error('forbidden'));
    await expect(saveReportReasons(f)).rejects.toThrow('forbidden'); expect(m.write).not.toHaveBeenCalled();
    m.readonly.mockReturnValue(true); await saveReportReasons(f); expect(m.write).not.toHaveBeenCalled();
    m.readonly.mockReturnValue(false); f.set('commonReasons', 'ع'.repeat(81));
    await expect(saveReportReasons(f)).rejects.toThrow('reasonsError'); expect(m.write).not.toHaveBeenCalled();
    f.set('commonReasons', 'سبب معروف'); await saveReportReasons(f);
    expect(m.permission).toHaveBeenCalledWith('reports', 'edit'); expect(m.write).toHaveBeenCalledWith('report_common_reasons', 'سبب معروف');
  });
});
