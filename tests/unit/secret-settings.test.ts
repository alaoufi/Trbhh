import { describe, expect, it } from 'vitest';
import { isSealed, openSetting, sealSetting } from '@/lib/secret-settings';

const SECRET = 'x'.repeat(40);
describe('secret settings encryption', () => {
  it('round-trips and never stores the plain value', () => {
    const sealed = sealSetting('sms_password', 'gateway-secret', SECRET);
    expect(isSealed(sealed)).toBe(true);
    expect(sealed).not.toContain('gateway-secret');
    expect(openSetting('sms_password', sealed, SECRET)).toBe('gateway-secret');
  });
  it('keeps legacy plain values readable and rejects tampering or key mismatch', () => {
    expect(openSetting('wa_token', 'legacy', SECRET)).toBe('legacy');
    const sealed = sealSetting('wa_token', 'abc', SECRET);
    expect(openSetting('sms_password', sealed, SECRET)).toBe('');
    expect(openSetting('wa_token', sealed, 'y'.repeat(40))).toBe('');
  });
  it('leaves the value unchanged without a usable key', () => {
    expect(sealSetting('wa_token', 'abc', 'short')).toBe('abc');
  });
});
