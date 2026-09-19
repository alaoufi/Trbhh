import {createHash} from 'node:crypto';
import {lstat, mkdir, open, readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateSnapshot} from '../../preview-v2/lib/snapshot.ts';

const MiB = 1024 * 1024;
const TYPES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
  mp4: 'video/mp4', webm: 'video/webm',
  heic: 'image/heic', heif: 'image/heif',
};
export function mediaTarget(source, detectedMime) {
  // Require the literal canonical origin; reject encoded separators and traversal
  // before URL normalization can conceal them. No alternate hosts or query strings.
  if (typeof source !== 'string' || !source.startsWith('https://trbhh.sa/media/') ||
      /[\s\\\x00-\x1f\x7f]/.test(source) || /%(?:2e|2f|5c|25)/i.test(source)) {
    throw new Error('Invalid original media URL');
  }
  const url = new URL(source);
  const decoded = decodeURIComponent(url.pathname);
  if (url.origin !== 'https://trbhh.sa' || url.username || url.password || url.search || url.hash ||
      /[\\\x00-\x1f\x7f]/.test(decoded) || decoded.split('/').some(part => part === '.' || part === '..') || url.href !== source) {
    throw new Error('Invalid original media URL');
  }
  let extension = path.posix.extname(url.pathname).slice(1).toLowerCase();
  if (!Object.hasOwn(TYPES, extension)) throw new Error('Unsupported original media extension');
  if (detectedMime && TYPES[extension] !== detectedMime) {
    extension = Object.keys(TYPES).find(key => TYPES[key] === detectedMime);
    if (!extension) throw new Error('Unsupported detected media type');
  }
  const filename = `${createHash('sha256').update(source).digest('hex')}.${extension}`;
  return {filename, mime: TYPES[extension], publicPath: `/snapshot-media/${filename}`};
}

function actualMime(bytes) {
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) return 'image/gif';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (bytes.length >= 16 && bytes.toString('ascii', 4, 8) === 'ftyp') {
    const end = bytes.readUInt32BE(0);
    if (end < 16 || end > bytes.length || end > 4096) return null;
    const brands = [bytes.toString('ascii', 8, 12)];
    for (let i = 16; i + 4 <= end; i += 4) brands.push(bytes.toString('ascii', i, i + 4));
    if (brands.some(b => ['avif', 'avis'].includes(b))) return 'image/avif';
    if (brands.some(b => ['heic', 'heix', 'hevc', 'hevx'].includes(b))) return 'image/heic';
    if (brands.includes('mif1')) return 'image/heif';
    if (brands.some(b => ['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V '].includes(b))) return 'video/mp4';
  }
  if (bytes.subarray(0, 4).equals(Buffer.from([26,69,223,163])) &&
      bytes.subarray(4, 4096).includes(Buffer.from([66,130,132,119,101,98,109]))) return 'video/webm';
  return null;
}

