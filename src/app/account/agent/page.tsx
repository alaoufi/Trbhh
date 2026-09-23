import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getAgent, remainingWeeklyQuota, agentClaimsThisWeek, listAgentProducts, listClaimableProducts } from '@/lib/cj/agents';
import { cjImg } from '@/lib/cj/storefront';
import { claimProductAction, releaseProductAction, updateMyAgentContactAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'لوحة الوكيل', robots: { index: false, follow: false } };

const sar = (m: number) => `${new Intl.NumberFormat('en-US').format(Math.round(m / 100))} ر.س`;

const ERRORS: Record<string, string> = {
  not_agent: 'لست وكيلاً نشطاً.',
  quota_full: 'انتهت حصّتك الأسبوعية — انتظر تجدّدها أو راجع الإدارة.',
  taken: 'هذه السلعة اختارها وكيل آخر.',
  not_found: 'السلعة غير موجودة.',
  not_yours: 'هذه السلعة ليست ضمن سلعك.',
};

/** بطاقة سلعة مضغوطة (صورة + اسم + سعر) بنفس أسلوب المتجر. */
function ProductTile({ id, title, image, priceMinor, children }: { id: number; title: string; image: string | null; priceMinor: number; children?: React.ReactNode }) {
  return (
    <div className="card-3d flex flex-col overflow-hidden rounded-xl">
      <Link href={`/cj/${id}`} className="block bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {image
          ? <img src={cjImg(image)} alt="" className="aspect-square w-full object-contain" loading="lazy" />
          : <div className="grid aspect-square w-full place-items-center bg-primary/5 text-xs text-muted-foreground">لا صورة</div>}
      </Link>
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <Link href={`/cj/${id}`} className="line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-5 hover:text-primary">{title}</Link>
        <div className="mt-auto text-base font-extrabold text-red-700">{sar(priceMinor)}</div>
        {children}
      </div>
    </div>
  );
}

