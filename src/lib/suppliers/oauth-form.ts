import 'server-only';

/** OAuth forms are tiny. Bound chunked bodies as well as Content-Length. */
export async function readOAuthForm(request: Request): Promise<URLSearchParams> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/x-www-form-urlencoded')) throw Error('oauth_form_invalid');
  if (Number(request.headers.get('content-length') || 0) > 8192 || !request.body) throw Error('oauth_form_invalid');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); throw Error('oauth_form_invalid'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}
