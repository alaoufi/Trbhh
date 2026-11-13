import 'server-only';
/** The authorization path and filesystem path must identify the same file.
 * Reject aliases instead of normalizing after the private-document check. */
export function isCanonicalMediaPath(fileName:string):boolean{
  if(!fileName||/[\\\\\x00-\x1f\x7f]/.test(fileName)||/%[0-9a-f]{2}/i.test(fileName))return false;
  return fileName.split('/').every(segment=>!!segment&&segment!=='.'&&segment!=='..'&&!segment.includes(':'));
}

/** Verification uploads contain identity and business documents, never public media. */
export function isProtectedUploadType(type: string | null | undefined): boolean {
  return typeof type === 'string' && type.startsWith('verify_');
}

/** Avoid a database lookup for ordinary public ad media on the hot path. */
export function isPotentiallyProtectedUploadPath(fileName: string): boolean {
  return /^uploads\/verify_[^/]+$/i.test(fileName);
}

/** مستندات خاصة تُسمّى برقم صاحبها: إيصال شحن الرصيد وإثبات تغيير الاسم. تُعرض لصاحبها
 *  أو لمشرف له صلاحية القسم فقط — لا لأي زائر يعرف أو يخمّن الرابط. */
export function privateOwnerDocument(fileName: string): { kind: 'topup' | 'namechg'; ownerId: number } | null {
  const m = /^uploads\/(topup|namechg)_(\d{1,15})_[^/]+$/i.exec(fileName);
  return m ? { kind: m[1].toLowerCase() as 'topup' | 'namechg', ownerId: Number(m[2]) } : null;
}

/** ما يُخدَّم من مجلد التخزين: الوسائط فقط. النسخ الاحتياطية وأي نوع آخر لا تُخدَّم إطلاقاً. */
const SERVABLE_EXT = new Set(['jfif', 'ico', 'webp', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'avif', 'heic', 'heif', 'bmp', 'tif', 'tiff', 'pdf',
  'mp4', 'mov', 'm4v', 'webm', 'mkv', '3gp', 'ogg', 'mp3', 'm4a', 'wav']);
export function isServableMediaPath(fileName: string): boolean {
  const first = fileName.split('/')[0].toLowerCase();
  if (first === 'backups' || first.startsWith('.')) return false;
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return fileName.includes('.') && SERVABLE_EXT.has(ext);
}
