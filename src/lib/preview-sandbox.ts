import { previewRequestAllowed } from './preview-mode';

export function isPreviewSandbox(): boolean { return process.env.PREVIEW_SANDBOX === 'true'; }
export function assertSandboxDatabase(raw: string): void {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('Invalid sandbox database'); }
  if (url.protocol !== 'mysql:' || !['preview-db', 'localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || url.pathname !== '/trbhh_preview_v2' || url.hash
    || [...url.searchParams.keys()].some(k => !['connection_limit', 'pool_timeout', 'connect_timeout'].includes(k))) {
    throw new Error('Invalid sandbox database');
  }
}

export function sandboxRequestAllowed(method: string, target: string): boolean {
  const image = /^\/snapshot-media\/[a-f0-9]{64}\.(?:jpg|jpeg|png|webp|gif|avif|heic|heif)$/;
  if (method === 'GET' || method === 'HEAD') {
    if (image.test(target.split('?')[0])) return true;
    if (target.startsWith('/_next/image?')) {
      const params = new URLSearchParams(target.slice(target.indexOf('?')+1));
      if (params.getAll('url').length === 1 && image.test(params.get('url') || '')) return true;
    }
  }
  const path = target.split('?')[0].replace(/\/$/, '');
  if (path === '/field-settings') return ['GET', 'HEAD'].includes(method);
  if (path === '/login' || path === '/preview-login') return ['GET', 'HEAD'].includes(method);
  if (path === '/api/preview-login') return method === 'POST';
  if (path === '/logout') return ['GET', 'POST'].includes(method);
  if (path === '/api/preview-state') return ['GET', 'PUT'].includes(method);
  return previewRequestAllowed(method, target);
}

export function sandboxSameOrigin(request: Request): boolean {
  try {
    const origin = new URL(request.headers.get('origin') || '');
    return ['https:','http:'].includes(origin.protocol) && origin.host === request.headers.get('host')
      && (origin.protocol === 'https:' || ['127.0.0.1','localhost','[::1]'].includes(origin.hostname));
  } catch { return false; }
}

export const SANDBOX_KEYS = ['seller-ads-v1', 'ad-draft-v1', 'field-settings-v1'] as const;
export type SandboxKey = typeof SANDBOX_KEYS[number];
export const SANDBOX_BODY_LIMIT = 20 * 1024 * 1024;
export function parseSandboxWrite(raw: unknown): {ownerId: number; key: SandboxKey; value: unknown; revision: number} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid state');
  const {ownerId, key, value, revision} = raw as Record<string, unknown>;
  if (!Number.isSafeInteger(ownerId) || Number(ownerId) <= 0) throw new Error('Invalid owner');
  if (!SANDBOX_KEYS.includes(key as SandboxKey) || !Number.isSafeInteger(revision) || Number(revision) < 0 || value === undefined) throw new Error('Invalid state');
  if (key === 'seller-ads-v1' && (!Array.isArray(value) || value.length > 100)) throw new Error('Invalid advertisements');
  if (key !== 'seller-ads-v1' && value !== null && (typeof value !== 'object' || Array.isArray(value))) throw new Error('Invalid state');
  return {ownerId: Number(ownerId), key: key as SandboxKey, value, revision: Number(revision)};
}
