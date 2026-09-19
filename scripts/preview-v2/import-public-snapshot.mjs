/** Node 24+. No network. Run after seed.mjs against trbhh_preview_v2 only.
 * Required: DATABASE_URL, TRBHH_SNAPSHOT_FILE, PREVIEW_MEDIA_MANIFEST.
 * Manifest: { originalHttpsMediaUrl: '/snapshot-media/<64-hex>.<image-ext>' }.
 * Assets are supplied separately by the media packer, not downloaded here.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { checkDatabase, guard, guardDatabaseUrl, MARKER, VERSION, reportFailure } from './seed.mjs';

// Node's type stripping loads the standalone preview validator. Keep its .ts
// import graph separate from the root Next app's TypeScript compilation.
const { validateSnapshot } = await import(new URL('../../preview-v2/lib/snapshot.ts', import.meta.url).href);

const IMPORT_MARKER = 'preview_v2_public_import';
const imagePath = /^\/snapshot-media\/[a-f0-9]{64}\.(?:jpg|jpeg|png|webp|gif|avif|heic|heif)$/;
const sha256 = value => createHash('sha256').update(value).digest('hex');

export function validateMediaManifest(snapshot, manifest) {
  guard(manifest && typeof manifest === 'object' && !Array.isArray(manifest), 'Invalid media manifest.');
  const urls = new Set(snapshot.listings.flatMap(ad => ad.images));
  guard(Object.keys(manifest).length === urls.size, 'Media manifest must cover exactly the snapshot images.');
  for (const url of urls) {
    guard(Object.hasOwn(manifest, url) && typeof manifest[url] === 'string' && imagePath.test(manifest[url]), 'Missing or unsafe local media path.');
    const filenameHash = manifest[url].slice('/snapshot-media/'.length).split('.')[0];
    guard(filenameHash === sha256(url), 'Local media filename does not match its source URL hash.');
  }
  return manifest;
}

export function planImport(raw) {
  const snapshot = validateSnapshot(raw);
  const ads = [];
  const media = [];
  const provenance = [];
  for (const ad of snapshot.listings) {
    guard(BigInt(ad.id) <= BigInt(Number.MAX_SAFE_INTEGER), 'Ad ID exceeds application precision.');
    guard(BigInt(ad.sourceCategoryId) <= 18446744073709551615n, 'Category ID exceeds database range.');
    guard(ad.sourceSubcategoryId === null || BigInt(ad.sourceSubcategoryId) <= 2147483647n, 'Subcategory ID exceeds database range.');
    guard([...ad.title].length <= 255 && Buffer.byteLength(ad.description) <= 65535
      && (ad.rentPeriod === null || [...ad.rentPeriod].length <= 20)
      && (ad.priceType === null || [...ad.priceType].length <= 191)
      && [...ad.city].length <= 191, 'Snapshot text exceeds database field limits.');
    const date = ad.time ? new Date(`${ad.time}T00:00:00.000Z`) : null;
    guard(!date || (date.getTime() >= 1000 && date.getTime() <= 2147483647000), 'Snapshot date exceeds MySQL timestamp range.');
    ads.push({ id: BigInt(ad.id), title: ad.title, detail: ad.description,
      price: ad.price, price_type: ad.priceType, rent_period: ad.rentPeriod,
      adsType: ad.intent === 'wanted' ? 'request' : 'offer', category_id: BigInt(ad.sourceCategoryId),
      subcategory_id: ad.sourceSubcategoryId === null ? null : Number(ad.sourceSubcategoryId),
      created_at: date, updated_at: null, country_id: 1, area_id: null,
      status: 1, state: 'active', adsSpecial: 'no', store_only: 0,
      phoneAllow: 0, commentAllow: 0, video_path: '', old_price: 0, cat_reviewed: 0,
    });
    media.push({ adId: BigInt(ad.id), sources: [...ad.images] });
    const v = JSON.stringify({ id: ad.id, sourceUrl: ad.sourceUrl, classificationRevision: ad.classificationRevision,
      sourceCategoryId: ad.sourceCategoryId, sourceSubcategoryId: ad.sourceSubcategoryId, time: ad.time });
    provenance.push({ k: `preview_v2_source:${ad.id}`, v });
  }
  return { snapshot, ads, media, provenance };
}

/** Exposed for fixture tests; caller must establish the guarded connection first. */
export async function importIntoDatabase(db, plan, manifest, ownerPasswordHash) {
  await checkDatabase(db);
  const mapped = validateMediaManifest(plan.snapshot, manifest);
  const digest = sha256(JSON.stringify([plan.snapshot, Object.entries(mapped).sort(([a], [b]) => a.localeCompare(b))]));
  return db.$transaction(async tx => {
    // Serialize imports on the existing seed marker; no overwrite/upsert path.
    const locks = await tx.$queryRaw`SELECT v FROM site_settings WHERE k = ${MARKER} FOR UPDATE`;
    guard(locks[0]?.v === VERSION, 'Expected V2 seed marker is missing.');
    const previous = await tx.site_settings.findUnique({ where: { k: IMPORT_MARKER } });
    if (previous) {
      let saved;
      try { saved = JSON.parse(previous.v); } catch { guard(false, 'Invalid import marker.'); }
      guard(saved.digest === digest, 'A different snapshot/media import exists; explicit replacement is required.');
      return { imported: 0, alreadyImported: true };
    }
    // Check every collision before inserting anything; unique IDs protect races too.
    const collision = await tx.ads.findFirst({ where: { id: { in: plan.ads.map(ad => ad.id) } }, select: { id: true } });
    guard(!collision, 'Ad ID collision; no source IDs will be remapped or overwritten.');
    guard(!(await tx.users.findFirst({ where: { userName: 'public-snapshot' }, select: { id: true } })), 'Snapshot owner already exists without a matching import marker.');
    const owner = await tx.users.create({ data: {
      userName: 'public-snapshot', name: 'إعلانات عامة مستوردة — حساب غير تفاعلي',
      password: ownerPasswordHash, auth_session_version: randomUUID(), type: 'user', is_admin: 0, trusted: 0,
      phoneNumber: null, phone_whatsapp: null, email: null, allow_phone: 0, whatsapp: 0,
      country_id: 1, balance: 0, balance_halala: 0,
    } });
    guard(owner.id <= 2147483647n, 'Synthetic owner ID exceeds uploads field range.');
    const cities = await tx.cities.findMany({ select: { id: true, name: true } });
    const byName = new Map(cities.map(city => [city.name, city.id]));
    for (const name of new Set(plan.snapshot.listings.map(ad => ad.city).filter(Boolean))) {
      if (!byName.has(name)) {
        const city = await tx.cities.create({ data: { name, country_id: 1, ordered: 0 } });
        byName.set(name, city.id);
      }
    }
    await tx.ads.createMany({ data: plan.ads.map((ad, i) => ({ ...ad, user_id: owner.id, profile_id: null,
      city_id: byName.get(plan.snapshot.listings[i].city) || 0n })) });
    const uploads = new Map();
    for (const [source, file_name] of Object.entries(mapped)) {
      const upload = await tx.uploads.create({ data: { file_name, file_original_name: file_name.split('/').pop(),
        extension: file_name.split('.').pop(), type: 'image', user_id: Number(owner.id) } });
      uploads.set(source, upload.id);
    }
    // Preserve snapshot image order using ascending generated photo IDs.
    for (const ad of plan.media) {
      for (const source of ad.sources) await tx.photos.create({ data: { other_id: ad.adId, photo_path: String(uploads.get(source)) } });
    }
    await tx.site_settings.createMany({ data: [
      ...plan.provenance,
      // Full SHA-256 in lowercase base36: 50 characters plus a five-character
      // prefix fits VARCHAR(60), including under case-insensitive MySQL collation.
      ...Object.entries(mapped).map(([source, localPath]) => ({ k: `pv2m:${BigInt(`0x${sha256(source)}`).toString(36).padStart(50, '0')}`, v: JSON.stringify({ source, localPath }) })),
      { k: IMPORT_MARKER, v: JSON.stringify({ digest, schemaVersion: 1, source: plan.snapshot.source,
        sourceCommit: plan.snapshot.sourceCommit, capturedAt: plan.snapshot.capturedAt, count: plan.ads.length, ownerId: String(owner.id) }) },
    ] });
    return { imported: plan.ads.length, alreadyImported: false };
  }, { timeout: 180000, maxWait: 10000 });
}

async function readJson(file, limit) {
  guard(typeof file === 'string' && file.length > 0, 'Explicit snapshot and media manifest paths are required.');
  const info = await stat(file);
  guard(info.isFile() && info.size <= limit, 'Input is not a bounded JSON file.');
  return JSON.parse(await readFile(file, 'utf8'));
}

export async function importSnapshot(env = process.env) {
  const url = guardDatabaseUrl(env.DATABASE_URL);
  const plan = planImport(await readJson(env.TRBHH_SNAPSHOT_FILE, 64 * 1024 * 1024));
  const manifest = validateMediaManifest(plan.snapshot, await readJson(env.PREVIEW_MEDIA_MANIFEST, 16 * 1024 * 1024));
  // No usable credential is returned, logged or shared with either login account.
  const ownerPasswordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
  const db = new PrismaClient({ datasources: { db: { url } }, log: [] });
  try {
    const result = await importIntoDatabase(db, plan, manifest, ownerPasswordHash);
    console.info(result.alreadyImported ? '[preview-v2-import] Already imported; no changes.' : `[preview-v2-import] Imported ${result.imported} public ads into the isolated sandbox.`);
    return result;
  } finally { await db.$disconnect(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) importSnapshot().catch(reportFailure);
