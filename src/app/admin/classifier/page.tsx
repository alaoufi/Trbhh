import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { toInt, timeAgo } from '@/lib/utils';
import { requirePerm } from '@/lib/roles';
import { getCategories } from '@/lib/data';
import { countPendingReview, countUnclassifiedAds } from '@/lib/classifier';
import { primaryImages } from '@/lib/account';
import { PLACEHOLDER } from '@/lib/media';
import { runBatchClassifyAction, confirmAdCategoryAction, confirmAllPendingAction } from '../actions';
import { AdminPager } from '@/components/admin-pager';
import { ConfirmSubmit } from '@/components/confirm-submit';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'مراجعة التصنيف الذكي' };

const PAGE_SIZE = 20;

export default async function AdminClassifier({ searchParams }: { searchParams: Promise<{ page?: string; ran?: string; processed?: string; moved?: string }> }) {
  await requirePerm('categories');
  const { page: pageRaw, ran, processed, moved } = await searchParams;
  const page = Math.max(1, parseInt(pageRaw || '1', 10) || 1);

  const [pendingTotal, queueTotal, categories] = await Promise.all([
    countPendingReview(),
    countUnclassifiedAds(),
    getCategories(),
  ]);
  const pages = Math.max(1, Math.ceil(pendingTotal / PAGE_SIZE));
  const cur = Math.min(page, pages);
  const ads = await prisma.ads.findMany({
    where: { cat_reviewed: 0 },
    orderBy: { id: 'desc' },
    skip: (cur - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: { id: true, title: true, detail: true, category_id: true, created_at: true },
  });
  const images = await primaryImages(ads.map((a) => a.id));
  const en = (n: number) => new Intl.NumberFormat('en-US').format(n);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-primary">مراجعة التصنيف الذكي للإعلانات</h1>
      <p className="text-sm text-muted-foreground">
        تصنيف محلي بالكلمات المفتاحية (بلا أي خدمة ذكاء اصطناعي خارجية ولا اتصال إنترنت) يقترح قسماً لكل إعلان جديد من عنوانه وتفاصيله فقط — لا يحلّل الصور محلياً. راجعوا الاقتراحات هنا واعتمدوها أو صححوها.
      </p>

      {ran && (
        <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
          ✅ تم تشغيل التصنيف الآلي: عولج {en(Number(processed) || 0)} إعلان، انتقل {en(Number(moved) || 0)} منها لقسم جديد.
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-3 text-center">
          <div className="text-2xl font-extrabold text-primary">{en(pendingTotal)}</div>
          <div className="text-xs font-bold text-muted-foreground">بانتظار مراجعة الإدارة</div>
        </div>
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-center">
          <div className="text-2xl font-extrabold text-amber-700">{en(queueTotal)}</div>
          <div className="text-xs font-bold text-amber-700/80">إعلانات قديمة لم تُصنَّف بعد</div>
        </div>
      </div>

      {queueTotal > 0 && (
        <form action={runBatchClassifyAction} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-primary/30 bg-primary/5 p-3">
          <span className="text-sm font-bold text-primary">تصنيف الإعلانات القديمة الجالسة في «عروض أخرى» الآن (حتى ٦٠٠ إعلان لكل ضغطة — كرروا الضغط للمتبقي).</span>
          <button className="rounded-md bg-primary px-3 py-2 text-sm font-bold text-white hover:bg-primary/90">تشغيل التصنيف الآلي</button>
        </form>
      )}

      {ads.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">لا توجد اقتراحات بانتظار المراجعة حالياً.</p>
      ) : (
        <>
          <form action={confirmAllPendingAction} className="flex justify-end">
            <input type="hidden" name="adIds" value={ads.map((a) => toInt(a.id)).join(',')} />
            <ConfirmSubmit msg={`اعتماد تصنيف كل الإعلانات الظاهرة في هذه الصفحة (${ads.length}) كما هو دون تعديل؟`} className="rounded-md border border-emerald-400 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100">✔ اعتماد كل ما في هذه الصفحة كما هو</ConfirmSubmit>
          </form>

          <div className="space-y-2">
            {ads.map((a) => (
              <div key={toInt(a.id)} className="flex flex-wrap items-start gap-3 card-3d rounded-xl p-3">
                <img src={images.get(toInt(a.id)) ?? PLACEHOLDER} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                <div className="min-w-0 flex-1 space-y-1">
                  <Link href={`/ads/${toInt(a.id)}`} className="block truncate font-bold text-primary hover:underline">{a.title?.trim() || `إعلان #${toInt(a.id)}`}</Link>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{a.detail}</p>
                  <span className="text-[11px] text-muted-foreground">{timeAgo(a.created_at)}</span>
                </div>
                <form action={confirmAdCategoryAction} className="flex shrink-0 items-center gap-1.5">
                  <input type="hidden" name="adId" value={toInt(a.id)} />
                  <select name="category_id" defaultValue={toInt(a.category_id)} className="h-9 rounded-lg border bg-background px-2 text-sm">
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">اعتماد</button>
                </form>
              </div>
            ))}
          </div>
        </>
      )}

      <AdminPager basePath="/admin/classifier" page={cur} pages={pages} total={pendingTotal} params={{}} />
    </div>
  );
}
