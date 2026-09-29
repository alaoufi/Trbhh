const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const LOGIN_ACTION_PATHS = new Set(['/login', '/store-login']);

/** Hostinger preview mode backed by a SELECT-only production database user. */
export function isReadOnlyPreview(): boolean {
  return process.env.TRBHH_READ_ONLY_PREVIEW === '1';
}

/** Reject every write except login, whose preview path only reads MySQL and writes its cookie/rate limit to Redis. */
export function readOnlyPreviewResponse(method: string, pathname = ''): Response | null {
  const normalizedMethod = method.toUpperCase();
  if (!isReadOnlyPreview() || READ_METHODS.has(normalizedMethod)) return null;
  if (normalizedMethod === 'POST' && LOGIN_ACTION_PATHS.has(pathname)) return null;
  return Response.json(
    { error: 'read_only_preview', message: 'هذه معاينة للقراءة فقط؛ الحفظ والشراء معطلان.' },
    { status: 405, headers: { Allow: 'GET, HEAD, OPTIONS', 'Cache-Control': 'no-store', 'X-Trbhh-Preview-Mode': 'read-only' } },
  );
}
