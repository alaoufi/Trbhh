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
