import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';

const localPath = (url: string) => `/snapshot-media/${createHash('sha256').update(url).digest('hex')}.jpg`;

const fixture = () => ({ schemaVersion: 1, mode: 'live', source: 'https://trbhh.sa', capturedAt: '2026-09-19T00:00:00.000Z', sourceCommit: 'a'.repeat(40), count: 1, complete: true, listings: [{ id: '101', title: 'عنوان أصلي', description: 'وصف أصلي', price: 0, priceType: 'rent', rentPeriod: 'شهري', city: 'الرياض', seller: 'not-an-account', verified: true, condition: '', specs: [], category: '', subcategory: '', classificationRevision: 'b'.repeat(64), sourceUrl: 'https://trbhh.sa/ads/101', time: '2026-09-18', images: ['https://trbhh.sa/media/uploads/a.jpg'], image: 'https://trbhh.sa/media/uploads/a.jpg', intent: 'offer', sourceCategoryId: '0', sourceSubcategoryId: null }] });

it('provides guarded standalone seed/import modules', async () => {
  expect(existsSync('scripts/preview-v2/seed.mjs')).toBe(true);
  expect(existsSync('scripts/preview-v2/import-public-snapshot.mjs')).toBe(true);
});

it('rejects any database outside the exact sandbox before connecting', async () => {
  const { guardDatabaseUrl } = await import('../../scripts/preview-v2/seed.mjs');
  for (const host of ['127.0.0.1', 'localhost', '[::1]', 'preview-db']) expect(() => guardDatabaseUrl(`mysql://u:p@${host}:3306/trbhh_preview_v2`)).not.toThrow();
  for (const url of ['mysql://u:p@production/trbhh_preview_v2', 'mysql://u:p@localhost/trbhh_preview_audit', 'mysql://u:p@localhost/trbhh_preview_v2?socket=/tmp/mysql', 'mysql://u:p@localhost/trbhh_preview_v2#x']) expect(() => guardDatabaseUrl(url)).toThrow();
});

it('maps original ads to the synthetic owner with no contact/verification claims', async () => {
  const { planImport } = await import('../../scripts/preview-v2/import-public-snapshot.mjs');
  const plan = planImport(fixture());
  const row = plan.ads[0];
  expect(row.id).toBe(101n);
  expect(row.title).toBe(fixture().listings[0].title);
  expect(row.detail).toBe(fixture().listings[0].description);
  expect(row).toMatchObject({ price: 0, price_type: 'rent', rent_period: 'شهري', category_id: 0n, subcategory_id: null, phoneAllow: 0, commentAllow: 0, adsSpecial: 'no', store_only: 0 });
  expect(row).not.toHaveProperty('seller');
  expect(row).not.toHaveProperty('trusted');
  expect(plan.media[0].sources).toEqual(fixture().listings[0].images);
  const empty = fixture(); empty.listings[0].images = []; empty.listings[0].image = '/placeholder-ad.svg';
  expect(planImport(empty).media[0].sources).toEqual([]);
  const wanted = fixture(); wanted.listings[0].intent = 'wanted';
  expect(planImport(wanted).ads[0].adsType).toBe('request');
});

it('rejects private fields, duplicates, foreign media and database truncation', async () => {
  const { planImport } = await import('../../scripts/preview-v2/import-public-snapshot.mjs');
  for (const change of [
    (s: ReturnType<typeof fixture>) => { Object.assign(s.listings[0], { email: 'private' }); },
    (s: ReturnType<typeof fixture>) => { s.listings.push(s.listings[0]); s.count = 2; },
    (s: ReturnType<typeof fixture>) => { s.listings[0].images = ['https://evil.test/a.jpg']; },
    (s: ReturnType<typeof fixture>) => { s.listings[0].title = 'x'.repeat(256); },
    (s: ReturnType<typeof fixture>) => { s.listings[0].description = 'ع'.repeat(40000); },
    (s: ReturnType<typeof fixture>) => { s.listings[0].rentPeriod = 'x'.repeat(21); },
  ]) { const s = fixture(); change(s); expect(() => planImport(s)).toThrow(); }
});

function fakeDatabase() {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ v: '2026-09-19-v1' }]),
    site_settings: { findUnique: vi.fn().mockResolvedValue(null), createMany: vi.fn().mockResolvedValue({ count: 3 }) },
    ads: { findFirst: vi.fn().mockResolvedValue(null), createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    users: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 1003n }) },
    cities: { findMany: vi.fn().mockResolvedValue([{ id: 1n, name: 'الرياض' }]), create: vi.fn().mockResolvedValue({ id: 14n }) },
    uploads: { create: vi.fn().mockResolvedValue({ id: 77n }) },
    photos: { create: vi.fn().mockResolvedValue({ id: 1n }) },
  };
  const db = {
    $queryRaw: vi.fn().mockResolvedValue([{ name: 'trbhh_preview_v2' }]),
    site_settings: { findUnique: vi.fn().mockResolvedValue({ v: '2026-09-19-v1' }) },
    $transaction: vi.fn(async (run: (value: typeof tx) => unknown) => run(tx)),
  };
  return { db, tx };
}

