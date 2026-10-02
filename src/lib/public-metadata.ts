import type { Metadata } from 'next';
import { SITE } from './constants';

export const MARKETPLACE_TITLE = `${SITE.name} | منصة الإعلانات والمتاجر في السعودية`;
export const MARKETPLACE_DESCRIPTION = SITE.description;

const REAL_ESTATE_ONLY = /(?:للعقار|عقاري(?:ة|ه)?|الهيئة العامة للعقار)/i;

export function normalizeMarketplaceMetadata(title: string, description: string) {
  const cleanTitle = title.trim();
  const cleanDescription = description.trim();
  return {
    title: !cleanTitle || REAL_ESTATE_ONLY.test(cleanTitle) ? MARKETPLACE_TITLE : cleanTitle,
    description: !cleanDescription || REAL_ESTATE_ONLY.test(cleanDescription) ? MARKETPLACE_DESCRIPTION : cleanDescription,
  };
}

export function publicPageMetadata({ title, description, path }: {
  title: string;
  description: string;
  path: `/${string}`;
}): Metadata {
  const socialTitle = title.includes(SITE.name) ? title : `${title} | ${SITE.name}`;
  const image = { url: '/icon-512.png?v=3', width: 512, height: 512, alt: SITE.name };
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website', locale: 'ar_SA', siteName: SITE.name,
      title: socialTitle, description, url: path, images: [image],
    },
    twitter: { card: 'summary', title: socialTitle, description, images: [image.url] },
  };
}
