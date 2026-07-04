// Generate all app/store icons from the CURRENT master logo
// (public/logo-horizontal.png 2048×1152 — hexagon+cart mark | تربح TRBHH lockup).
//   - Play store icon 1024² (solid bg, no alpha, no rounded corners)
//   - Play feature graphic 1024×500 (mark + wordmark side by side)
//   - PWA icons 512/192 + a REAL maskable 512 (mark inside the 80% safe zone)
//   - Apple touch icon 180 (solid bg)
//   - Optimized 256px header mark
// Usage: node scripts/make-icons.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const SRC = 'public/logo-horizontal.png';
mkdirSync('public/play', { recursive: true });

// Clean crops measured on the 2048×1152 master.
const MARK = { left: 310, top: 255, width: 580, height: 600 }; // hexagon + arrow + cart (stops before the divider line)
const WORD = { left: 965, top: 260, width: 870, height: 480 }; // تربح + TRBHH (tagline excluded)

// sharp can't extract+trim in one pipeline (trim measures the pre-extract image) → two steps.
const markRaw = await sharp(SRC).extract(MARK).png().toBuffer();
// whiteout: the tagline's dash/letters leak into the crop's bottom-right — erase before trimming
const markWhite = Buffer.from(`<svg width="230" height="60"><rect width="230" height="60" fill="#ffffff"/></svg>`);
const markClean = await sharp(markRaw).composite([{ input: markWhite, left: 350, top: 540 }]).png().toBuffer();
const markBuf = await sharp(markClean).trim({ threshold: 12 }).png().toBuffer();
const wordRaw = await sharp(SRC).extract(WORD).png().toBuffer();
const wordBuf = await sharp(wordRaw).trim({ threshold: 12 }).png().toBuffer();

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
  const mark = await sharp(markBuf).resize(340, 340, { fit: 'inside' }).toBuffer();
  const mMeta = await sharp(mark).metadata();
  const word = await sharp(wordBuf).resize(520, 320, { fit: 'inside' }).toBuffer();
  const wMeta = await sharp(word).metadata();
  const strip = Buffer.from(
    `<svg width="${W}" height="16"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
       <stop offset="0" stop-color="#e2a63d"/><stop offset="0.5" stop-color="#4da3f5"/><stop offset="1" stop-color="#1b4f8a"/>
     </linearGradient></defs><rect width="${W}" height="16" fill="url(#g)"/></svg>`,
  );
  await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } })
    .composite([
      { input: mark, left: 812 - Math.round(mMeta.width / 2), top: Math.round((H - 16 - mMeta.height) / 2) },
      { input: word, left: 320 - Math.round(wMeta.width / 2), top: Math.round((H - 16 - wMeta.height) / 2) },
      { input: strip, left: 0, top: H - 16 },
    ])
    .png({ compressionLevel: 9 })
    .toFile('public/play/feature-graphic-1024x500.png');
  console.log('✓ public/play/feature-graphic-1024x500.png 1024x500');
}
console.log('done');
