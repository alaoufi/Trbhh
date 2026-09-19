/** No configurable upstream: preview may read only original public media. */
export function previewMediaUrl(parts: string[]): string | null {
 if (!parts.length || parts.length > 12 || parts.some(part => !part || part === '.' || part === '..' || /[\\/%:?\x00-\x1f]/.test(part))) return null;
 if (!/\.(?:jpe?g|png|webp|gif|avif|heic|heif|mp4|webm|mov|mp3|m4a|ogg|wav)$/i.test(parts.at(-1)!)) return null;
 return `https://trbhh.sa/media/${parts.map(encodeURIComponent).join('/')}`;
}

export async function fetchPreviewMedia(parts: string[], method = 'GET'): Promise<Response> {
 const url = previewMediaUrl(parts);
 if (!url || !['GET','HEAD'].includes(method)) return new Response('Not found', {status:404});
 try {
  const upstream = await fetch(url, {method, redirect:'manual', credentials:'omit', cache:'no-store', signal:AbortSignal.timeout(10000)});
  const type=upstream.headers.get('content-type') || '';
  if (!upstream.ok || !/^(image\/(jpeg|png|webp|gif|avif)|video\/(mp4|webm|quicktime)|audio\/(mpeg|mp4|ogg|wav|x-wav))(;|$)/i.test(type)) {
   await upstream.body?.cancel();
   return new Response('Not found',{status:404});
  }
  return new Response(upstream.body,{headers:{'Content-Type':type,'Cache-Control':'public, max-age=60','X-Content-Type-Options':'nosniff'}});
 } catch {return new Response('Media unavailable',{status:502,headers:{'Cache-Control':'no-store'}});}
}
