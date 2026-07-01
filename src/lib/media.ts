/**
 * Media resolver — unified through the app's own /media route.
 *
 * The /media/[...path] route serves the file from local storage if present,
 * otherwise proxies it from LEGACY_MEDIA_BASE (the original trbhh.com storage).
 * This lets legacy images and newly-uploaded images share one URL space, and
 * keeps everything same-origin for next/image.
 */
export const PLACEHOLDER = '/placeholder-ad.svg';

/** Resolve a stored file path (uploads.file_name / photos.photo_path). */
export function mediaUrl(path: string | null | undefined): string {
  if (!path) return PLACEHOLDER;
  if (path.startsWith('http') || path.startsWith('/')) return path;
  return `/media/${path.replace(/^\//, '')}`;
}
