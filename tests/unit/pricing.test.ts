import { describe, it, expect } from 'vitest';
import { formatPrice } from '@/lib/utils';

// قاعدة العمل: إعلان العرض بلا سعر لا يُكتب له شيء (يتجاهل السعر — معروف أنه معروض)،
// وإعلان الطلب (request) بلا سعر يعرض «مطلوب».
describe('formatPrice — قاعدة السعر الفارغ', () => {
  it('عرض بلا سعر → لا شيء (بلا «على السوم»)', () => {
    expect(formatPrice(0)).toBe('');
    expect(formatPrice(null)).toBe('');
    expect(formatPrice(undefined)).toBe('');
    expect(formatPrice(0, 'ر.س', 'offer')).toBe('');
  });

  it('طلب بلا سعر → مطلوب', () => {
    expect(formatPrice(0, 'ر.س', 'request')).toBe('مطلوب');
    expect(formatPrice(null, 'ر.س', 'request')).toBe('مطلوب');
  });

  it('وجود سعر يتغلب على النوع ويُنسّق بفواصل الآلاف', () => {
    expect(formatPrice(1500)).toBe('1,500 ر.س');
    expect(formatPrice(1234567, 'ر.س', 'request')).toBe('1,234,567 ر.س');
  });

  it('سعر سالب يُعامل كغياب سعر', () => {
    expect(formatPrice(-5)).toBe('');
    expect(formatPrice(-5, 'ر.س', 'request')).toBe('مطلوب');
  });
});
