import Link from 'next/link';
import { Home } from 'lucide-react';
import { SITE } from '@/lib/constants';

export type Crumb = { label: string; href?: string };

/** مسار «أنت هنا» + بيانات BreadcrumbList منظَّمة لمحركات البحث. */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  const all: Crumb[] = [{ label: 'الرئيسية', href: '/' }, ...items];
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: all.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.label,
      ...(c.href ? { item: `https://${SITE.domain}${c.href}` } : {}),
    })),
  };
  // أمان: هرّب < > & وفواصل الأسطر يونيكود حتى لا يكسر محتوى (اسم قسم/متجر/إعلان) وسم <script ld+json> (XSS مخزّن).
  const jsonLdHtml = JSON.stringify(jsonLd)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  return (
    <nav aria-label="مسار التصفح" className="mb-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml }} />
      {all.map((c, i) => {
        const last = i === all.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="opacity-40">/</span>}
            {!last && c.href ? (
              <Link href={c.href} className="flex items-center gap-1 hover:text-primary hover:underline">
                {i === 0 && <Home className="h-3 w-3" />}
                {c.label}
              </Link>
            ) : (
              <span className="font-bold text-foreground">{c.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
