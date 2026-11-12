import { describe, expect, it } from 'vitest';
import { wellFormed } from '@/lib/utils';

describe('wellFormed', () => {
  it('drops a half emoji left by slicing so encodeURIComponent never throws', () => {
    const cut = 'عرض خاص 😀'.slice(0, 9); // يقصّ الإيموجي من منتصفه
    expect(() => encodeURIComponent(cut)).toThrow();
    expect(() => encodeURIComponent(wellFormed(cut))).not.toThrow();
    expect(wellFormed(cut)).toBe('عرض خاص ');
  });
  it('keeps complete emoji and ordinary text untouched', () => {
    expect(wellFormed('سيارة 😀 للبيع')).toBe('سيارة 😀 للبيع');
  });
});
