import { describe, it, expect } from 'vitest';
import { formatPrice } from '@/lib/utils';

// قاعدة العمل ١: «على السوم» تعني قابلية المساومة من البائع —
// إعلان الطلب (request) بلا سعر يجب أن يعرض «مطلوب» وليس «على السوم» أبداً.
describe('formatPrice — قاعدة على السوم/مطلوب', () => {
  it('عرض بلا سعر → على السوم', () => {
    expect(formatPrice(0)).toBe('على السوم');
    expect(formatPrice(null)).toBe('على السوم');
    expect(formatPrice(undefined)).toBe('على السوم');
    expect(formatPrice(0, 'ر.س', 'offer')).toBe('على السوم');
  });

  it('طلب بلا سعر → مطلوب (وليس على السوم)', () => {
    expect(formatPrice(0, 'ر.س', 'request')).toBe('مطلوب');
    expect(formatPrice(null, 'ر.س', 'request')).toBe('مطلوب');
  });

  it('وجود سعر يتغلب على النوع ويُنسّق بفواصل الآلاف', () => {
    expect(formatPrice(1500)).toBe('1,500 ر.س');
    expect(formatPrice(1234567, 'ر.س', 'request')).toBe('1,234,567 ر.س');
  });

  it('سعر سالب يُعامل كغياب سعر', () => {
    expect(formatPrice(-5)).toBe('على السوم');
    expect(formatPrice(-5, 'ر.س', 'request')).toBe('مطلوب');
  });
});
