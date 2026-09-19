import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, readdir, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {downloadMedia, mediaTarget, preparePublicMedia} from '../../scripts/preview-v2/prepare-public-media.mjs';

const source = 'https://trbhh.sa/media/uploads/a.png';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGNkAAAAASUVORK5CYII=', 'base64');
const response = () => new Response(png, {headers: {'content-type': 'image/png'}});
const snapshot = (images = [source]) => ({schemaVersion: 1, mode: 'live', source: 'https://trbhh.sa', capturedAt: '2026-09-19T10:00:00.000Z', sourceCommit: 'a'.repeat(40), count: 1, complete: true, listings: [{id: '1', title: 'Public', description: '', price: 1, priceType: null, rentPeriod: null, city: '', seller: 'Public', verified: false, condition: '', specs: [], category: '', subcategory: '', classificationRevision: 'b'.repeat(64), sourceUrl: 'https://trbhh.sa/ads/1', time: '', images, image: images[0] || '/placeholder-ad.svg', intent: 'offer', sourceCategoryId: '0', sourceSubcategoryId: null}]});

test('fixed origin, traversal and extension allowlist; deterministic URL mapping', () => {
  const hash = createHash('sha256').update(source).digest('hex');
  assert.equal(mediaTarget(source).publicPath, `/snapshot-media/${hash}.png`);
  for (const value of ['https://evil.test/media/a.png', 'https://trbhh.com/media/a.png', 'https://trbhh.sa:443/media/a.png', 'https://x:y@trbhh.sa/media/a.png', 'https://trbhh.sa/media/../a.png', 'https://trbhh.sa/media/%2e%2e/a.png', 'https://trbhh.sa/media/%252e%252e/a.png', 'https://trbhh.sa/media/a%2fb.png', 'https://trbhh.sa/media/a.png?secret=1', 'https://trbhh.sa/media/a.svg', 'https://trbhh.sa/media/a.html']) assert.throws(() => mediaTarget(value));
});

test('GET has no credentials and refuses redirects without following Location', async () => {
  let calls = 0;
  await assert.rejects(downloadMedia(source, {fetchImpl: async (url, options) => {
    calls++; assert.equal(url, source); assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit'); assert.equal(options.method, 'GET');
    assert.equal(Object.keys(options.headers).some(key => /cookie|authorization/i.test(key)), false);
    return new Response(null, {status: 302, headers: {location: 'https://evil.test/private'}});
  }}));
  assert.equal(calls, 1);
});

test('requires matching response MIME and binary signature', async () => {
  assert.deepEqual((await downloadMedia(source, {fetchImpl: async () => response()})).bytes, png);
  for (const fake of [new Response('<html/>', {headers: {'content-type': 'image/png'}}), new Response(png, {headers: {'content-type': 'text/html'}}), new Response(png, {status: 404})]) {
    await assert.rejects(downloadMedia(source, {fetchImpl: async () => fake}));
  }
});

test('bounds declared and streamed bodies and aborts timed-out requests', async () => {
  await assert.rejects(downloadMedia(source, {maxBytes: 8, fetchImpl: async () => response()}), /limit/);
  await assert.rejects(downloadMedia(source, {fetchImpl: async () => new Response(png, {headers: {'content-type': 'image/png', 'content-length': '999999999'}})}), /limit/);
  await assert.rejects(downloadMedia(source, {timeoutMs: 10, fetchImpl: async (_, {signal}) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), {once: true}))}), /aborted/);
});

test('video URLs in the images array are supported rather than skipped', async () => {
  const bytes = Buffer.alloc(24);
  bytes.writeUInt32BE(24); bytes.write('ftyp', 4); bytes.write('isom', 8); bytes.write('isommp42', 16);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'trbhh-media-video-'));
  const url = 'https://trbhh.sa/media/original.mp4';
  const result = await preparePublicMedia(snapshot([url]), directory, {fetchImpl: async () => new Response(bytes, {headers: {'content-type': 'video/mp4'}})});
  assert.equal(result.files, 1);
  assert.deepEqual(await readFile(path.join(directory, 'snapshot-media', mediaTarget(url).filename)), bytes);
});

