const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Hostinger preview mode backed by a SELECT-only production database user. */
export function isReadOnlyPreview(): boolean {
  return process.env.TRBHH_READ_ONLY_PREVIEW === '1';
}

/** Reject every request that could invoke a Server Action or mutating API route. */
export function readOnlyPreviewResponse(method: string): Response | null {
  if (!isReadOnlyPreview() || READ_METHODS.has(method.toUpperCase())) return null;
  return Response.json(
    { error: 'read_only_preview', message: 'هذه معاينة للقراءة فقط؛ الحفظ والشراء معطلان.' },
    { status: 405, headers: { Allow: 'GET, HEAD, OPTIONS', 'Cache-Control': 'no-store', 'X-Trbhh-Preview-Mode': 'read-only' } },
  );
}