export async function downloadMedia(source, {fetchImpl = globalThis.fetch, maxBytes = 20 * MiB, timeoutMs = 30000} = {}) {
  mediaTarget(source);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 20 * MiB ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new Error('Invalid download limits');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(source, {
      method: 'GET', redirect: 'error', credentials: 'omit',
      headers: {Accept: [...new Set(Object.values(TYPES))].join(', '), 'Accept-Encoding': 'identity'}, signal: controller.signal,
    });
    if ([429, 502, 503, 504].includes(response.status)) throw Object.assign(new Error('Transient media response'), {code: 'MEDIA_TRANSIENT'});
    if (response.status !== 200 || response.redirected || (response.url && response.url !== source)) throw new Error('Media request rejected');
    const declaredMime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (!Object.values(TYPES).includes(declaredMime)) throw new Error('Media MIME mismatch');
    const size = response.headers.get('content-length');
    if (size !== null && (!/^\d+$/.test(size) || Number(size) > maxBytes)) throw new Error('Media body exceeds limit');
    if (!response.body) throw new Error('Missing media body');
    const chunks = [];
    let total = 0;
    for await (const chunk of response.body) {
      total += chunk.byteLength;
      if (total > maxBytes) throw new Error('Media body exceeds limit');
      chunks.push(Buffer.from(chunk));
    }
    const bytes = Buffer.concat(chunks, total);
    const detectedMime = actualMime(bytes);
    if (detectedMime !== declaredMime) throw new Error('Media signature mismatch');
    return {...mediaTarget(source, detectedMime), bytes};
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

async function safeDirectory(directory) {
  const absolute = path.resolve(directory);
  const root = path.parse(absolute).root;
  let current = root;
  for (const component of absolute.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    await mkdir(current).catch(error => { if (error.code !== 'EEXIST') throw error; });
    const stat = await lstat(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Unsafe staging directory');
  }
  return absolute;
}

async function writeOwned(file, bytes) {
  let handle;
  try {
    handle = await open(file, 'wx', 0o600);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const stat = await lstat(file);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size !== bytes.length ||
        !(await readFile(file)).equals(bytes)) throw new Error('Existing staging file conflicts');
    return;
  }
  try { await handle.writeFile(bytes); } finally { await handle.close(); }
}

export async function preparePublicMedia(snapshot, output, {fetchImpl = globalThis.fetch, concurrency = 4, maxTotalBytes = 1024 * MiB} = {}) {
  const validated = validateSnapshot(snapshot);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4 ||
      !Number.isSafeInteger(maxTotalBytes) || maxTotalBytes < 1 || maxTotalBytes > 1024 * MiB) throw new Error('Invalid packing limits');
  const sources = [...new Set(validated.listings.flatMap(ad => ad.images))].sort();
  if (sources.length > 10000) throw new Error('Too many media files');
  sources.forEach(source => mediaTarget(source));
  const mapped = new Map();
  const directory = await safeDirectory(output);
  const mediaDirectory = await safeDirectory(path.join(directory, 'snapshot-media'));
  let cursor = 0, bytes = 0, failed = false;
  const workers = Array.from({length: concurrency}, async () => {
    try {
      while (!failed && cursor < sources.length) {
        const source = sources[cursor++];
        let media;
        for (let attempt = 0; attempt < 3; attempt++) {
          try { media = await downloadMedia(source, {fetchImpl}); break; }
          catch (error) {
            const transient = error.code === 'MEDIA_TRANSIENT' || error.name === 'AbortError' || error.name === 'TimeoutError' || error instanceof TypeError;
            if (!transient || attempt === 2) throw error;
            await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
          }
        }
        bytes += media.bytes.length;
        if (bytes > maxTotalBytes) throw new Error('Media pack exceeds total limit');
        if (failed) return;
        await writeOwned(path.join(mediaDirectory, media.filename), media.bytes);
        mapped.set(source, media.publicPath);
      }
    } catch (error) { failed = true; throw error; }
  });
  const results = await Promise.allSettled(workers);
  const rejection = results.find(result => result.status === 'rejected');
  if (rejection) {
    const safeReasons = ['Media MIME mismatch', 'Media signature mismatch', 'Media body exceeds limit', 'Media request rejected', 'Media pack exceeds total limit', 'Existing staging file conflicts'];
    const reason = safeReasons.includes(rejection.reason?.message) ? rejection.reason.message : 'request or staging failure';
    throw Object.assign(new Error('Media packing failed; staging is incomplete'), {safeReason: reason});
  }
  // Publish only after every URL succeeds. Never overwrite a different manifest.
  const manifest = Object.fromEntries(sources.map(source => [source, mapped.get(source)]));
  await writeOwned(path.join(directory, 'manifest.json'), Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
  return {files: sources.length, bytes, listings: validated.count};
}

async function main() {
  const [input, output, ...extra] = process.argv.slice(2);
  if (!input || !output || extra.length) throw new Error('Usage: node scripts/preview-v2/prepare-public-media.mjs <snapshot.json> <staging-directory>');
  const stat = await lstat(input);
  if (!stat.isFile() || stat.size > 32 * MiB) throw new Error('Invalid snapshot input');
  const result = await preparePublicMedia(JSON.parse(await readFile(input, 'utf8')), output);
  console.log(JSON.stringify(result));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error('Public media packing failed; no activation permitted.', error.safeReason || 'Check input, staging, media types and limits.'); process.exitCode = 1; });
}
