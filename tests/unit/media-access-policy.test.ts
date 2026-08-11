import { describe, expect, it } from 'vitest';
import { isProtectedUploadType } from '@/lib/media-access';

describe('protected upload classification', () => {
  it('protects all verification documents', () => {
    expect(isProtectedUploadType('verify_nid')).toBe(true);
    expect(isProtectedUploadType('verify_cr')).toBe(true);
    expect(isProtectedUploadType('verify_wp')).toBe(true);
  });

  it('keeps public advertising media public', () => {
    expect(isProtectedUploadType('ad_photo')).toBe(false);
    expect(isProtectedUploadType(null)).toBe(false);
  });
});
