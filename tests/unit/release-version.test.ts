import { afterEach, expect, it, vi } from 'vitest';
const readFile = vi.hoisted(() => vi.fn());
vi.mock('node:fs/promises', () => ({ readFile }));
import { GET } from '@/app/api/version/route';
afterEach(() => vi.unstubAllEnvs());
it('reports only the baked revision and disables caching', async () => {
  readFile.mockResolvedValue('a'.repeat(40) + '\n');
  vi.stubEnv('TRBHH_RELEASE_COMMIT', 'b'.repeat(40));
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ commit: 'a'.repeat(40) });
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(readFile.mock.lastCall?.[0]).toMatch(/RELEASE_COMMIT$/);
});
it.each(['development', '../private', 'a'.repeat(41), 'A'.repeat(40)])('rejects invalid markers without disclosing their contents', async value => {
  readFile.mockResolvedValue(value);
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'release_version_unavailable' });
});
it('fails explicitly when an image has no marker', async () => {
  readFile.mockRejectedValue(new Error('private diagnostic'));
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('private');
});
