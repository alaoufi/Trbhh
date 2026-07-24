import 'server-only';

const TIMEOUT_MS = 8000; // never let image processing hang a publish request

export type WatermarkResult = { buf: Buffer; ext: string };

/** Canonical, browser-displayable output format for a given input extension.
 *  Anything that isn't png/webp is re-encoded to JPEG — so HEIC/HEIF (iPhone),
 *  gif, bmp, tiff… all become a format every browser can render. The stored
 *  file MUST carry this extension, otherwise it is served as
 *  `application/octet-stream` and the image silently fails to display. */
function outFormat(ext: string): 'png' | 'webp' | 'jpg' {
  return ext === 'png' ? 'png' : ext === 'webp' ? 'webp' : 'jpg';
}

/**
 * Burn a "تربح" watermark into an uploaded image (copyright protection),
 * auto-orient and downscale it. Returns { buf, ext } where `ext` is the ACTUAL
 * format of the returned bytes — callers must store the file with this
 * extension so the served Content-Type matches the bytes. Never hangs/crashes:
 * on any failure or timeout it falls back to a plain re-encode, and only as a
 * last resort returns the original bytes with the original extension.
 */
export async function watermarkImage(buf: Buffer, ext: string): Promise<WatermarkResult> {
  const target = outFormat(ext);
  const original: WatermarkResult = { buf, ext };

  const work = (async (): Promise<WatermarkResult> => {
    // dynamic import so a missing/broken native sharp binary degrades gracefully
    const sharp = (await import('sharp')).default;
    // Downscale first: large phone photos (e.g. 4000×3000) are slow and memory-heavy.
    const resized = await sharp(buf, { failOn: 'none' })
      .rotate()
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .toBuffer();
    const base = sharp(resized, { failOn: 'none' });
    const meta = await base.metadata();
    const w = meta.width || 800;
    const h = meta.height || 800;
    const fs = Math.max(18, Math.round(Math.min(w, h) * 0.075));
    const pad = Math.round(fs * 0.55);
    const stroke = Math.max(1, fs * 0.03);
    const svg = Buffer.from(
      `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">` +
      `<text x="${w - pad}" y="${h - pad}" text-anchor="end" ` +
      `font-family="Cairo, Amiri, 'Noto Sans Arabic', DejaVu Sans, sans-serif" font-size="${fs}" font-weight="700" ` +
      `fill="#ffffff" fill-opacity="0.7" stroke="#0b2a4a" stroke-opacity="0.28" stroke-width="${stroke}">تربح</text>` +
      `</svg>`,
    );
    let out = base.composite([{ input: svg, top: 0, left: 0 }]);
    if (target === 'png') out = out.png();
    else if (target === 'webp') out = out.webp();
    else out = out.jpeg({ quality: 82 });
    return { buf: await out.toBuffer(), ext: target };
  })();

  // If the full pipeline throws, still guarantee displayable bytes by re-encoding
  // (no watermark) to the target format — the resulting bytes then match `ext`.
  const safe = work.catch(async (): Promise<WatermarkResult> => {
    try {
      const sharp = (await import('sharp')).default;
      const s = sharp(buf, { failOn: 'none' }).rotate();
      const b = target === 'png' ? await s.png().toBuffer()
        : target === 'webp' ? await s.webp().toBuffer()
        : await s.jpeg({ quality: 82 }).toBuffer();
      return { buf: b, ext: target };
    } catch {
      return original; // truly undecodable — store as-is (best effort)
    }
  });

  const timeout = new Promise<WatermarkResult>((resolve) => setTimeout(() => resolve(original), TIMEOUT_MS));
  try {
    return await Promise.race([safe, timeout]);
  } catch {
    return original;
  }
}
