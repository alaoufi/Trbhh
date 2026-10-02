import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), ads: vi.fn(), save: vi.fn(), invalidate: vi.fn(), preview: false }));
vi.mock('@/lib/roles', () => ({ requireAction: mocks.auth }));
vi.mock('@/lib/data', () => ({ getHomeHeroAds: mocks.ads }));
vi.mock('@/lib/settings', () => ({ setSetting: mocks.save }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.invalidate }));
vi.mock('@/lib/read-only-preview', () => ({ isReadOnlyPreview: () => mocks.preview }));
import { saveHomeHeroAction } from '@/app/admin/home-hero/actions';
const form = (ids: string) => { const value = new FormData(); value.set('ids', ids); return value; };
beforeEach(() => { vi.resetAllMocks(); mocks.preview = false; mocks.auth.mockResolvedValue({uid:1}); mocks.ads.mockImplementation(async ids => ids.map((id: number) => ({id}))); });
it('saves only explicitly selected IDs in their administrator order', async () => {
  expect(await saveHomeHeroAction({}, form('٣، 1,3'))).toEqual({saved:true});
  expect(mocks.auth).toHaveBeenCalledWith('users','edit');
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith('home_hero_ad_ids','3,1');
  expect(mocks.invalidate).toHaveBeenCalledWith('/');
});
it('clears the selection without any automatic fallback', async () => {
  await saveHomeHeroAction({}, form(''));
  expect(mocks.save).toHaveBeenCalledWith('home_hero_ad_ids','');
});
it('denies unauthorized writes before querying or saving', async () => {
  mocks.auth.mockRejectedValue(new Error('forbidden'));
  await expect(saveHomeHeroAction({},form('1'))).rejects.toThrow('forbidden');
  expect(mocks.ads).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
});
it('protects read-only Preview', async () => {
  mocks.preview = true;
  expect(await saveHomeHeroAction({},form('1'))).toHaveProperty('error');
  expect(mocks.save).not.toHaveBeenCalled();
});
it.each(['-2','abc',Array.from({length:11},(_,i)=>i+1).join(',')])('rejects malformed input %s', async ids => {
  expect(await saveHomeHeroAction({},form(ids))).toHaveProperty('error');
  expect(mocks.save).not.toHaveBeenCalled();
});
it('rejects unavailable ads without silently losing the prior selection', async () => {
  mocks.ads.mockResolvedValue([{id:1}]);
  expect(await saveHomeHeroAction({},form('1,2'))).toHaveProperty('error');
  expect(mocks.save).not.toHaveBeenCalled();
});
it('does not expose database exceptions', async () => {
  mocks.ads.mockRejectedValue(new Error('private DB details'));
  expect(await saveHomeHeroAction({},form('1'))).toEqual({error:'تعذر حفظ الاختيارات. حاول مجددًا.'});
  expect(mocks.save).not.toHaveBeenCalled();
});
