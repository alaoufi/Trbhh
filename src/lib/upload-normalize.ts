import 'server-only';

/** Extensions every browser can display directly (served with a real image
 *  Content-Type by /media). Animated GIFs are kept as-is to preserve motion. */
const WEB_SAFE = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

/** True if the bytes start with the PDF magic header (%PDF), regardless of the
 *  claimed extension. */
function isPdf(buf: Buffer): boolean {
  return buf.length > 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
}

/**
 * Guarantee an uploaded file is stored in a form the browser can actually show.
 *
 * The `/media` route derives Content-Type from the file EXTENSION, so a file
 * saved with an unknown extension (e.g. an iPhone `.heic`) is served as
 * `application/octet-stream` and silently fails to render. This normalizer:
 *   • keeps PDFs untouched (documents: receipts, IDs, name-change proof),
 *   • keeps already web-safe images (jpg/png/webp/gif) as-is,
 *   • re-encodes everything else (HEIC/HEIF/bmp/tiff/unknown) to JPEG.
 *
 * Returns `{ buf, ext }` where `ext` MUST be used both for the stored filename
 * and the `uploads.extension` column. Never throws — on any failure it returns
 * the original bytes with a sanitized extension (best effort).
 */
export async function normalizeUpload(buf: Buffer, ext: string): Promise<{ buf: Buffer; ext: string }> {
  const e = (ext || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
  if (e === 'pdf' || isPdf(buf)) return { buf, ext: 'pdf' };
  if (WEB_SAFE.has(e)) return { buf, ext: e };
  try {
    const sharp = (await import('sharp')).default;
    const out = await sharp(buf, { failOn: 'none' }).rotate().jpeg({ quality: 85 }).toBuffer();
    return { buf: out, ext: 'jpg' };
  } catch {
    return { buf, ext: e || 'jpg' };
  }
}
