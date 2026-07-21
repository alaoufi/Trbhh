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

/**
 * بصمة مخصّصة لمستندات نصية (سندات تحويل بنكية): aHash العادي (8×8) خشن جداً
 * لهذا النوع — مستندان مختلفان تماماً (رقم عملية/تاريخ/مبلغ مختلف) لكن بنفس
 * قالب تصميم التطبيق (نفس الشعار، نفس تسميات الحقول، نفس موضعها) يتشابهان
 * بنسبة عالية زوراً لأن التفاصيل الدقيقة (الأرقام) تذوب في المتوسط الخشن.
 * هذه الدالة تدمج بصمتين بدقة 16×16 (256 بت لكل منهما، 512 بت إجمالاً):
 * aHash (سطوع كل خلية مقابل متوسط الشبكة) + dHash (تدرّج كل خلية مقابل
 * جارتها اليمنى — يلتقط حواف النص لا سطوعه فقط) فتميّز اختلاف الأرقام
 * الفعلي بدل الاكتفاء بتطابق القالب العام. Returns '' on failure.
 */
export async function receiptHash(buf: Buffer): Promise<string> {
  try {
    const N = 16;
    const img = sharp(buf).grayscale();
    const [aRaw, dRaw] = await Promise.all([
      img.clone().resize(N, N, { fit: 'fill' }).raw().toBuffer(),
      img.clone().resize(N + 1, N, { fit: 'fill' }).raw().toBuffer(),
    ]);
    let sum = 0;
    for (let i = 0; i < N * N; i++) sum += aRaw[i];
    const mean = sum / (N * N);
    let aBits = 0n;
    for (let i = 0; i < N * N; i++) aBits = (aBits << 1n) | (aRaw[i] >= mean ? 1n : 0n);
    let dBits = 0n;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const l = dRaw[y * (N + 1) + x];
        const r = dRaw[y * (N + 1) + x + 1];
        dBits = (dBits << 1n) | (r > l ? 1n : 0n);
      }
    }
    const hex = (b: bigint) => b.toString(16).padStart((N * N) / 4, '0');
    return hex(aBits) + hex(dBits);
  } catch {
    return '';
  }
}

/** Similarity percentage (0..100) between two same-length perceptual-hash hex strings
 *  (works for both aHash's 64-bit and receiptHash's 512-bit output). */
export function hashSimilarity(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 0;
  const bits = a.length * 4;
  let x = BigInt('0x' + a) ^ BigInt('0x' + b);
  let dist = 0;
  while (x > 0n) { dist += Number(x & 1n); x >>= 1n; }
  return Math.round(((bits - dist) / bits) * 100);
}
