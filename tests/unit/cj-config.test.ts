import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cjConfig } from '@/lib/cj/config';

beforeEach(() => {
  vi.stubEnv('CJ_API_EMAIL', '');
  vi.stubEnv('CJ_API_KEY', 'test-api-key');
  vi.stubEnv('SUPPLIER_TOKEN_ENCRYPTION_KEY', 'a'.repeat(64));
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('CJ API key configuration', () => {
  it('is configured with an API key and encryption key without an email', () => {
    expect(cjConfig()).toMatchObject({ configured: true, email: '', apiKey: 'test-api-key' });
  });

  it('retains the optional trimmed email for display', () => {
    vi.stubEnv('CJ_API_EMAIL', '  cj@example.test  ');
    expect(cjConfig()).toMatchObject({ configured: true, email: 'cj@example.test' });
  });

  it('still requires a nonempty API key', () => {
    vi.stubEnv('CJ_API_EMAIL', 'cj@example.test');
    vi.stubEnv('CJ_API_KEY', '  ');
    expect(cjConfig().configured).toBe(false);
  });

  it.each(['', 'a'.repeat(63), 'g'.repeat(64)])('still requires a valid encryption key: %s', (key) => {
    vi.stubEnv('CJ_API_EMAIL', 'cj@example.test');
    vi.stubEnv('SUPPLIER_TOKEN_ENCRYPTION_KEY', key);
    expect(cjConfig().configured).toBe(false);
  });
});
