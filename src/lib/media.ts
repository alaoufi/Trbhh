/**
 * Media resolver.
 *
 * The original platform stores each file's path in the `uploads` table
 * (e.g. "category/xxx.webp", "setting/xxx.webp") and serves it from the site
 * root. Ad photos live under "uploads/<name>".
 *
 * NEXT_PUBLIC_MEDIA_BASE controls where media is served from:
 *   - during migration/testing it points at the original site (https://trbhh.com)
 *   - in production on the VPS, point it at your own domain / object storage
 *     after copying the storage folder over.
 */
const BASE = (process.env.NEXT_PUBLIC_MEDIA_BASE || 'https://trbhh.com').replace(/\/$/, '');

export const PLACEHOLDER = '/placeholder-ad.svg';

/** Resolve a stored file path (from uploads.file_name / photos.photo_path). */
export function mediaUrl(path: string | null | undefined): string {
  if (!path) return PLACEHOLDER;
  if (path.startsWith('http')) return path;
  return `${BASE}/${path.replace(/^\//, '')}`;
}

/** Resolve an ad image filename that lives under /uploads/. */
export function adImageUrl(fileName: string | null | undefined): string {
  if (!fileName) return PLACEHOLDER;
  if (fileName.startsWith('http')) return fileName;
  if (fileName.includes('/')) return mediaUrl(fileName);
  return `${BASE}/uploads/${fileName}`;
}
