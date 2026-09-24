import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { cjDescriptionText, cjPriceLabel, cjSourceLink } from '@/lib/cj/presentation';
import { CjProductDescription } from '@/components/cj/product-description';

describe('CJ product display without changing saved records', () => {
  it('removes the truncated image tag observed in imported descriptions', () => {
    expect(cjDescriptionText('وصف المنتج<p>طابعة</p>&lt;img src="https://example.test/' + 'x'.repeat(700))).toBe('وصف المنتج طابعة');
  });
  it('decodes encoded markup, preserves paragraphs and excludes active content', () => {
    expect(cjDescriptionText('&amp;lt;p&amp;gt;وصف&amp;lt;/p&amp;gt;<script>alert(1)</script><style>bad</style><li>قطعة</li>')).toBe('وصف\n\n• قطعة');
  });
  it('removes translated tag fragments observed on product15 without inventing missing description text', () => {
    const source = 'وصف الطابعة <ر> <ب>قائمة التعبئة:</ب> ورق <ب>المنتج ايم';
    expect(cjDescriptionText(source)).toBe('وصف الطابعة قائمة التعبئة: ورق المنتج ايم');
    expect(source).toBe('وصف الطابعة <ر> <ب>قائمة التعبئة:</ب> ورق <ب>المنتج ايم');
  });
  it.each(['<ب>وصف محفوظ</ب>', '&lt;ب&gt;وصف محفوظ&lt;/ب&gt;', '<ｂ>وصف محفوظ</ｂ>', '＜ب＞وصف محفوظ＜/ب＞', '＜ｂ＞وصف محفوظ＜／ｂ＞'])('strips complete Unicode-letter markup %s', source => {
    expect(cjDescriptionText(source)).toBe('وصف محفوظ');
  });
  it.each(['<ب', '</ب', '<ب title="جزء غير مكتمل', '<IMG src="https://example.test/missing', '＜ب title="جزء غير مكتمل', '＜ＩＭＧ src="https://example.test/missing'])('drops an unclosed tag-shaped suffix %s without reconstructing its content', suffix => {
    expect(cjDescriptionText(`وصف محفوظ ${suffix}`)).toBe('وصف محفوظ');
  });
  it('shows a compact descriptive link and allows long plain text to wrap', () => {
    const url = 'https://example.test/products/' + 'a'.repeat(1000);
    const html = renderToStaticMarkup(createElement(CjProductDescription, { text: `المواصفات ${url}` }));
    expect(html).toContain('overflow-wrap:anywhere');
    expect(html).toContain('رابط مرجعي (example.test)');
    expect(html).not.toContain(`>${url}</a>`);
    expect(html).toContain('noopener noreferrer nofollow');
  });
  it('never renders HTML supplied by the merchant', () => {
    const html = renderToStaticMarkup(createElement(CjProductDescription, { text: '<img src=x onerror=alert(1)><script>alert(1)</script><p>وصف آمن</p>' }));
    expect(html).not.toContain('<img'); expect(html).not.toContain('<script'); expect(html).toContain('وصف آمن');
  });
  it('preserves ordinary measurements that contain a less-than sign', () => {
    expect(cjDescriptionText('الوزن <10 غرام والحرارة >5 درجات')).toBe('الوزن <10 غرام والحرارة >5 درجات');
  });
  it.each(['الوزن < 10 غرام والحرارة > 5 درجات', 'س < ص و ص > ع', 'x < y and y > z', 'x<y', 'الوزن ＜10 غرام'])('preserves ordinary comparison text %s', source => {
    expect(cjDescriptionText(source)).toBe(source);
  });
  it.each(['javascript:alert(1)', 'data:text/html,hello', 'https://user:password@example.test/'])('rejects unsafe link %s', input => {
    expect(cjSourceLink(input)).toBeNull();
  });
  it('does not round halalas away or pretend an invalid price is free', () => {
    expect(cjPriceLabel(12345)).toBe('123.45 ر.س');
    for (const value of [0, -1, 1.5, NaN, Infinity, 2147483648]) expect(cjPriceLabel(value)).toBe('السعر قيد المراجعة');
    expect(cjPriceLabel(200, 'USD')).toBe('السعر قيد المراجعة');
  });
});

