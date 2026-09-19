import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({construct:vi.fn(), client:{on:vi.fn(),connect:vi.fn().mockResolvedValue(undefined)}}));
vi.mock('ioredis', () => ({default: class { constructor(...args: unknown[]) { mocks.construct(...args); return mocks.client; } }}));

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  vi.stubEnv('PREVIEW_SANDBOX','true'); vi.stubEnv('PREVIEW_READ_ONLY','false');
  vi.stubEnv('REDIS_URL','redis://production.example.test:6379');
  vi.stubGlobal('redis', undefined);
});
afterEach(() => {vi.unstubAllEnvs();vi.unstubAllGlobals();vi.useRealTimers();});

describe('sandbox Redis isolation', () => {
  it('does not create a Redis connection even with an inherited endpoint', async () => {
    const {redis} = await import('../../src/lib/redis');
    expect(redis).toBeNull(); expect(mocks.construct).not.toHaveBeenCalled();
  });
  it('does not reuse a cached Redis client', async () => {
    vi.stubGlobal('redis', mocks.client);
    const {redis} = await import('../../src/lib/redis');
    expect(redis).toBeNull(); expect(mocks.construct).not.toHaveBeenCalled();
  });
  it('retains local rate-limit counting, reset and expiry without Redis', async () => {
    vi.useFakeTimers();
    const storage = await import('../../src/lib/redis');
    expect(storage.redis).toBeNull();
    expect(await storage.rateGet('login:preview')).toBe(0);
    for (let count=1;count<=8;count++) expect(await storage.rateHit('login:preview',600)).toBe(count);
    expect(await storage.rateGet('login:preview')).toBe(8);
    await storage.rateReset('login:preview');
    expect(await storage.rateGet('login:preview')).toBe(0);
    await storage.rateHit('login:preview',600);
    vi.advanceTimersByTime(600001);
    expect(await storage.rateGet('login:preview')).toBe(0);
    expect(mocks.construct).not.toHaveBeenCalled();
  });
  it('keeps ordinary application Redis enabled when sandbox is off', async () => {
    vi.stubEnv('PREVIEW_SANDBOX','false');
    const {redis} = await import('../../src/lib/redis');
    expect(redis).toBe(mocks.client); expect(mocks.construct).toHaveBeenCalledOnce();
  });
});
