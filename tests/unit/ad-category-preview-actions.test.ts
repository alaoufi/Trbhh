import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PREVIEW_CATEGORY_VISIBILITY_KEY } from '@/lib/read-only-preview';

const state = vi.hoisted(() => ({
  requireAction: vi.fn(),
  transaction: vi.fn(),
  previewSet: vi.fn(),
  redirect: vi.fn(),
  revalidate: vi.fn(),
  bust: vi.fn(),
}));

vi.mock('@/lib/roles', () => ({ requireAction: state.requireAction }));
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: state.transaction } }));
vi.mock('@/lib/redis', () => ({ previewHashSet: state.previewSet }));
vi.mock('@/lib/settings', () => ({ setSetting: vi.fn() }));
vi.mock('@/lib/data', () => ({ bustAdCaches: state.bust }));
vi.mock('next/cache', () => ({ revalidatePath: state.revalidate }));
vi.mock('next/navigation', () => ({ redirect: state.redirect }));

import { saveCategory, toggleCategory } from '@/app/admin/categories/actions';

describe('category visibility actions in live read-only preview', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.TRBHH_READ_ONLY_PREVIEW = '1';
    state.requireAction.mockResolvedValue({ uid: 382 });
    state.transaction.mockRejectedValue(new Error('DB_WRITE_ATTEMPT'));
  });

  it('stores category visibility in the preview overlay and never writes production MySQL', async () => {
    const form = new FormData();
    form.set('id', '10');
    form.set('active', '0');

    await toggleCategory(form);

    expect(state.previewSet).toHaveBeenCalledWith(PREVIEW_CATEGORY_VISIBILITY_KEY, 'category:10', '0');
    expect(state.transaction).not.toHaveBeenCalled();
    expect(state.bust).toHaveBeenCalled();
    expect(state.redirect).toHaveBeenCalledWith('/admin/categories/manage?saved=preview');
  });

  it('keeps subcategory visibility isolated under a distinct preview key', async () => {
    const form = new FormData();
    form.set('id', '101');
    form.set('sub', '1');
    form.set('active', '1');

    await toggleCategory(form);

    expect(state.previewSet).toHaveBeenCalledWith(PREVIEW_CATEGORY_VISIBILITY_KEY, 'subcategory:101', '1');
    expect(state.transaction).not.toHaveBeenCalled();
  });

  it('redirects unsupported category edits instead of attempting a production write', async () => {
    const form = new FormData();
    form.set('id', '10');
    form.set('name', 'اسم تجريبي');
    form.set('order', '1');

    await saveCategory(form);

    expect(state.transaction).not.toHaveBeenCalled();
    expect(state.redirect).toHaveBeenCalledWith('/admin/categories/manage?error=read-only');
  });
});