export default async function AgentDashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireUser();
  const sp = await searchParams;
  const agent = await getAgent(session.uid);
  const isAgent = !!agent && agent.active === 1;

  if (!isAgent) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-10 text-center">
        <h1 className="text-2xl font-extrabold text-primary">لوحة الوكيل</h1>
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          حسابك ليس وكيلاً نشطاً بعد. الوكيل يُمنح صلاحيته من الإدارة، ويصبح مسؤولاً عن سلعٍ يختارها
          أسبوعياً (تواصل مع العملاء ومتابعة الشحن وإتمام البيع). للانضمام تواصل مع الإدارة.
        </p>
        <Link href="/account" className="inline-block rounded-lg bg-primary px-4 py-2 font-bold text-white">‹ رجوع للوحة التحكم</Link>
      </div>
    );
  }

  const [remaining, usedThisWeek, myProducts, claimable] = await Promise.all([
    remainingWeeklyQuota(session.uid),
    agentClaimsThisWeek(session.uid),
    listAgentProducts(session.uid, 200),
    listClaimableProducts(60),
  ]);
  const canClaim = remaining > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold text-primary">لوحة الوكيل</h1>
        <Link href="/account" className="rounded-lg border border-primary/30 px-3 py-1.5 text-sm font-bold text-primary">‹ لوحة التحكم</Link>
      </div>

      {sp.claimed === '1' && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">تم اختيار السلعة وأصبحت ضمن سلعك.</p>}
      {sp.released === '1' && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800">تم التنازل عن السلعة.</p>}
      {sp.saved === '1' && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">تم حفظ بيانات التواصل.</p>}
      {typeof sp.err === 'string' && ERRORS[sp.err] && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{ERRORS[sp.err]}</p>}

      {/* ملخّص الحصّة */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="card-3d rounded-xl p-3"><div className="text-2xl font-extrabold text-primary">{remaining}</div><div className="text-xs text-muted-foreground">متبقٍّ هذا الأسبوع</div></div>
        <div className="card-3d rounded-xl p-3"><div className="text-2xl font-extrabold text-primary">{usedThisWeek}</div><div className="text-xs text-muted-foreground">اخترتها هذا الأسبوع</div></div>
        <div className="card-3d rounded-xl p-3"><div className="text-2xl font-extrabold text-primary">{agent.weekly_quota}</div><div className="text-xs text-muted-foreground">الحصّة الأسبوعية</div></div>
      </div>

      {/* بيانات تواصل الوكيل (تظهر للعملاء كأزرار واتساب/اتصال فقط) */}
      <details className="card-3d rounded-2xl p-3">
        <summary className="cursor-pointer text-sm font-bold text-primary">بيانات تواصلي (واتساب/اتصال)</summary>
        <form action={updateMyAgentContactAction} className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="block text-sm">جوال الاتصال
            <input name="phone" defaultValue={agent.phone} inputMode="tel" placeholder="05XXXXXXXX" className="mt-1 w-full rounded-lg border border-primary/25 bg-white px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm">واتساب
            <input name="whatsapp" defaultValue={agent.whatsapp} inputMode="tel" placeholder="05XXXXXXXX" className="mt-1 w-full rounded-lg border border-primary/25 bg-white px-3 py-2 text-sm" />
          </label>
          <div className="sm:col-span-2"><button className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">حفظ بيانات التواصل</button></div>
        </form>
        <p className="mt-1 text-xs text-muted-foreground">تظهر للعملاء كأزرار واتساب/اتصال على صفحة السلعة — لا يُكتب الرقم علناً.</p>
      </details>

      {/* سلعي */}
      <section className="space-y-2">
        <h2 className="text-lg font-extrabold text-primary">سلعي ({myProducts.length})</h2>
        {!myProducts.length ? (
          <p className="rounded-xl bg-white p-6 text-center text-sm text-muted-foreground">لم تختر سلعاً بعد. اختر من «سلع متاحة» أدناه.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {myProducts.map((r) => (
              <ProductTile key={String(r.id)} id={Number(r.id)} title={r.name_ar || r.name || 'سلعة'} image={r.image || null} priceMinor={r.sale_price_override_minor ?? r.sale_price_minor}>
                <div className="flex items-center gap-1.5">
                  <Link href={`/cj/${r.id}`} className="flex-1 rounded-lg border border-primary/30 px-2 py-1.5 text-center text-xs font-bold text-primary">إدارة</Link>
                  <form action={releaseProductAction}><input type="hidden" name="id" value={String(r.id)} /><button className="rounded-lg border border-red-300 px-2 py-1.5 text-xs font-bold text-red-700">تنازل</button></form>
                </div>
                {r.hidden === 1 && <span className="w-fit rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">مخفية</span>}
              </ProductTile>
            ))}
          </div>
        )}
      </section>

      {/* سلع متاحة للاختيار */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-primary">سلع متاحة للاختيار</h2>
          {!canClaim && <span className="rounded-lg bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">انتهت حصّتك الأسبوعية</span>}
        </div>
        {!claimable.length ? (
          <p className="rounded-xl bg-white p-6 text-center text-sm text-muted-foreground">لا سلع متاحة حالياً — عُد لاحقاً.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {claimable.map((r) => (
              <ProductTile key={String(r.id)} id={Number(r.id)} title={r.name_ar || r.name || 'سلعة'} image={r.image || null} priceMinor={r.sale_price_override_minor ?? r.sale_price_minor}>
                {canClaim
                  ? <form action={claimProductAction}><input type="hidden" name="id" value={String(r.id)} /><button className="w-full rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-bold text-white">اختيار هذه السلعة</button></form>
                  : <span className="block w-full rounded-lg bg-slate-100 px-2 py-1.5 text-center text-xs font-bold text-muted-foreground">الحصّة ممتلئة</span>}
              </ProductTile>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
