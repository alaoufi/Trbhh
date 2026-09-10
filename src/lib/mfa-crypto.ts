import 'server-only';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(bytes: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { bits -= 5; out += ALPHABET[(value >>> bits) & 31]; } }
  if (bits) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(input: string): Buffer {
  let bits = 0, value = 0; const bytes: number[] = [];
  for (const c of input) { const n = ALPHABET.indexOf(c); if (n < 0) throw new Error('Invalid TOTP secret'); value = (value << 5) | n; bits += 5; if (bits >= 8) { bits -= 8; bytes.push((value >>> bits) & 255); } }
  return Buffer.from(bytes);
}
/** RFC 6238 / SHA-1, 30 seconds, six digits as used by authenticator apps. */
export function totpCode(secret: string, now = Date.now(), digits = 6): string {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % (10 ** digits)).padStart(digits, '0');
}
function same(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y);
}
export const recoveryHash = (code: string) => createHash('sha256').update(code.replace(/[-\s]/g, '').toUpperCase()).digest('hex');
export function generateRecoveryCodes(): string[] { return Array.from({ length: 10 }, () => randomBytes(10).toString('hex').toUpperCase()); }
export const generateTotpSecret = () => base32Encode(randomBytes(20));
export type FactorState = { secret: string; lastStep: number; recoveryHashes: string[] };
/** Returns state to persist atomically; callers must lock the account row while consuming. */
export function matchFactor(state: FactorState, rawCode: string, now = Date.now()): Omit<FactorState, 'secret'> | null {
  const code = rawCode.trim();
  if (/^\d{6}$/.test(code)) {
    const current = Math.floor(now / 30_000);
    for (const step of [current, current - 1, current + 1]) {
      if (step > state.lastStep && same(totpCode(state.secret, step * 30_000), code)) return { lastStep: step, recoveryHashes: state.recoveryHashes };
    }
  } else if (/^[a-fA-F0-9-\s]{20,30}$/.test(code)) {
    const hash = recoveryHash(code); const index = state.recoveryHashes.findIndex((x) => same(x, hash));
    if (index >= 0) return { lastStep: state.lastStep, recoveryHashes: state.recoveryHashes.filter((_, i) => i !== index) };
  }
  return null;
}
function encryptionKey(value = process.env.AUTH_SECRET || ''): Buffer {
  if (value.length < 32) throw new Error('يلزم AUTH_SECRET ثابت بطول 32 حرفاً على الأقل لتفعيل التحقق.');
  return createHash('sha256').update('trbhh:mfa:v1:' + value).digest();
}
export function encryptSecret(plain: string, uid: number, key?: string): string {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', encryptionKey(key), iv);
  cipher.setAAD(Buffer.from('trbhh:mfa:' + uid));
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((x) => x.toString('base64url')).join('.');
}
export function decryptSecret(sealed: string, uid: number, key?: string): string {
  const parts = sealed.split('.'); if (parts.length !== 3) throw new Error('Invalid encrypted secret');
  const [iv, tag, data] = parts.map((x) => Buffer.from(x, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(key), iv);
  decipher.setAAD(Buffer.from('trbhh:mfa:' + uid)); decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
