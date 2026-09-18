import { beforeEach, expect, it, vi } from 'vitest';
const getSetting = vi.hoisted(() => vi.fn());
vi.mock('@/lib/settings', () => ({ getSetting }));
const api = await import('../../src/lib/site-design-server');
beforeEach(() => getSetting.mockReset());
it('returns only public configuration from existing settings and defaults off', async () => {
    expect(api.getSiteDesignConfig).toBeTypeOf('function');
    getSetting.mockImplementation(async (_key: string, fallback: string) => fallback);
    expect((await api.getSiteDesignConfig()).enabled).toBe(false);
    getSetting.mockImplementation(async (key: string, fallback: string) => ({ 'v2_design_on': '1', 'v2_design_label': 'اسم مخصص', 'v2_design_description': 'وصف مخصص' }[key] ?? fallback));
    expect(await api.getSiteDesignConfig()).toEqual({ enabled: true, label: 'اسم مخصص', description: 'وصف مخصص' });
});
it('fails closed on settings errors or unexpected enable values', async () => {
    expect(api.getSiteDesignConfig).toBeTypeOf('function');
    getSetting.mockRejectedValue(new Error('offline'));
    expect((await api.getSiteDesignConfig()).enabled).toBe(false);
    getSetting.mockImplementation(async (key: string, fallback: string) => key === 'v2_design_on' ? 'unexpected' : fallback);
    expect((await api.getSiteDesignConfig()).enabled).toBe(false);
});
