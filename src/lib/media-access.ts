import 'server-only';

/** Verification uploads contain identity and business documents, never public media. */
export function isProtectedUploadType(type: string | null | undefined): boolean {
  return typeof type === 'string' && type.startsWith('verify_');
}

/** Avoid a database lookup for ordinary public ad media on the hot path. */
export function isPotentiallyProtectedUploadPath(fileName: string): boolean {
  return /^uploads\/verify_[^/]+$/i.test(fileName);
}
