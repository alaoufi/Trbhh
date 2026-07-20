import Link from 'next/link';
import { Map, Home, Grid3x3, Search, PlusCircle, FileText } from 'lucide-react';
import { getCategories } from '@/lib/data';
import { categoriesEnabled, debatesEnabled, auctionsEnabled } from '@/lib/settings';
import { dealsEnabled } from '@/lib/store-extras';
import { Breadcrumb } from '@/components/breadcrumb';
import { SITE } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'خارطة الموقع',
  description: `دليل شامل لكل أقسام وصفحات منصة ${SITE.name}: الأقسام، الإعلانات المبوّبة، المتاجر، البحث، والصفحات الثابتة.`,
};

type Item = { label: string; href: string };
type Group = { title: string; icon: React.ElementType; items: Item[] };

export default async function SiteMapPage() {
  const [catsOn, debatesOn, auctionsOn, dealsOn] = await Promise.all([
    categoriesEnabled(), debatesEnabled(), auctionsEnabled(), dealsEnabled(),
  ]);
  const categories = catsOn ? await getCategories() : [];

  const groups: Group[] = [
    {
      title: 'الصفحة الرئيسية',
      icon: Home,
      items: [{ label: 'الرئيسية', href: '/' }],
    },
    {
      title: 'التصفّح والخدمات',
      icon: Search,
      items: [
        { label: 'بحث متقدم', href: '/search' },
        { label: 'الإعلانات المبوّبة', href: '/classified' },
        { label: 'المتاجر', href: '/companies' },
        { label: 'قريب مني', href: '/nearby' },
        ...(dealsOn ? [{ label: 'عروض اليوم', href: '/deals' }] : []),
        ...(auctionsOn ? [{ label: 'المزادات', href: '/auctions' }] : []),
        ...(debatesOn ? [{ label: 'النقاشات', href: '/debates' }] : []),
      ],
    },
    {
      title: 'النشر والإعلان',
      icon: PlusCircle,
      items: [
        { label: 'أضف إعلاناً', href: '/ads/new' },
        { label: 'صمّم إعلاناً مبوّباً', href: '/classified/new' },
        { label: 'افتح متجرك', href: '/account/company' },
      ],
    },
    {
      title: 'صفحات الموقع',
      icon: FileText,
      items: [
        { label: 'من نحن', href: '/pages/about' },
        { label: 'الأسئلة الشائعة', href: '/pages/faq' },
        { label: 'شروط الاستخدام', href: '/pages/terms' },
        { label: 'سياسة الخصوصية', href: '/pages/privacy' },
        { label: 'تواصل معنا', href: '/pages/contact' },
      ],
    },
  ];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: [
      ...groups.flatMap((g) => g.items),
      ...categories.map((c) => ({ label: c.name, href: `/categories/${c.id}` })),
    ].map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.label, url: `https://${SITE.domain}${it.href}` })),
  };
  const jsonLdHtml = JSON.stringify(jsonLd)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  return (
    <div className="space-y-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml }} />
      <Breadcrumb items={[{ label: 'خارطة الموقع' }]} />
      <div className="flex items-center gap-2">
        <Map className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-primary">خارطة الموقع</h1>
      </div>
      <p className="text-sm text-muted-foreground">دليل شامل لكل أقسام وصفحات {SITE.name} — اختر ما تريد الوصول إليه مباشرة.</p>

      {groups.map((g) => (
        <div key={g.title} className="card-3d space-y-2 rounded-2xl p-4">
          <div className="flex items-center gap-2 font-extrabold text-primary"><g.icon className="h-5 w-5" /> {g.title}</div>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
            {g.items.map((it) => (
              <li key={it.href}>
                <Link href={it.href} className="block truncate rounded-lg px-2 py-1.5 text-sm text-foreground/85 hover:bg-accent hover:text-primary">{it.label}</Link>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {catsOn && categories.length > 0 && (
        <div className="card-3d space-y-2 rounded-2xl p-4">
          <div className="flex items-center gap-2 font-extrabold text-primary"><Grid3x3 className="h-5 w-5" /> جميع الأقسام ({categories.length})</div>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
            {categories.map((c) => (
              <li key={c.id}>
                <Link href={`/categories/${c.id}`} className="block truncate rounded-lg px-2 py-1.5 text-sm text-foreground/85 hover:bg-accent hover:text-primary">{c.name}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
