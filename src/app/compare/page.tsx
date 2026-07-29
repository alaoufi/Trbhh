import Link from 'next/link';
import Image from 'next/image';
import { Scale } from 'lucide-react';
import { readCompareIds, clearCompareAction, toggleCompareAction } from './actions';
import { getAdsByIdsCards } from '@/lib/data';
import { formatPrice } from '@/lib/utils';
import { Breadcrumb } from '@/components/breadcrumb';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'مقارنة الإعلانات' };

function Row({ label, values }: { label: string; values: React.ReactNode[] }) {
  return (
    <tr className="border-t">
      <th className="whitespace-nowrap bg-secondary/30 p-2 text-right text-xs font-bold text-muted-foreground">{label}</th>
      {values.map((v, i) => <td key={i} className="p-2 text-center text-sm font-semibold">{v}</td>)}
    </tr>
  );
}

export default async function ComparePage() {
  const ids = await readCompareIds();
  const ads = await getAdsByIdsCards(ids);
  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: 'مقارنة الإعلانات' }]} />
      <div className="flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xl font-extrabold text-primary"><Scale className="h-6 w-6" /> مقارنة الإعلانات ({ads.length})</h1>
        {ads.length > 0 && <form action={clearCompareAction}><button className="rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/10">مسح الكل</button></form>}
      </div>

      {ads.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">لم تختر إعلانات للمقارنة بعد. افتح أي إعلان واضغط <b>«قارن ⚖»</b> لإضافته (حتى ٤ إعلانات) ثم عُد هنا.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr>
                <th className="w-24 bg-secondary/30"></th>
                {ads.map((a) => (
                  <th key={a.id} className="p-2 align-top">
                    <Link href={`/ads/${a.id}`} className="block">
                      <span className="relative mx-auto block h-24 w-24 overflow-hidden rounded-lg bg-muted"><Image src={a.image} alt={a.title} fill sizes="96px" className="object-cover" /></span>
                      <span className="mt-1 line-clamp-2 text-xs font-bold text-primary">{a.title}</span>
                    </Link>
                    <form action={toggleCompareAction}>
                      <input type="hidden" name="adId" value={a.id} />
                      <input type="hidden" name="back" value="/compare" />
                      <button className="mt-1 text-[10px] font-bold text-destructive hover:underline">✕ إزالة</button>
                    </form>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Row label="النوع" values={ads.map((a) => a.adsType === 'request' ? 'طلب' : 'عرض')} />
              <Row label="السعر" values={ads.map((a) => <span key={a.id} className="text-primary">{a.price > 0 ? formatPrice(a.price) : (a.adsType === 'request' ? 'مطلوب' : 'على السوم')}</span>)} />
              <Row label="المدينة" values={ads.map((a) => a.cityName || '—')} />
              <Row label="المعلن" values={ads.map((a) => a.sellerName || '—')} />
              <Row label="التقييم" values={ads.map((a) => (a.ratingCount ?? 0) > 0 ? `⭐ ${a.ratingAvg} (${a.ratingCount})` : '—')} />
              <Row label="مميّز" values={ads.map((a) => a.special ? '⭐ نعم' : '—')} />
              <Row label="" values={ads.map((a) => <Link key={a.id} href={`/ads/${a.id}`} className="inline-block rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white">عرض التفاصيل</Link>)} />
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
