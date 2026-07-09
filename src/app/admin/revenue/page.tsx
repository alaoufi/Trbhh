import Link from 'next/link';
import { Wallet, TrendingUp, TrendingDown, Coins, Crown, Megaphone, Save, Check, Users, ListChecks, ReceiptText, Trash2, ArrowRight, Scale, Landmark } from 'lucide-react';
import { requireAction } from '@/lib/roles';
import { prisma } from '@/lib/prisma';
import { toInt } from '@/lib/utils';
import { getRevenueSummary, getMemberLedger, listSiteExpenses, listTxns, getBalance, getMonthlyBudget } from '@/lib/wallet';
import { getStoreSubPricing, getStoreSubReminderConfig, getServicePricing, getTopupAccounts, getTopupPromo, getVerifyGift, getTrbhhShowPricing, DURATIONS, SERVICE_LABELS, servicePriceKey, type PaidService } from '@/lib/settings';
import { saveRevenueAction, addSiteExpenseAction, deleteSiteExpenseAction, addTopupAccountAction, deleteTopupAccountAction } from '../actions';

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
  { key: 'expenses', label: 'المصروفات', icon: ReceiptText },
  { key: 'accounts', label: 'حسابات الشحن', icon: Landmark },
  { key: 'pricing', label: 'التسعيرات', icon: ListChecks },
] as const;
type TabKey = typeof TABS[number]['key'];

export default async function AdminRevenuePage({ searchParams }: { searchParams: Promise<{ saved?: string; tab?: string; user?: string }> }) {
  await requireAction('users', 'view');
  const { saved, tab, user } = await searchParams;
  const active: TabKey = tab === 'balances' || tab === 'pricing' || tab === 'expenses' || tab === 'accounts' ? tab : 'overview';
  const userId = Number(user || 0) || 0;

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
      {active === 'balances' && (userId ? <MemberDetailTab userId={userId} /> : <BalancesTab />)}
      {active === 'expenses' && <ExpensesTab />}
      {active === 'accounts' && <AccountsTab />}
      {active === 'pricing' && <PricingTab />}
    </div>
  );
}

