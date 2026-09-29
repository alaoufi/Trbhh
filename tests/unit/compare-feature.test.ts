import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { AUDIT_UX_FLAGS } from '@/lib/ux-settings';

const state = vi.hoisted(() => ({ enabled: true, get: vi.fn(), set: vi.fn() }));
vi.mock('@/lib/settings', () => ({ getSettingBool: async () => state.enabled }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: state.get, set: state.set }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));

import { readCompareIds, toggleCompareAction } from '@/app/compare/actions';

describe('comparison feature switch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.enabled = true;
    state.get.mockReturnValue({ value: '1,2' });
  });

  it('does not read or mutate comparison cookies when the feature is disabled', async () => {
    state.enabled = false;
    expect(await readCompareIds()).toEqual([]);
    expect(state.get).not.toHaveBeenCalled();
    const form = new FormData();
    form.set('adId', '7');
    form.set('back', '/ads/7');
    await expect(toggleCompareAction(form)).rejects.toThrow('REDIRECT:/ads/7');
    expect(state.set).not.toHaveBeenCalled();
  });

  it('keeps the existing bounded cookie behavior while enabled', async () => {
    expect(await readCompareIds()).toEqual([1, 2]);
  });

  it('guards every public comparison entry point and exposes one admin flag', () => {
    expect(AUDIT_UX_FLAGS.map(([key]) => key)).toContain('compare_on');
    expect(readFileSync('src/app/compare/page.tsx', 'utf8')).toContain("getSettingBool('compare_on', true)");
    expect(readFileSync('src/app/ads/[id]/page.tsx', 'utf8')).toContain('compareOn && !isAdOwner');
    expect(readFileSync('src/components/site-menu.tsx', 'utf8')).toContain('compareOn && <Item href="/compare"');
  });
});
