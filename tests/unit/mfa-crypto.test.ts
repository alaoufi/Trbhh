import { describe, expect, it } from 'vitest';
import { base32Encode, totpCode, matchFactor, encryptSecret, decryptSecret, recoveryHash } from '@/lib/mfa-crypto';
const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
describe('TOTP and recovery security', () => {
  it.each([[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [20000000000, '65353130']])('matches RFC6238 SHA1 vector at %i', (seconds, expected) => {
    expect(totpCode(secret, Number(seconds) * 1000, 8)).toBe(expected);
  });
  it('encodes standard authenticator secrets', () => expect(base32Encode(Buffer.from('12345678901234567890'))).toBe(secret));
  it('rejects expired and replayed TOTP codes', () => {
    const now = 1700000000000; const code = totpCode(secret, now);
    expect(matchFactor({ secret, lastStep: -1, recoveryHashes: [] }, code, now)?.lastStep).toBe(Math.floor(now / 30000));
    expect(matchFactor({ secret, lastStep: Math.floor(now / 30000), recoveryHashes: [] }, code, now)).toBeNull();
    expect(matchFactor({ secret, lastStep: -1, recoveryHashes: [] }, code, now + 120000)).toBeNull();
  });
  it('consumes a recovery code exactly once', () => {
    const code = 'ABCDEF0123456789ABCD';
    const result = matchFactor({ secret, lastStep: -1, recoveryHashes: [recoveryHash(code)] }, code, 1700000000000);
    expect(result?.recoveryHashes).toEqual([]);
    expect(matchFactor({ secret, lastStep: -1, recoveryHashes: result!.recoveryHashes }, code, 1700000000000)).toBeNull();
  });
  it('authenticates ciphertext and binds the secret to its account', () => {
    const key = 'test-only-key-'.repeat(4);
    const sealed = encryptSecret(secret, 1, key);
    expect(sealed).not.toContain(secret);
    expect(decryptSecret(sealed, 1, key)).toBe(secret);
    expect(() => decryptSecret(sealed, 2, key)).toThrow();
    expect(() => decryptSecret(sealed.slice(0, -4) + 'AAAA', 1, key)).toThrow();
  });
});