test('HEIC originals and converted suffix mismatches use validated bytes without skipping', async () => {
  const url = 'https://trbhh.sa/media/original.heic';
  const bytes = Buffer.alloc(24);
  bytes.writeUInt32BE(24); bytes.write('ftyp', 4); bytes.write('heic', 8); bytes.write('mif1heic', 16);
  const original = await downloadMedia(url, {fetchImpl: async () => new Response(bytes, {headers: {'content-type': 'image/heic'}})});
  assert.ok(original.filename.endsWith('.heic')); assert.deepEqual(original.bytes, bytes);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'trbhh-media-suffix-'));
  await preparePublicMedia(snapshot([url]), directory, {fetchImpl: async () => response()});
  const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  assert.equal(manifest[url], mediaTarget(url, 'image/png').publicPath);
  assert.deepEqual(await readFile(path.join(directory, 'snapshot-media', mediaTarget(url, 'image/png').filename)), png);
  await assert.rejects(downloadMedia(url, {fetchImpl: async () => new Response(bytes, {headers: {'content-type': 'image/png'}})}), /signature/);
});

test('packs every array image, deduplicates, caps concurrency and is idempotent without touching input', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'trbhh-media-test-'));
  const urls = Array.from({length: 7}, (_, i) => `https://trbhh.sa/media/${i}.png`);
  const value = snapshot([...urls, urls[0]]), before = JSON.stringify(value);
  let active = 0, peak = 0, calls = 0;
  const fetchImpl = async () => {
    calls++; active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 2)); active--; return response();
  };
  const result = await preparePublicMedia(value, directory, {fetchImpl});
  assert.equal(result.files, 7); assert.equal(calls, 7); assert.ok(peak <= 4);
  assert.equal(JSON.stringify(value), before);
  const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest, Object.fromEntries(urls.map(url => [url, mediaTarget(url).publicPath])));
  for (const url of urls) assert.deepEqual(await readFile(path.join(directory, 'snapshot-media', mediaTarget(url).filename)), png);
  await preparePublicMedia(value, directory, {fetchImpl});
  assert.equal((await readdir(path.join(directory, 'snapshot-media'))).length, 7);
});

test('failure creates no success manifest, never replaces conflicting files, rejects invalid snapshot before fetch', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'trbhh-media-failure-'));
  await assert.rejects(preparePublicMedia(snapshot(), directory, {fetchImpl: async () => new Response(null, {status: 302})}));
  await assert.rejects(readFile(path.join(directory, 'manifest.json')), {code: 'ENOENT'});
  const target = path.join(directory, 'snapshot-media', mediaTarget(source).filename);
  await writeFile(target, 'user-owned');
  await assert.rejects(preparePublicMedia(snapshot(), directory, {fetchImpl: async () => response()}));
  assert.equal(await readFile(target, 'utf8'), 'user-owned');
  let calls = 0;
  await assert.rejects(preparePublicMedia({...snapshot(), complete: false}, directory, {fetchImpl: async () => { calls++; return response(); }}));
  assert.equal(calls, 0);
});

test('empty arrays produce an empty mapping and total pack size is bounded', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'trbhh-media-empty-'));
  assert.equal((await preparePublicMedia(snapshot([]), directory, {fetchImpl: async () => { throw new Error('Unexpected request'); }})).files, 0);
  assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')), {});
  const limited = await mkdtemp(path.join(os.tmpdir(), 'trbhh-media-limit-'));
  await assert.rejects(preparePublicMedia(snapshot(), limited, {maxTotalBytes: 1, fetchImpl: async () => response()}));
  await assert.rejects(readFile(path.join(limited, 'manifest.json')), {code: 'ENOENT'});
});

test('transient network failures retry within a fixed budget, MIME failures do not retry', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'trbhh-media-retry-'));
  let calls = 0;
  await preparePublicMedia(snapshot(), directory, {fetchImpl: async () => {if (++calls < 3) throw new TypeError('fetch failed'); return response();}});
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(preparePublicMedia(snapshot(), directory, {fetchImpl: async () => {calls++; throw new TypeError('fetch failed');}}));
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(preparePublicMedia(snapshot(), directory, {fetchImpl: async () => {calls++; return new Response('invalid', {headers: {'content-type':'text/html'}});}}));
  assert.equal(calls, 1);
});
