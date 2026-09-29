import { describe, expect, it } from 'vitest';
import { shouldUseSecureCookies } from '@/lib/auth';

describe('secure cookie policy', () => {
  it('always uses Secure cookies in production', () => {
    expect(shouldUseSecureCookies({ NODE_ENV: 'production', COOKIE_SECURE: 'false' })).toBe(true);
  });

  it('allows explicit local HTTPS behaviour outside production', () => {
    expect(shouldUseSecureCookies({ NODE_ENV: 'development', COOKIE_SECURE: 'true' })).toBe(true);
    expect(shouldUseSecureCookies({ NODE_ENV: 'development', COOKIE_SECURE: 'false' })).toBe(false);
  });

  it('allows the isolated Hostinger HTTP preview to keep its session cookie', () => {
    expect(shouldUseSecureCookies({
      NODE_ENV: 'production',
      COOKIE_SECURE: 'false',
      TRBHH_READ_ONLY_PREVIEW: '1',
    })).toBe(false);
  });
});
