import { describe, expect, it } from 'vitest';
import { normalizeMarketplaceMetadata, publicPageMetadata } from '@/lib/public-metadata';

describe('public marketplace metadata', () => {
  it('replaces legacy real-estate-only site metadata with the general Trbhh identity', () => {
    const normalized = normalizeMarketplaceMetadata(
      'تربح للعقار | منصّة الوساطة والإعلانات العقارية في السعودية',
      'تربح للعقار — منصّة عقارية سعودية متوافقة مع أنظمة الهيئة العامة للعقار.',
    );
    expect(normalized.title).toBe('تربح | منصة الإعلانات والمتاجر في السعودية');
    expect(normalized.description).toContain('منصة تربح');
    expect(`${normalized.title} ${normalized.description}`).not.toMatch(/العقار|عقارية/);
  });

  it('preserves a valid general custom identity from administration settings', () => {
    expect(normalizeMarketplaceMetadata('سوق تربح للأعمال', 'اكتشف الموردين والخدمات والإعلانات.')).toEqual({
      title: 'سوق تربح للأعمال',
      description: 'اكتشف الموردين والخدمات والإعلانات.',
    });
  });

  it('keeps page title, description, canonical, OpenGraph and Twitter aligned', () => {
    const metadata = publicPageMetadata({
      title: 'بحث متقدم',
      description: 'ابحث في إعلانات تربح.',
      path: '/search',
    });
    expect(metadata).toMatchObject({
      title: 'بحث متقدم',
      description: 'ابحث في إعلانات تربح.',
      alternates: { canonical: '/search' },
      openGraph: {
        title: 'بحث متقدم | تربح',
        description: 'ابحث في إعلانات تربح.',
        url: '/search',
        siteName: 'تربح',
      },
      twitter: {
        title: 'بحث متقدم | تربح',
        description: 'ابحث في إعلانات تربح.',
      },
    });
  });
});
