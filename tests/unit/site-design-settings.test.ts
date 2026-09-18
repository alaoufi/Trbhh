import { expect, it, vi } from 'vitest';
import { AUDIT_UX_FLAGS, AUDIT_UX_TEXTS } from '@/lib/ux-settings';
vi.mock('@/data/schema-sync', () => ({ ensureSchema: async () => { } }));
vi.mock('@/lib/prisma', () => ({ prisma: { site_settings: { findMany: async () => [] } } }));
import { getAuditUxSettings } from '@/lib/settings';
it('admin defaults leave V2 off without changing the existing flags', async () => {
    const ux = await getAuditUxSettings();
    expect(ux.flags.v2_design_on).toBe(false);
    for (const [key] of AUDIT_UX_FLAGS)
        if (key !== 'v2_design_on')
            expect(ux.flags[key]).toBe(true);
    expect(AUDIT_UX_TEXTS.map(([key]) => key)).toContain('v2_design_label');
    expect(AUDIT_UX_TEXTS.map(([key]) => key)).toContain('v2_design_description');
});
