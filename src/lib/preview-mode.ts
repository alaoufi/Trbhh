/** Server-controlled isolation switch; never inferred from cookies or headers. */
export function isPreviewReadOnly(raw = process.env.PREVIEW_READ_ONLY): boolean {
  return raw === 'true';
}

const PAGES = new Set([
  '/', '/search', '/requests', '/ads/new', '/seller', '/guide', '/guide/store',
  '/guide/how', '/guide/how/add-ad', '/guide/how/open-store', '/guide/how/topup',
  '/guide/how/verify', '/guide/how/feature-ad', '/guide/how/ad-boost', '/robots.txt',
]);
const ASSETS = new Set([
  '/favicon.ico', '/logo-header.png', '/placeholder-ad.svg', '/apple-icon.png',
  '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png',
]);

function safePath(path: string): boolean {
  return path.startsWith('/') && !/[%\\\s\x00-\x1f\x7f]/.test(path)
    && !path.includes('//') && !path.split('/').some(part => part === '.' || part === '..');
}

function publicImage(path: string): boolean {
  return safePath(path) && (ASSETS.has(path)
    || /^\/media\/(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:jpg|jpeg|png|webp|gif|avif|heic|heif|mp4|webm|mp3|m4a|ogg|wav)$/i.test(path));
}

/** Accept a raw origin-relative request target, before URL normalization. */
export function previewRequestAllowed(method: string, target: string): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false;
  const question = target.indexOf('?');
  const path = question < 0 ? target : target.slice(0, question);
  if (!safePath(path) || target.includes('#')) return false;
  const page = path.length > 1 ? path.replace(/\/$/, '') : path;
  if (PAGES.has(page) || /^\/ads\/[1-9]\d*$/.test(page)) return true;
  if (publicImage(path)) return true;
  if (/^\/_next\/static\/(?:[A-Za-z0-9_@().-]+\/)*[A-Za-z0-9_@().-]+\.(?:js|css|woff|woff2|ttf|png|jpg|webp|svg)$/.test(path)) return true;
  if (path === '/_next/image') {
    const params = new URLSearchParams(question < 0 ? '' : target.slice(question + 1));
    return params.getAll('url').length === 1 && publicImage(params.get('url') || '');
  }
  return false;
}
