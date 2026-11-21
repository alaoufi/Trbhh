import { describe, expect, it } from 'vitest';
import { cleanDomainVerification } from '@/lib/domain-verification';

describe('domain verification code', () => {
  it('accepts the bare code or the full tag', () => {
    expect(cleanDomainVerification(' abc123-XYZ ')).toBe('abc123-XYZ');
    expect(cleanDomainVerification('<meta name="domain-verification" content="abc123-XYZ">')).toBe('abc123-XYZ');
    expect(cleanDomainVerification("<meta name='domain-verification' content='a.b_c=1' />")).toBe('a.b_c=1');
  });
  it('rejects markup and empty values', () => {
    expect(cleanDomainVerification('')).toBe('');
    expect(cleanDomainVerification('"><script>alert(1)</script>')).toBe('');
    expect(cleanDomainVerification('a b')).toBe('');
    expect(cleanDomainVerification('x'.repeat(201))).toBe('');
  });
});
