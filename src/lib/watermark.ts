import 'server-only';
import sharp from 'sharp';

/**
 * Burn a "تربح" watermark into an uploaded image (copyright protection),
 * and auto-orient/clean it. Returns the original buffer on any failure.
 */
export async function watermarkImage(buf: Buffer, ext: string): Promise<Buffer> {
  try {
    // Downscale first: large phone photos (e.g. 4000×3000) are slow to process and
    // can hang the request. Resizing to ≤1600px keeps it fast and low on memory.
    const resized = await sharp(buf, { failOn: 'none' })
      .rotate() // respect EXIF orientation
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
    if (ext === 'png') out = out.png();
    else if (ext === 'webp') out = out.webp();
    else out = out.jpeg({ quality: 86 });
    return await out.toBuffer();
  } catch {
    return buf;
  }
}
