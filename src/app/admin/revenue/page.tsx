import Link from 'next/link';
import { Wallet, TrendingUp, TrendingDown, Coins, Crown, Megaphone, Save, Check, Users, ListChecks } from 'lucide-react';
import { requireAction } from '@/lib/roles';
import { getRevenueSummary, getMemberLedger } from '@/lib/wallet';
import { getStoreSubPricing, getServicePricing, DURATIONS, SERVICE_LABELS, servicePriceKey, type PaidService } from '@/lib/settings';
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

const num = 'h-10 w-full rounded-lg border border-primary/30 bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-primary/40';
const TABS = [
  { key: 'overview', label: 'الميزانية', icon: Coins },
  { key: 'balances', label: 'أرصدة الأعضاء', icon: Users },
  { key: 'pricing', label: 'التسعيرات', icon: ListChecks },
] as const;
type TabKey = typeof TABS[number]['key'];

export default async function AdminRevenuePage({ searchParams }: { searchParams: Promise<{ saved?: string; tab?: string }> }) {
  await requireAction('users', 'view');
  const { saved, tab } = await searchParams;
  const active: TabKey = tab === 'balances' || tab === 'pricing' ? tab : 'overview';

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="flex items-center gap-2 text-xl font-extrabold text-primary"><Coins className="h-6 w-6" /> الإيرادات والتسعير</h1>
      {saved === '1' && <div className="flex items-center gap-2 rounded-lg border-2 border-green-300 bg-green-50 p-3 text-sm font-bold text-green-800"><Check className="h-4 w-4" /> تم الحفظ.</div>}

      {/* التبويبات */}
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-secondary/40 p-1">
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin/revenue?tab=${t.key}`} className={`flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-bold ${active === t.key ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-white/60'}`}>
            <t.icon className="h-4 w-4" /> {t.label}
          </Link>
        ))}
      </div>

      {active === 'overview' && <OverviewTab />}
      {active === 'balances' && <BalancesTab />}
      {active === 'pricing' && <PricingTab />}
    </div>
  );
}

async function OverviewTab() {
  const rev = await getRevenueSummary(40);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Tile icon={TrendingDown} value={`${en(rev.spent)}`} label="الإيراد الفعلي (المستهلك)" tone="text-emerald-600" />
        <Tile icon={TrendingUp} value={`${en(rev.credited)}`} label="إجمالي الشحن" tone="text-sky-600" />
        <Tile icon={Wallet} value={`${en(rev.outstanding)}`} label="الرصيد الكلي المتبقّي" />
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

async function BalancesTab() {
  const rows = await getMemberLedger(300);
  const totals = rows.reduce((a, r) => ({ credited: a.credited + r.credited, consumed: a.consumed + r.consumed, balance: a.balance + r.balance }), { credited: 0, consumed: 0, balance: 0 });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Tile icon={TrendingUp} value={`${en(totals.credited)}`} label="إجمالي المشحون" tone="text-sky-600" />
        <Tile icon={TrendingDown} value={`${en(totals.consumed)}`} label="إجمالي المستهلك" tone="text-emerald-600" />
        <Tile icon={Wallet} value={`${en(totals.balance)}`} label="إجمالي المتبقّي" />
      </div>
      <div className="card-3d overflow-x-auto rounded-2xl p-2">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="p-2 text-right">العضو</th>
              <th className="p-2">المشحون</th>
              <th className="p-2">المستهلك</th>
              <th className="p-2">المتبقّي</th>
              <th className="p-2">نشرات تكرار</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">لا توجد حركات مالية بعد.</td></tr>}
            {rows.map((r) => (
              <tr key={r.userId} className="border-b border-border/40 text-center last:border-0">
                <td className="p-2 text-right"><Link href={`/admin/users/${r.userId}`} className="font-bold text-primary hover:underline">{r.name}</Link></td>
                <td className="p-2 text-sky-600">{en(r.credited)}</td>
                <td className="p-2 text-emerald-600">{en(r.consumed)}</td>
                <td className="p-2 font-bold">{en(r.balance)}</td>
                <td className="p-2">{en(r.dupCredit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">شحن/خصم رصيد أي عضو من صفحته في <Link href="/admin/users" className="font-bold text-primary underline">الأعضاء</Link>.</p>
    </div>
  );
}

async function PricingTab() {
  const [sub, prices] = await Promise.all([getStoreSubPricing(), getServicePricing()]);
  const services: { key: PaidService; note?: string }[] = [
    { key: 'featured' },
    { key: 'classified', note: 'إعلان واحد حسب المدّة' },
    { key: 'dup3', note: 'يرفع حظر التكرار لـ 3 إعلانات' },
    { key: 'dup5', note: 'يرفع حظر التكرار لـ 5 إعلانات' },
  ];
  return (
    <form action={saveRevenueAction} className="card-3d space-y-4 rounded-2xl p-4">
      <div className="flex items-center gap-2 font-bold text-primary"><Crown className="h-5 w-5" /> اشتراك المتاجر</div>
      <label className="flex items-center gap-2 text-sm font-bold">
        <input type="checkbox" name="subEnabled" defaultChecked={sub.enabled} className="h-4 w-4 accent-[hsl(var(--primary))]" />
        تفعيل اشتراكات المتاجر (يُشترط اشتراك ساري لظهور المتجر)
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="space-y-1"><span className="text-xs font-bold">شهري</span><input name="subMonthly" type="number" min={0} defaultValue={sub.monthly} className={num} /></label>
        <label className="space-y-1"><span className="text-xs font-bold">6 أشهر</span><input name="sub6mo" type="number" min={0} defaultValue={sub.sixmo} className={num} /></label>
        <label className="space-y-1"><span className="text-xs font-bold">سنوي</span><input name="subYearly" type="number" min={0} defaultValue={sub.yearly} className={num} /></label>
      </div>
      <label className="block space-y-1"><span className="text-xs font-bold">مهلة السماح بعد الانتهاء (أيام) — يبقى المتجر محفوظاً ويُمنع من العرض فقط</span><input name="subGraceDays" type="number" min={0} defaultValue={sub.graceDays} className={num} /></label>

      <div className="flex items-center gap-2 border-t border-primary/15 pt-3 font-bold text-primary"><Megaphone className="h-5 w-5" /> تسعيرات الخدمات (السعر لكل مدّة)</div>
      <p className="text-[11px] text-muted-foreground">المدّة اختيار فقط بلا سعر مستقل؛ كل خدمة لها سعر لكل مدّة. اترك 0 لتعطيل الخدمة/المدّة.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="p-1 text-right">الخدمة</th>
              {DURATIONS.map((d) => <th key={d.key} className="p-1">{d.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.key}>
                <td className="p-1 text-right align-top">
                  <div className="text-sm font-bold">{SERVICE_LABELS[s.key]}</div>
                  {s.note && <div className="text-[10px] text-muted-foreground">{s.note}</div>}
                </td>
                {DURATIONS.map((d) => (
                  <td key={d.key} className="p-1"><input name={servicePriceKey(s.key, d.key)} type="number" min={0} defaultValue={prices[s.key][d.key]} className={num} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white"><Save className="h-4 w-4" /> حفظ التسعيرات</button>
    </form>
  );
}
