import Link from 'next/link';
import { cjStorefrontView } from '@/lib/cj/storefront';
import { listStorefrontCjProducts, type CjProductRow } from '@/lib/cj/mapping';
import { AdGrid } from '@/components/ad-card';
import { getHomeLatestAds, type AdCard } from '@/lib/data';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'سلع مختارة', robots: { index: false, follow: false } };

/** يحوّل السلعة المستوردة إلى بطاقة إعلان (نفس التصميم) — المورد مخفي، الرابط لصفحة السلعة. */
function importedToAdCard(r: CjProductRow): AdCard {
  return {
    id: Number(r.id),
    href: `/cj/${r.id}`,
    title: r.name_ar || r.name || 'سلعة',
    price: Math.round((r.sale_price_override_minor ?? r.sale_price_minor) / 100),
    adsType: 'sale',
    image: r.image,
    cityName: null,
    categoryName: r.trbhh_category || null,
    createdAt: null,
    special: false,
    urgent: false,
    views: 0,
    sellerName: null,
    sellerTrusted: false,
    tier: '',
  };
}

/** يمزج قائمتين بالتناوب لتظهر السلع المستوردة بين الإعلانات. */
function weave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) { if (i < a.length) out.push(a[i]); if (i < b.length) out.push(b[i]); }
  return out;
}

export default async function CjStorePage() {
  const view = await cjStorefrontView();
  if (!view.visible) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-extrabold text-primary">قريباً</h1>
        <p className="mt-3 text-muted-foreground">هذا القسم قيد التجهيز وسيُعلَن قريباً بإذن الله.</p>
        <Link href="/" className="mt-6 inline-block rounded-lg bg-primary px-4 py-2 font-bold text-white">العودة للرئيسية</Link>
      </div>
    );
  }
  const readyOnly = !view.isStaff; // الزائر يرى «الجاهزة» فقط؛ المشرف يعاين الكل
  const [items, latestAds] = await Promise.all([listStorefrontCjProducts(readyOnly, 60), getHomeLatestAds(24)]);
  // السلع المستوردة (ذات الصورة) كبطاقات إعلانات، ممزوجة بين الإعلانات الحالية.
  const importedCards = items.filter((r) => r.image).map(importedToAdCard);
  const feed = weave(importedCards, latestAds);

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      {!view.isPublic && view.isStaff && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
          <b>معاينة إدارية</b> — صفحة مطابقة للرئيسية، مخفية عن الأعضاء والزوار (تراها بصفتك مشرفاً فقط). السلع المستوردة ممزوجة بين الإعلانات بنفس التصميم، والمورد لا يظهر للعميل. فعّلها من لوحة الإدارة بعد نجاح التجربة.
        </p>
      )}
      <h1 className="text-xl font-extrabold text-primary">تربح — أحدث الإعلانات والسلع</h1>
      {!feed.length
        ? <p className="rounded-xl bg-white p-8 text-center text-muted-foreground">لا محتوى لعرضه بعد.</p>
        : <AdGrid ads={feed} />}
    </div>
  );
}
