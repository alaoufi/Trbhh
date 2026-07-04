// Generate all app/store icons from the master logo (public/logo.png 2048²).
// The hexagon MARK is cropped clean from the master (logo-icon.png has crop
// artifacts), then composed onto correctly-sized canvases:
//   - Play store icon 1024² (solid bg, no alpha, no rounded corners)
//   - Play feature graphic 1024×500 (mark + wordmark)
//   - PWA icons 512/192 + a REAL maskable 512 (mark inside the 80% safe zone)
//   - Apple touch icon 180 (solid bg)
//   - Optimized 256px header mark (replaces the 545KB logo-icon at 44px)
// Usage: node scripts/make-icons.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const SRC = 'public/logo.png';
mkdirSync('public/play', { recursive: true });

// Clean crops measured on the 2048² master.
const MARK = { left: 595, top: 135, width: 813, height: 880 }; // hexagon mark only (right edge stops before the تربح dots)
const WORD = { left: 505, top: 995, width: 1075, height: 535 }; // تربح + TRBHH

// sharp can't extract+trim in one pipeline (trim measures the pre-extract image) → two steps.
const markRaw = await sharp(SRC).extract(MARK).png().toBuffer();
const markBuf = await sharp(markRaw).trim({ threshold: 12 }).png().toBuffer();
const wordRaw = await sharp(SRC).extract(WORD).png().toBuffer();
// whiteout: the golden hexagon's bottom tip leaks into this band — erase it before trimming
const whiteout = Buffer.from(`<svg width="320" height="48"><rect width="320" height="48" fill="#ffffff"/></svg>`);
const wordClean = await sharp(wordRaw).composite([{ input: whiteout, left: 340, top: 0 }]).png().toBuffer();
const wordBuf = await sharp(wordClean).trim({ threshold: 12 }).png().toBuffer();

/** Center the mark on a white square canvas at `scale` of its size. */
async function iconOn(size, scale, out) {
  const inner = Math.round(size * scale);
  const m = await sharp(markBuf).resize(inner, inner, { fit: 'inside' }).toBuffer();
  const meta = await sharp(m).metadata();
  await sharp({ create: { width: size, height: size, channels: 3, background: '#ffffff' } })
    .composite([{ input: m, left: Math.round((size - meta.width) / 2), top: Math.round((size - meta.height) / 2) }])
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log('✓', out, `${size}x${size}`);
}

// Play store icon: full-bleed square, Google applies its own mask.
await iconOn(1024, 0.82, 'public/play/store-icon-1024.png');
// PWA "any" icons.
await iconOn(512, 0.84, 'public/icon-512.png');
await iconOn(192, 0.84, 'public/icon-192.png');
// Maskable: artwork must sit inside the central 80% (safe zone) or it gets cropped.
await iconOn(512, 0.62, 'public/icon-maskable-512.png');
// Apple touch icon: solid background required.
await iconOn(180, 0.84, 'public/apple-icon.png');
// Lightweight header mark (rendered at 44px in the UI).
await iconOn(256, 0.92, 'public/logo-mark-256.png');

// Feature graphic 1024×500: mark right (RTL start) + wordmark left, brand strip below.
{
  const W = 1024, H = 500;
  const mark = await sharp(markBuf).resize(360, 360, { fit: 'inside' }).toBuffer();
  const mMeta = await sharp(mark).metadata();
  const word = await sharp(wordBuf).resize(520, 300, { fit: 'inside' }).toBuffer();
  const wMeta = await sharp(word).metadata();
  const strip = Buffer.from(
    `<svg width="${W}" height="16"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
       <stop offset="0" stop-color="#c9992e"/><stop offset="0.5" stop-color="#3287da"/><stop offset="1" stop-color="#1b4f8a"/>
     </linearGradient></defs><rect width="${W}" height="16" fill="url(#g)"/></svg>`,
  );
  await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } })
    .composite([
      { input: mark, left: 640 - Math.round(mMeta.width / 2) + 200, top: Math.round((H - 16 - mMeta.height) / 2) },
      { input: word, left: 300 - Math.round(wMeta.width / 2), top: Math.round((H - 16 - wMeta.height) / 2) },
      { input: strip, left: 0, top: H - 16 },
    ])
    .png({ compressionLevel: 9 })
    .toFile('public/play/feature-graphic-1024x500.png');
  console.log('✓ public/play/feature-graphic-1024x500.png 1024x500');
}
console.log('done');
