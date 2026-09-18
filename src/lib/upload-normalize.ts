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
 * Sniff the REAL image container from the file's magic bytes — the extension
 * can lie (iPhone HEIC photos are frequently uploaded with a `.jpg` name, and
 * such a file renders nowhere because its bytes are HEIC, not JPEG).
 */
export function sniffImage(buf: Buffer): 'jpg' | 'png' | 'gif' | 'webp' | 'heic' | 'other' {
  if (buf.length < 12) return 'other';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif'; // GIF8
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 // RIFF
      && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'webp'; // WEBP
  // ISO-BMFF «ftyp» box — HEIC/HEIF brands produced by iPhones and others
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) { // "ftyp"
    const brand = buf.toString('latin1', 8, 12);
    if (['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1', 'heif'].includes(brand)) return 'heic';
  }
  return 'other';
}

/** True when the bytes are a HEIC/HEIF image (helper for on-the-fly serving). */
export function isHeicBytes(buf: Buffer): boolean {
  return sniffImage(buf) === 'heic';
}

/**
 * Decode HEIC/HEIF bytes to JPEG. libheif's prebuilt (sharp) on the server
 * lacks the HEVC decoder, so we use `heic-convert` (bundled libheif WASM with
 * decoder) then re-encode through sharp for orientation + sane quality.
 * Returns null if decoding fails.
 */
async function heicToJpeg(buf: Buffer): Promise<Buffer | null> {
  try {
    const convert = (await import('heic-convert')).default;
    const jpg = await convert({ buffer: buf, format: 'JPEG', quality: 0.9 });
    const jpgBuf = Buffer.from(jpg);
    try {
      const sharp = (await import('sharp')).default;
      return await sharp(jpgBuf, { failOn: 'none' }).rotate().jpeg({ quality: 85 }).toBuffer();
    } catch {
      return jpgBuf; // sharp غير متاح — بايتات JPEG الناتجة تكفي للعرض
    }
  } catch {
    return null;
  }
}

/** Convert HEIC/HEIF bytes to displayable JPEG bytes, or null if not HEIC / fails. */
export async function heicBytesToJpeg(buf: Buffer): Promise<Buffer | null> {
  if (!isHeicBytes(buf)) return null;
  return heicToJpeg(buf);
}

/**
 * Guarantee an uploaded file is stored in a form the browser can actually show.
 *
 * We sniff the REAL bytes (not the extension): a `.jpg` whose bytes are HEIC is
 * still HEIC and renders nowhere, so it must be converted. This normalizer:
 *   • keeps PDFs untouched (documents: receipts, IDs, name-change proof),
 *   • keeps genuinely web-safe images (jpg/png/webp/gif — by MAGIC BYTES) as-is,
 *   • converts HEIC/HEIF (iPhone) to JPEG via heic-convert,
 *   • re-encodes anything else (bmp/tiff/unknown) to JPEG via sharp.
 *
 * Returns `{ buf, ext }` where `ext` MUST be used both for the stored filename
 * and the `uploads.extension` column. Never throws — on any failure it returns
 * the original bytes with a sanitized extension (best effort).
 */
export async function normalizeUpload(buf: Buffer, ext: string): Promise<{ buf: Buffer; ext: string }> {
  const e = (ext || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
  if (e === 'pdf' || isPdf(buf)) return { buf, ext: 'pdf' };

  const kind = sniffImage(buf);

  // صيغة يعرضها المتصفّح مباشرةً — احفظها كما هي بامتداد يطابق بصمتها الحقيقية
  if (kind === 'jpg') return { buf, ext: 'jpg' };
  if (kind === 'png') return { buf, ext: 'png' };
  if (kind === 'gif') return { buf, ext: 'gif' };
  if (kind === 'webp') return { buf, ext: 'webp' };

  // HEIC/HEIF (آيفون) — لا تعرضها المتصفّحات؛ حوّلها إلى JPEG فعليّاً
  if (kind === 'heic') {
    const jpg = await heicToJpeg(buf);
    if (jpg) return { buf: jpg, ext: 'jpg' };
    // فشل الفكّ (ملف تالف) — أعِد المحاولة عبر sharp كحلٍّ أخير
    try {
      const sharp = (await import('sharp')).default;
      const out = await sharp(buf, { failOn: 'none' }).rotate().jpeg({ quality: 85 }).toBuffer();
      return { buf: out, ext: 'jpg' };
    } catch {
      return { buf, ext: 'jpg' };
    }
  }

  // امتداد آمن لكن البصمة غير معروفة (نادر) — احترم الامتداد الآمن كما كان
  if (WEB_SAFE.has(e)) return { buf, ext: e === 'jpeg' ? 'jpg' : e };

  // bmp/tiff/غير معروف — أعِد الترميز عبر sharp إلى JPEG
  try {
    const sharp = (await import('sharp')).default;
    const out = await sharp(buf, { failOn: 'none' }).rotate().jpeg({ quality: 85 }).toBuffer();
    return { buf: out, ext: 'jpg' };
  } catch {
    return { buf, ext: e || 'jpg' };
  }
}