async function OverviewTab() {
  const [rev, expenses, monthly] = await Promise.all([getRevenueSummary(40), listSiteExpenses(1), getMonthlyBudget(12)]);
  const net = rev.spent - expenses.total;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile icon={TrendingUp} value={`${en(rev.credited)}`} label="إجمالي الشحن (الدخل)" tone="text-sky-600" />
        <Tile icon={TrendingDown} value={`${en(rev.spent)}`} label="الإيراد الفعلي (المستهلك)" tone="text-emerald-600" />
        <Tile icon={ReceiptText} value={`${en(expenses.total)}`} label="مصروفات الموقع" tone="text-red-500" />
        <Tile icon={Scale} value={`${net >= 0 ? '' : '−'}${en(Math.abs(net))}`} label="صافي الميزانية (الإيراد − المصروفات)" tone={net >= 0 ? 'text-emerald-600' : 'text-red-500'} />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-1">
        <Tile icon={Wallet} value={`${en(rev.outstanding)}`} label="أرصدة الأعضاء المتبقّية (التزامات قائمة)" />
      </div>
      {/* الميزانية بالشهور — أعمدة مقارنة: دخل / إيراد / مصروفات */}
      {monthly.length > 0 && (() => {
        const maxV = Math.max(1, ...monthly.map((m) => Math.max(m.income, m.revenue, m.expenses)));
        return (
          <div className="card-3d rounded-xl p-3">
            <div className="mb-2 text-sm font-bold text-primary">الميزانية بالشهور (آخر ١٢ شهراً)</div>
            <div className="mb-2 flex flex-wrap gap-3 text-[11px] font-bold">
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-sky-500" /> الدخل (شحن)</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> الإيراد (المستهلك)</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-red-400" /> المصروفات</span>
            </div>
            <div className="space-y-2">
              {monthly.map((m) => (
                <div key={m.month} className="space-y-0.5">
                  <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground">
                    <span dir="ltr">{m.month}</span>
                    <span>دخل {en(m.income)} • إيراد {en(m.revenue)} • مصروف {en(m.expenses)}</span>
                  </div>
                  <div className="flex h-2 overflow-hidden rounded-full bg-secondary/60"><div className="bg-sky-500" style={{ width: `${(m.income / maxV) * 100}%` }} /></div>
                  <div className="flex h-2 overflow-hidden rounded-full bg-secondary/60"><div className="bg-emerald-500" style={{ width: `${(m.revenue / maxV) * 100}%` }} /></div>
                  <div className="flex h-2 overflow-hidden rounded-full bg-secondary/60"><div className="bg-red-400" style={{ width: `${(m.expenses / maxV) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {rev.creditByReason.length > 0 && (
        <div className="card-3d rounded-xl p-3">
          <div className="mb-2 text-sm font-bold text-sky-700">الدخل (الشحن) حسب النوع</div>
          <ul className="space-y-1 text-sm">
            {rev.creditByReason.map((r) => (
              <li key={r.reason} className="flex items-center justify-between"><span className="text-muted-foreground">{r.label}</span><b className="text-sky-700">{en(r.total)} ر.س</b></li>
            ))}
          </ul>
        </div>
      )}
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
                <td className="p-2 text-right"><Link href={`/admin/revenue?tab=balances&user=${r.userId}`} className="font-bold text-primary hover:underline">{r.name}</Link></td>
                <td className="p-2 text-sky-600">{en(r.credited)}</td>
                <td className="p-2 text-emerald-600">{en(r.consumed)}</td>
                <td className="p-2 font-bold">{en(r.balance)}</td>
                <td className="p-2">{en(r.dupCredit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">اضغط اسم العضو لكشف حساب مفصّل (من أول شحن حتى آخر حركة). شحن/خصم رصيد أي عضو من صفحته في <Link href="/admin/users" className="font-bold text-primary underline">الأعضاء</Link>.</p>
    </div>
  );
}

/** كشف حساب مفصّل لعضو: كل حركة برصيدها الجاري — من بداية الشحن حتى انتهاء الرصيد. */
async function MemberDetailTab({ userId }: { userId: number }) {
  const [u, txns, balance] = await Promise.all([
    prisma.users.findUnique({ where: { id: BigInt(userId) }, select: { id: true, name: true, userName: true } }).catch(() => null),
    listTxns(userId, 200),
    getBalance(userId),
  ]);
  const name = u ? (u.name || u.userName || `#${toInt(u.id)}`) : `#${userId}`;
  const ordered = [...txns].reverse(); // من الأقدم (أول شحن) إلى الأحدث
  const credited = txns.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0);
  const consumed = txns.filter((t) => t.amount < 0).reduce((a, t) => a + Math.abs(t.amount), 0);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/admin/revenue?tab=balances" className="flex items-center gap-1 rounded-full border-2 border-primary/25 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/5"><ArrowRight className="h-3.5 w-3.5" /> كل الأرصدة</Link>
        <h2 className="text-lg font-extrabold text-primary">كشف حساب: <Link href={`/admin/users/${userId}`} className="underline">{name}</Link></h2>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Tile icon={TrendingUp} value={`${en(credited)}`} label="إجمالي المشحون" tone="text-sky-600" />
        <Tile icon={TrendingDown} value={`${en(consumed)}`} label="إجمالي المستهلك" tone="text-emerald-600" />
        <Tile icon={Wallet} value={`${en(balance)}`} label="الرصيد الحالي" />
      </div>
      <div className="card-3d overflow-x-auto rounded-2xl p-2">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="p-2 text-right">التاريخ</th>
              <th className="p-2 text-right">العملية</th>
              <th className="p-2">المبلغ</th>
              <th className="p-2">الرصيد بعدها</th>
            </tr>
          </thead>
          <tbody>
            {ordered.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">لا توجد حركات لهذا العضو.</td></tr>}
            {ordered.map((t) => (
              <tr key={t.id} className="border-b border-border/40 text-center last:border-0">
                <td className="p-2 text-right text-xs text-muted-foreground">{fmt(t.at)}</td>
                <td className="p-2 text-right">
                  <div className="font-bold">{t.label}{t.byAdmin ? ' • بواسطة الإدارة' : ''}</div>
                  {t.note && <div className="text-[11px] text-muted-foreground">{t.note}</div>}
                </td>
                <td className={`p-2 font-bold ${t.amount > 0 ? 'text-sky-600' : 'text-emerald-600'}`}>{t.amount > 0 ? '+' : ''}{en(t.amount)}</td>
                <td className="p-2 font-extrabold">{en(t.balanceAfter)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">الكشف مرتّب من أول شحن إلى آخر حركة، وعمود «الرصيد بعدها» يبيّن الرصيد الجاري بعد كل عملية حتى انتهائه.</p>
    </div>
  );
}

/** مصروفات الموقع — إضافة/حذف بنود تدخل في الميزانية المفصلة. */
async function ExpensesTab() {
  const { rows, total } = await listSiteExpenses(300);
  const day = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('ar', { dateStyle: 'medium' }).format(d);
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2">
        <Tile icon={ReceiptText} value={`${en(total)}`} label="إجمالي مصروفات الموقع (ر.س)" tone="text-red-500" />
      </div>
      <form action={addSiteExpenseAction} className="card-3d space-y-2 rounded-2xl p-4">
        <div className="text-sm font-bold text-primary">إضافة مصروف</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1"><span className="text-xs font-bold">البند</span><input name="label" required placeholder="مثال: استضافة، رسائل SMS، تسويق…" className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">المبلغ (ر.س)</span><input name="amount" type="number" min={1} step={1} required className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">التاريخ</span><input name="spentAt" type="date" className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">ملاحظة (اختياري)</span><input name="note" className={num} /></label>
        </div>
        <button className="btn-3d rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">إضافة المصروف</button>
      </form>
      <div className="card-3d overflow-x-auto rounded-2xl p-2">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="p-2 text-right">البند</th>
              <th className="p-2">المبلغ</th>
              <th className="p-2">التاريخ</th>
              <th className="p-2 text-right">ملاحظة</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">لا توجد مصروفات مسجّلة بعد.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/40 text-center last:border-0">
                <td className="p-2 text-right font-bold">{r.label}</td>
                <td className="p-2 font-bold text-red-500">{en(r.amount)}</td>
                <td className="p-2 text-xs text-muted-foreground">{day(r.spentAt)}</td>
                <td className="p-2 text-right text-xs text-muted-foreground">{r.note || '—'}</td>
                <td className="p-2">
                  <form action={deleteSiteExpenseAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <button aria-label="حذف" className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">المصروفات تدخل في «الميزانية»: صافي الميزانية = الإيراد الفعلي − المصروفات.</p>
    </div>
  );
}

/** حسابات الشحن — تظهر للأعضاء في «محفظتي» (البنك/رقم الحساب/الاسم) مع أزرار نسخ. */
async function AccountsTab() {
  const accounts = await getTopupAccounts();
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">هذه الحسابات تظهر للأعضاء في «محفظتي» ضمن «شحن رصيدك» — كل حقل بزر نسخ، وتحت الاسم عبارة تنبيه (تُعدَّل من «النصوص» ← المحفظة). يمكنك إضافة أكثر من حساب.</p>
      <form action={addTopupAccountAction} className="card-3d space-y-2 rounded-2xl p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-primary"><Landmark className="h-4 w-4" /> إضافة حساب</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="space-y-1"><span className="text-xs font-bold">البنك</span><input name="bank" placeholder="مثال: الراجحي" className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">رقم الحساب</span><input name="number" dir="ltr" className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">الآيبان (IBAN)</span><input name="iban" dir="ltr" placeholder="SA…" className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">اسم صاحب الحساب</span><input name="name" className={num} /></label>
        </div>
        <button className="btn-3d rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">إضافة الحساب</button>
      </form>
      <div className="space-y-2">
        {accounts.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">لا توجد حسابات بعد — أضف حساباً ليظهر للأعضاء في «محفظتي».</p>}
        {accounts.map((a, i) => (
          <div key={i} className="card-3d flex flex-wrap items-center gap-3 rounded-xl p-3 text-sm">
            <div className="min-w-0 flex-1 space-y-0.5">
              {a.bank && <div><span className="text-xs font-bold text-muted-foreground">البنك: </span><b>{a.bank}</b></div>}
              {a.number && <div><span className="text-xs font-bold text-muted-foreground">رقم الحساب: </span><b dir="ltr" className="break-all text-primary">{a.number}</b></div>}
              {a.iban && <div><span className="text-xs font-bold text-muted-foreground">الآيبان: </span><b dir="ltr" className="break-all text-primary">{a.iban}</b></div>}
              {a.name && <div><span className="text-xs font-bold text-muted-foreground">الاسم: </span><b>{a.name}</b></div>}
            </div>
            <form action={deleteTopupAccountAction}>
              <input type="hidden" name="idx" value={i} />
              <button aria-label="حذف الحساب" className="flex items-center gap-1 rounded-lg border border-red-300 px-2.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> حذف</button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}

async function PricingTab() {
  const [sub, prices, remind, promo, verifyGift, show] = await Promise.all([getStoreSubPricing(), getServicePricing(), getStoreSubReminderConfig(), getTopupPromo(), getVerifyGift(), getTrbhhShowPricing()]);
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
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1"><span className="text-xs font-bold">أيام التجربة المجانية عند فتح المتجر</span><input name="subTrialDays" type="number" min={0} defaultValue={sub.trialDays} className={num} /></label>
        <label className="space-y-1"><span className="text-xs font-bold">مهلة السماح بعد الانتهاء (أيام)</span><input name="subGraceDays" type="number" min={0} defaultValue={sub.graceDays} className={num} /></label>
      </div>
      <p className="text-[11px] text-muted-foreground">التجربة تبدأ فور فتح المتجر ثم يبدأ الاشتراك. المهلة: يبقى المتجر محفوظاً ويُمنع من العرض فقط. (اكتب 0 لتعطيل التجربة).</p>

      <div className="rounded-xl border border-primary/15 bg-primary/5 p-3">
        <div className="mb-1 text-xs font-bold text-primary">تنبيهات قرب انتهاء الاشتراك</div>
        <p className="mb-2 text-[11px] text-muted-foreground">تُرسل رسالة تنبيه لصاحب المتجر قبل انتهاء اشتراكه. يُعدَّل نصّها من تبويب «النصوص الظاهرة». اكتب 0 للتعطيل.</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1"><span className="text-xs font-bold">قبل كم يوم يبدأ التنبيه</span><input name="subRemindDays" type="number" min={0} defaultValue={remind.days} className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">كم مرة (مرة/يوم كحدّ أقصى)</span><input name="subRemindCount" type="number" min={0} defaultValue={remind.count} className={num} /></label>
        </div>
      </div>

      {/* الظهور المدفوع في تربح — عرض المتجر بالمدد + باقات عرض الإعلان (سعر ومدة لكل باقة) */}
      <div className="rounded-xl border border-sky-300 bg-sky-50/60 p-3">
        <div className="mb-1 text-xs font-bold text-sky-800">🏪 الظهور في تربح (للمتاجر) — اكتب 0 في السعر لتعطيل الخيار</div>
        <p className="mb-2 text-[11px] text-muted-foreground">يشتريها التاجر من لوحة متجره وتُخصم من رصيده. عرض المتجر يُظهر المتجر ومنتجاته بقسم المتاجر في الرئيسية، وباقة الإعلان تُظهر إعلاناً محدداً في كل قوائم تربح للمدة المحددة.</p>
        <div className="mb-1 text-xs font-bold">عرض المتجر في تربح (السعر لكل مدة)</div>
        <div className="grid grid-cols-3 gap-2">
          <label className="space-y-1"><span className="text-xs font-bold">أسبوعان</span><input name="showStoreW2" type="number" min={0} defaultValue={show.store.w2} className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">شهر</span><input name="showStoreM1" type="number" min={0} defaultValue={show.store.m1} className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">سنة</span><input name="showStoreY1" type="number" min={0} defaultValue={show.store.y1} className={num} /></label>
        </div>
        <div className="mb-1 mt-3 text-xs font-bold">باقات عرض إعلان المتجر في تربح (السعر والمدة لكل باقة)</div>
        <div className="space-y-2">
          {show.ads.map((p0) => (
            <div key={p0.key} className="grid grid-cols-3 items-end gap-2">
              <div className="text-sm font-bold">{p0.key === 'gold' ? '🥇' : p0.key === 'silver' ? '🥈' : '⭐'} {p0.label}</div>
              <label className="space-y-1"><span className="text-xs font-bold">السعر (ر.س)</span><input name={`showAd_${p0.key}`} type="number" min={0} defaultValue={p0.price} className={num} /></label>
              <label className="space-y-1"><span className="text-xs font-bold">المدة (أيام)</span><input name={`showAdDays_${p0.key}`} type="number" min={1} defaultValue={p0.days} className={num} /></label>
            </div>
          ))}
        </div>
      </div>

      {/* عروض الشحن والمكافآت — 0 = معطّل */}
      <div className="rounded-xl border border-emerald-300 bg-emerald-50/60 p-3">
        <div className="mb-1 text-xs font-bold text-emerald-800">🎁 عروض الشحن والمكافآت (اكتب 0 للتعطيل)</div>
        <p className="mb-2 text-[11px] text-muted-foreground">تُضاف المكافآت تلقائياً فور تأكيد الشحن أو التوثيق، وتظهر في محفظة العضو والميزانية.</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1"><span className="text-xs font-bold">نسبة مكافأة الشحن %</span><input name="topupBonusPct" type="number" min={0} max={100} defaultValue={promo.pct} className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">الحد الأدنى للمبلغ (ر.س)</span><input name="topupBonusMin" type="number" min={0} defaultValue={promo.min} className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">مكافأة أول شحن (ر.س)</span><input name="topupFirstBonus" type="number" min={0} defaultValue={promo.first} className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">هدية التوثيق (ر.س — مرة واحدة)</span><input name="verifyGift" type="number" min={0} defaultValue={verifyGift} className={num} /></label>
        </div>
      </div>

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
