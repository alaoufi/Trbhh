import { describe, expect, it } from 'vitest';
import { isServableMediaPath, privateOwnerDocument } from '@/lib/media-access';

describe('media serving rules', () => {
  it('never serves backups or non-media files', () => {
    expect(isServableMediaPath('backups/auto_2026-11-01_03-00-00.sql')).toBe(false);
    expect(isServableMediaPath('uploads/x.html')).toBe(false);
    expect(isServableMediaPath('uploads/x.bin')).toBe(false);
    expect(isServableMediaPath('uploads/noext')).toBe(false);
    expect(isServableMediaPath('uploads/a.jpg')).toBe(true);
    expect(isServableMediaPath('uploads/topup_5_1700000000000.pdf')).toBe(true);
  });
  it('recognises owner-only documents', () => {
    expect(privateOwnerDocument('uploads/topup_42_1700000000000.jpg')).toEqual({ kind: 'topup', ownerId: 42 });
    expect(privateOwnerDocument('uploads/namechg_7_1700000000000.pdf')).toEqual({ kind: 'namechg', ownerId: 7 });
    expect(privateOwnerDocument('uploads/ad_42_1.jpg')).toBeNull();
  });
});
