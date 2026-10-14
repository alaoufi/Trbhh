import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: state.query } }));
import { loadAdminCjCatalog } from '@/lib/cj/admin-catalog';
beforeEach(() => state.query.mockReset());
it('shows a real total beyond 200 and bounds a final page without losing older products', async () => {
  state.query.mockResolvedValueOnce([{ total: 286n, ready: 0n }]).mockResolvedValueOnce([{ id: 1n }]);
  const result = await loadAdminCjCatalog({ page: '999' });
  expect(result).toMatchObject({ total: 286, page: 12, pageCount: 12, items: [{ id: 1n }] });
  expect(state.query.mock.calls[1][0].values).toEqual([24, 264]);
});
it('keeps visibility and category predicates in both count and page reads', async () => {
  state.query.mockResolvedValueOnce([{ total: 24n, ready: 1n }]).mockResolvedValueOnce([]);
  const result = await loadAdminCjCatalog({ cat: '5', page: '2' }, true);
  expect(result).toMatchObject({ cat: 5, page: 1, total: 24, ready: 1 });
  for (const [query] of state.query.mock.calls) { expect(query.sql).toContain('hidden=0'); expect(query.sql).toContain('category_id=?'); expect(query.values).toContain(5n); }
});
it('rejects failed and impossible counts instead of presenting a false empty catalog', async () => {
  state.query.mockResolvedValueOnce([]);
  await expect(loadAdminCjCatalog({})).rejects.toThrow('invalid_catalog_count');
  state.query.mockResolvedValueOnce([{ total: 1n, ready: 2n }]);
  await expect(loadAdminCjCatalog({})).rejects.toThrow('invalid_catalog_count');
});
it('normalizes malformed URL filters without interpolating them into SQL', async () => {
  state.query.mockResolvedValueOnce([{ total: 0n, ready: 0n }]).mockResolvedValueOnce([]);
  expect(await loadAdminCjCatalog({ cat: '1 OR 1=1', page: ['7'] })).toMatchObject({ cat: 0, page: 1, total: 0 });
  expect(state.query.mock.calls[0][0].values).toEqual([]);
});
