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
  it.each(['javascript:alert(1)', 'data:text/html,hello', 'https://user:password@example.test/'])('rejects unsafe link %s', input => {
    expect(cjSourceLink(input)).toBeNull();
  });
  it('does not round halalas away or pretend an invalid price is free', () => {
    expect(cjPriceLabel(12345)).toBe('123.45 ر.س');
    for (const value of [0, -1, 1.5, NaN, Infinity, 2147483648]) expect(cjPriceLabel(value)).toBe('السعر قيد المراجعة');
    expect(cjPriceLabel(200, 'USD')).toBe('السعر قيد المراجعة');
  });
});

