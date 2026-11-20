import { describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync, verify } from 'node:crypto';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/data/schema-sync', () => ({ ensureSchema: vi.fn() }));
import { apnsBody, apnsConfig, apnsJwt, isApnsToken, isDeadApnsToken, parseApnsKey } from '@/lib/apns';

const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const env = (over: Record<string, string> = {}) => ({ APNS_KEY_ID: 'ABCDE12345', APNS_TEAM_ID: 'TEAM123456', APNS_BUNDLE_ID: 'com.example.app', APNS_KEY: pem, ...over }) as unknown as NodeJS.ProcessEnv;

describe('apns', () => {
  it('accepts only hex device tokens', () => {
    expect(isApnsToken('a'.repeat(64))).toBe(true);
    expect(isApnsToken('A'.repeat(64))).toBe(false);
    expect(isApnsToken('a'.repeat(63))).toBe(false);
    expect(isApnsToken(`${'a'.repeat(64)}/../x`)).toBe(false);
    expect(isApnsToken(123)).toBe(false);
  });

  it('reads the key as PEM, escaped PEM or base64, and rejects other keys', () => {
    expect(parseApnsKey(pem)).not.toBeNull();
    expect(parseApnsKey(pem.replace(/\n/g, '\\n'))).not.toBeNull();
    expect(parseApnsKey(Buffer.from(pem).toString('base64'))).not.toBeNull();
    expect(parseApnsKey('')).toBeNull();
    expect(parseApnsKey('not a key')).toBeNull();
    const other = generateKeyPairSync('ec', { namedCurve: 'secp384r1' }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    expect(parseApnsKey(other)).toBeNull();
  });

  it('is unconfigured unless every value is present and valid', () => {
    expect(apnsConfig(env())).not.toBeNull();
    expect(apnsConfig(env({ APNS_BUNDLE_ID: '' }))).toBeNull();
    expect(apnsConfig(env({ APNS_KEY_ID: 'short' }))).toBeNull();
    expect(apnsConfig(env({ APNS_KEY: 'x' }))).toBeNull();
  });

  it('signs a provider token Apple can verify (ES256, raw signature)', () => {
    const cfg = apnsConfig(env())!;
    const [head, claims, sig] = apnsJwt(cfg, 1_800_000_000).split('.');
    expect(JSON.parse(Buffer.from(head, 'base64url').toString())).toEqual({ alg: 'ES256', kid: 'ABCDE12345' });
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toEqual({ iss: 'TEAM123456', iat: 1_800_000_000 });
    const raw = Buffer.from(sig, 'base64url');
    expect(raw.length).toBe(64);
    expect(verify('sha256', Buffer.from(`${head}.${claims}`), { key: pair.publicKey, dsaEncoding: 'ieee-p1363' }, raw)).toBe(true);
  });

  it('builds the alert body and trims long text', () => {
    const body = JSON.parse(apnsBody({ title: 'ع'.repeat(200), body: 'ب'.repeat(400) }));
    expect(body.aps.alert.title.length).toBe(80);
    expect(body.aps.alert.body.length).toBe(160);
    expect(body.aps.sound).toBe('default');
    expect(body.url).toBe('/');
  });

  it('drops only tokens Apple says are dead', () => {
    expect(isDeadApnsToken({ status: 410, reason: 'Unregistered' })).toBe(true);
    expect(isDeadApnsToken({ status: 400, reason: 'BadDeviceToken' })).toBe(true);
    expect(isDeadApnsToken({ status: 403, reason: 'InvalidProviderToken' })).toBe(false);
    expect(isDeadApnsToken({ status: 0, reason: 'network' })).toBe(false);
    expect(isDeadApnsToken({ status: 429, reason: 'TooManyRequests' })).toBe(false);
  });
});
