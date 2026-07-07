import Link from 'next/link';
import { Wallet, TrendingUp, TrendingDown, Coins, Crown, Megaphone, Save, Check } from 'lucide-react';
import { requireAction } from '@/lib/roles';
import { getRevenueSummary } from '@/lib/wallet';
import { getStoreSubPricing, getAdPricing } from '@/lib/settings';
import { saveRevenueAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'الإيرادات' };

const en = (n: number) => new Intl.NumberFormat('en-US').format(n);
function fmt(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('ar', { dateStyle: 'short', timeStyle: 'short' }).format(d);
}

function Tile({ icon: Icon, value, label, tone }: { icon: React.ElementType; value: string; label: string; tone?: string }) {
  return (
    <div className="card-3d flex flex-col items-center gap-1 rounded-xl p-3 text-center">
      <Icon className={`h-5 w-5 ${tone || 'text-primary'}`} />
      <div className="text-lg font-extrabold text-primary">{value}</div>
      <div className="text-[11px] leading-tight text-muted-foreground">{label}</div>
    </div>
  );
}

const num = 'h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40';

export default async function AdminRevenuePage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requireAction('users', 'view');
  const { saved } = await searchParams;
  const [rev, sub, ad] = await Promise.all([getRevenueSummary(40), getStoreSubPricing(), getAdPricing()]);

  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="flex items-center gap-2 text-xl font-extrabold text-primary"><Coins className="h-6 w-6" /> الإيرادات</h1>
      {saved === '1' && <div className="flex items-center gap-2 rounded-lg border-2 border-green-300 bg-green-50 p-3 text-sm font-bold text-green-800"><Check className="h-4 w-4" /> تم حفظ التسعيرات.</div>}

      {/* ملخّص الإيرادات */}
      <div className="grid grid-cols-3 gap-2">
        <Tile icon={TrendingDown} value={`${en(rev.spent)} ر.س`} label="إجمالي الإيراد (مصروف الأعضاء)" tone="text-emerald-600" />
        <Tile icon={TrendingUp} value={`${en(rev.credited)} ر.س`} label="إجمالي الشحن" tone="text-sky-600" />
        <Tile icon={Wallet} value={`${en(rev.outstanding)} ر.س`} label="أرصدة الأعضاء الحالية" />
      </div>
      {rev.byReason.length > 0 && (
        <div className="card-3d rounded-xl p-3">
          <div className="mb-2 text-sm font-bold text-primary">الإيراد حسب النوع</div>
          <ul className="space-y-1 text-sm">
            {rev.byReason.map((r) => (
              <li key={r.reason} className="flex items-center justify-between"><span className="text-muted-foreground">{r.label}</span><b>{en(r.total)} ر.س</b></li>
            ))}
          </ul>
        </div>
      )}

      {/* التسعيرات */}
      <form action={saveRevenueAction} className="card-3d space-y-4 rounded-2xl p-4">
        <div className="flex items-center gap-2 font-bold text-primary"><Crown className="h-5 w-5" /> اشتراك المتاجر</div>
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" name="subEnabled" defaultChecked={sub.enabled} className="h-4 w-4 accent-[hsl(var(--primary))]" />
          تفعيل اشتراكات المتاجر (عند التفعيل يُشترط اشتراك ساري لظهور المتجر)
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="space-y-1"><span className="text-xs font-bold">شهري (ر.س)</span><input name="subMonthly" type="number" min={0} defaultValue={sub.monthly} className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">6 أشهر (ر.س)</span><input name="sub6mo" type="number" min={0} defaultValue={sub.sixmo} className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">سنوي (ر.س)</span><input name="subYearly" type="number" min={0} defaultValue={sub.yearly} className={num} /></label>
        </div>
        <label className="space-y-1 block"><span className="text-xs font-bold">مهلة السماح بعد الانتهاء (أيام) — يبقى المتجر محفوظاً ويُمنع من العرض فقط</span><input name="subGraceDays" type="number" min={0} defaultValue={sub.graceDays} className={num} /></label>

        <div className="flex items-center gap-2 border-t border-primary/15 pt-3 font-bold text-primary"><Megaphone className="h-5 w-5" /> تسعيرات الإعلانات (حسب المدة)</div>
        <div className="grid grid-cols-3 gap-2">
          <label className="space-y-1"><span className="text-xs font-bold">أسبوعان (ر.س)</span><input name="adW2" type="number" min={0} defaultValue={ad.w2} className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">شهر (ر.س)</span><input name="adM1" type="number" min={0} defaultValue={ad.m1} className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">ثلاثة أشهر (ر.س)</span><input name="adM3" type="number" min={0} defaultValue={ad.m3} className={num} /></label>
        </div>

        <div className="font-bold text-primary">رسوم التكرار (بالمدّة نفسها)</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1"><span className="text-xs font-bold">مكرّر 3 (ر.س)</span><input name="dup3" type="number" min={0} defaultValue={ad.dup3} className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">مكرّر 5 (ر.س)</span><input name="dup5" type="number" min={0} defaultValue={ad.dup5} className={num} /></label>
        </div>
        <p className="text-[11px] text-muted-foreground">رسوم «إعلان مميّز» و«إعلان مبوّب» و«رسوم التكرار الأساسية» تُضبط من صفحة <Link href="/admin/settings" className="font-bold text-primary underline">الإعدادات</Link>. شحن رصيد الأعضاء من صفحة <Link href="/admin/users" className="font-bold text-primary underline">الأعضاء</Link>.</p>
        <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white"><Save className="h-4 w-4" /> حفظ التسعيرات</button>
      </form>

      {/* آخر العمليات */}
      <div className="card-3d rounded-2xl p-4">
        <div className="mb-2 text-sm font-bold text-primary">آخر العمليات ({rev.recent.length})</div>
        {rev.recent.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">لا توجد عمليات بعد.</p>
        ) : (
          <ul className="space-y-1">
            {rev.recent.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 border-b border-border/40 py-1.5 text-xs last:border-0">
                <Link href={`/admin/users/${t.userId}`} className="min-w-0 flex-1 truncate font-bold text-primary hover:underline">{t.userName}</Link>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{t.label}</span>
                <span className={`shrink-0 font-bold ${t.amount > 0 ? 'text-sky-600' : 'text-emerald-600'}`}>{t.amount > 0 ? '+' : ''}{en(t.amount)}</span>
                <span className="shrink-0 text-muted-foreground">{fmt(t.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