it('rejects missing marker, wrong connected database and ID collisions before writes', async () => {
  const { planImport, importIntoDatabase } = await import('../../scripts/preview-v2/import-public-snapshot.mjs');
  const plan = planImport(fixture());
  const manifest = { [fixture().listings[0].images[0]]: localPath(fixture().listings[0].images[0]) };
  for (const fail of ['marker', 'database', 'collision']) {
    const { db, tx } = fakeDatabase();
    if (fail === 'marker') db.site_settings.findUnique.mockResolvedValue(null);
    if (fail === 'database') db.$queryRaw.mockResolvedValue([{ name: 'production' }]);
    if (fail === 'collision') tx.ads.findFirst.mockResolvedValue({ id: 101n });
    await expect(importIntoDatabase(db, plan, manifest, 'synthetic-hash')).rejects.toThrow();
    expect(tx.users.create).not.toHaveBeenCalled();
    expect(tx.ads.createMany).not.toHaveBeenCalled();
  }
});

it('imports ordered local photos under a separate synthetic owner, without modifying source claims', async () => {
  const { planImport, importIntoDatabase } = await import('../../scripts/preview-v2/import-public-snapshot.mjs');
  const { db, tx } = fakeDatabase();
  const source = fixture();
  const path = localPath(source.listings[0].images[0]);
  await expect(importIntoDatabase(db, planImport(source), { [source.listings[0].images[0]]: path }, 'random-only-hash')).resolves.toEqual({ imported: 1, alreadyImported: false });
  expect(tx.users.create.mock.calls[0][0].data).toMatchObject({ userName: 'public-snapshot', email: null, phoneNumber: null, trusted: 0, password: 'random-only-hash' });
  expect(tx.ads.createMany.mock.calls[0][0].data[0]).toMatchObject({ id: 101n, user_id: 1003n, profile_id: null, city_id: 1n });
  expect(tx.uploads.create.mock.calls[0][0].data.file_name).toBe(path);
  expect(tx.photos.create).toHaveBeenCalledWith({ data: { other_id: 101n, photo_path: '77' } });
  for (const row of tx.site_settings.createMany.mock.calls[0][0].data) {
    expect(row.k.length, 'site_settings.k must fit VARCHAR(60)').toBeLessThanOrEqual(60);
  }
  expect(JSON.stringify(tx.users.create.mock.calls)).not.toContain(source.listings[0].seller);
  const marker = tx.site_settings.createMany.mock.calls[0][0].data.find((row: { k: string }) => row.k === 'preview_v2_public_import');
  const rerun = fakeDatabase(); rerun.tx.site_settings.findUnique.mockResolvedValue(marker);
  await expect(importIntoDatabase(rerun.db, planImport(source), { [source.listings[0].images[0]]: path }, 'different-random-hash')).resolves.toEqual({ imported: 0, alreadyImported: true });
  expect(rerun.tx.users.create).not.toHaveBeenCalled();
  expect(rerun.tx.ads.createMany).not.toHaveBeenCalled();
  source.listings[0].title += ' changed';
  await expect(importIntoDatabase(rerun.db, planImport(source), { [source.listings[0].images[0]]: path }, 'hash')).rejects.toThrow('different snapshot');
});

it('requires complete exact local media mapping and rejects unsafe paths', async () => {
  const { validateMediaManifest } = await import('../../scripts/preview-v2/import-public-snapshot.mjs');
  const url = fixture().listings[0].images[0];
  const path = localPath(url);
  expect(validateMediaManifest(fixture(), { [url]: path })).toEqual({ [url]: path });
  for (const value of [{}, { [url]: '/snapshot-media/../x.jpg' }, { [url]: 'https://evil.test/a.jpg' }, { [url]: path + '?x=1' }, { [url]: path, 'https://evil.test/a.jpg': path }]) expect(() => validateMediaManifest(fixture(), value)).toThrow();
});

it('rejects swapped or aliased source URL hashes', async () => {
  const { validateMediaManifest } = await import('../../scripts/preview-v2/import-public-snapshot.mjs');
  const snapshot = fixture();
  const a = snapshot.listings[0].images[0];
  const b = 'https://trbhh.sa/media/uploads/b.jpg';
  snapshot.listings[0].images.push(b);
  expect(() => validateMediaManifest(snapshot, { [a]: localPath(a), [b]: localPath(b) })).not.toThrow();
  expect(() => validateMediaManifest(snapshot, { [a]: localPath(b), [b]: localPath(a) })).toThrow();
  expect(() => validateMediaManifest(snapshot, { [a]: localPath(a), [b]: localPath(a) })).toThrow();
});
