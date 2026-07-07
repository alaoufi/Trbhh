import 'server-only';
import sharp from 'sharp';

/**
 * Perceptual image fingerprint (average-hash / aHash), 64-bit as 16 hex chars.
 * Robust to resize, watermark and light recompression — so it matches
 * "the same image" by PERCENTAGE, not byte-identity. Returns '' on failure.
 */
export async function aHash(buf: Buffer): Promise<string> {
  try {
    const raw = await sharp(buf).grayscale().resize(8, 8, { fit: 'fill' }).raw().toBuffer();
    let sum = 0;
    for (let i = 0; i < 64; i++) sum += raw[i];
    const mean = sum / 64;
    let bits = 0n;
    for (let i = 0; i < 64; i++) bits = (bits << 1n) | (raw[i] >= mean ? 1n : 0n);
    return bits.toString(16).padStart(16, '0');
  } catch {
    return '';
  }
}

/** Similarity percentage (0..100) between two aHash hex strings. */
export function hashSimilarity(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 0;
  let x = BigInt('0x' + a) ^ BigInt('0x' + b);
  let dist = 0;
  while (x > 0n) { dist += Number(x & 1n); x >>= 1n; }
  return Math.round(((64 - dist) / 64) * 100);
}
