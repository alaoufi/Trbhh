'use client';
import dynamic from 'next/dynamic';

const Loading = () => <div className="h-64 w-full animate-pulse rounded-xl bg-secondary" />;

/** خريطة عقار مفرد (صفحة التفاصيل) — تُحمَّل في المتصفح فقط. */
export const PropertyMapEmbed = dynamic(() => import('./property-map').then((m) => m.PropertyMap), {
  ssr: false,
  loading: Loading,
});

/** خريطة تصفّح العقارات (كل الإعلانات كدبابيس) — تُحمَّل في المتصفح فقط. */
export const ListingsMapEmbed = dynamic(() => import('./listings-map').then((m) => m.ListingsMap), {
  ssr: false,
  loading: Loading,
});
