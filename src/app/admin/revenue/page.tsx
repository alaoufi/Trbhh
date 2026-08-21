import Link from 'next/link';
import { Wallet, TrendingUp, TrendingDown, Coins, Crown, Megaphone, Save, Check, Users, ListChecks, ReceiptText, Trash2, ArrowRight, Scale, Landmark, HandCoins, Star, Settings2, WalletCards } from 'lucide-react';
import { requireAction, getUserPerms } from '@/lib/roles';
import { prisma } from '@/lib/prisma';
import { toInt } from '@/lib/utils';
import { getRevenueSummary, getMemberLedger, listSiteExpenses, listTxns, getBalance, getMonthlyBudget } from '@/lib/wallet';
import { getStoreSubPricing, getStoreSubReminderConfig, getServicePricing, getTopupAccounts, getTopupPromo, getVerifyGift, getTrbhhShowPricing, getAdExtras, getStorePlusPricing, getLeadConfig, getAuctionConfig, getUrgentPrices, getTopupCampaigns, getActiveTopupCampaign, topupCampaignsHealth, campaignState, DURATIONS, SERVICE_LABELS, servicePriceKey, getAdRestoreFee, getPlatformAdLifecycleConfig, type PaidService } from '@/lib/settings';
import { pointsEnabled, getPointsConfig, referralEnabled, getReferralReward, getWelcomeCredit } from '@/lib/points';
import { getPackages, type Package } from '@/lib/packages';
import { getPromoPackages, type PromoPackage } from '@/lib/promos';
import {
  saveRevenueAction, addSiteExpenseAction, deleteSiteExpenseAction, addTopupAccountAction, deleteTopupAccountAction, addTopupCampaignAction, deleteTopupCampaignAction,
  createPackageAction, updatePackageAction, deletePackageAction, createPromoPackageAction, updatePromoPackageAction, deletePromoPackageAction,
  createMemberServiceOrderAction, cancelPendingMemberServiceOrderAdminAction,
} from '../actions';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { Collapse } from '@/components/admin-collapse';
import { TopupBannerStudio } from '@/components/admin/topup-banner-studio';

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
  { key: 'wallets', label: 'محافظ الأعضاء', icon: WalletCards },
  { key: 'expenses', label: 'المصروفات', icon: ReceiptText },
  { key: 'accounts', label: 'حسابات الشحن', icon: Landmark },
  { key: 'campaigns', label: 'الحملات', icon: Megaphone },
  { key: 'payments', label: 'المدفوعات', icon: HandCoins },
  { key: 'pricing', label: 'الباقات والخدمات', icon: ListChecks },
] as const;
type TabKey = typeof TABS[number]['key'];

export default async function AdminRevenuePage({ searchParams }: { searchParams: Promise<{ saved?: string; tab?: string; user?: string; camp?: string; cat?: string; ppage?: string; q?: string; wallet?: string }> }) {
  const session = await requireAction('users', 'view');
  const { saved, tab, user, camp, cat, ppage, q, wallet } = await searchParams;
  const active: TabKey = tab === 'balances' || tab === 'wallets' || tab === 'pricing' || tab === 'expenses' || tab === 'accounts' || tab === 'campaigns' || tab === 'payments' ? tab : 'overview';
  const userId = Number(user || 0) || 0;
  const perms = await getUserPerms(session.uid);

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
      {active === 'wallets' && <MemberWalletsTab userId={userId} query={q || ''} notice={wallet || ''} />}
      {active === 'expenses' && <ExpensesTab />}
      {active === 'accounts' && <AccountsTab />}
      {active === 'campaigns' && <CampaignsTab camp={camp} />}
      {active === 'payments' && <PaymentsTab cat={cat} page={Math.max(1, parseInt(ppage || '1') || 1)} />}
      {active === 'pricing' && <PricingTab canPackages={perms.has('packages')} canPromos={perms.has('promos')} />}
    </div>
  );
}

async function MemberWalletsTab({ userId, query, notice }: { userId: number; query: string; notice: string }) {
  const [txns, orders, topups] = await Promise.all([
    prisma.wallet_txns.findMany({ orderBy: { id: 'desc' }, take: 800 }).catch(() => []),
    prisma.member_service_orders.findMany({ orderBy: { id: 'desc' }, take: 400 }).catch(() => []),
    prisma.wallet_topups.findMany({ orderBy: { id: 'desc' }, take: 400 }).catch(() => []),
  ]);
  const financialIds = new Set<number>([...txns.map((row) => toInt(row.user_id)), ...orders.map((row) => toInt(row.user_id)), ...topups.map((row) => toInt(row.user_id))]);
  const users = financialIds.size ? await prisma.users.findMany({ where: { id: { in: [...financialIds].map((id) => BigInt(id)) } }, select: { id: true, name: true, userName: true, phoneNumber: true, email: true, balance: true } }).catch(() => []) : [];
  const normalized = query.trim().toLowerCase();
  const providerUserIds = new Set(topups.filter((row) => (row.provider_ref || '').toLowerCase().includes(normalized)).map((row) => toInt(row.user_id)));
  const visibleUsers = users.filter((member) => !normalized || [member.name, member.userName, member.phoneNumber, member.email, String(toInt(member.id))].some((value) => (value || '').toLowerCase().includes(normalized)) || providerUserIds.has(toInt(member.id)));
  const member = userId ? users.find((row) => toInt(row.id) === userId) || null : null;
  const memberTxns = userId ? txns.filter((row) => toInt(row.user_id) === userId) : [];
  const memberOrders = userId ? orders.filter((row) => toInt(row.user_id) === userId) : [];
  const memberTopups = userId ? topups.filter((row) => toInt(row.user_id) === userId) : [];
  const nameOf = (id: number) => users.find((row) => toInt(row.id) === id)?.name || users.find((row) => toInt(row.id) === id)?.userName || `#${id}`;

  return <div className="space-y-4">
    {notice && <p className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">تم تحديث أمر الخدمة: {notice}</p>}
    <section className="card-3d space-y-3 rounded-2xl p-4">
      <div className="flex items-center gap-2 font-extrabold text-primary"><WalletCards className="h-5 w-5" /> محافظ الأعضاء</div>
      <form className="flex gap-2" action="/admin/revenue" method="get"><input type="hidden" name="tab" value="wallets" /><input name="q" defaultValue={query} placeholder="بحث ذكي في المحافظ: عضو، جوال، بريد، رقم عملية أو مرجع دفع" className="h-10 min-w-0 flex-1 rounded-lg border border-primary/30 px-3 text-sm" /><button className="rounded-lg bg-primary px-4 text-sm font-bold text-white">بحث</button></form>
      <p className="text-xs text-muted-foreground">تظهر الأعضاء ذوو تعامل مالي فقط. البحث يشمل الاسم والجوال والبريد ورقم العضو ومرجع الدفع الإلكتروني.</p>
      <div className="divide-y rounded-xl border border-primary/15">
        {visibleUsers.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">لا توجد محافظ مطابقة.</p>}
        {visibleUsers.map((row) => { const id = toInt(row.id); const charged = txns.filter((txn) => toInt(txn.user_id) === id && txn.amount < 0).reduce((sum, txn) => sum + Math.abs(txn.amount), 0); const activeCount = orders.filter((order) => toInt(order.user_id) === id && ['pending_acceptance', 'awaiting_execution', 'active'].includes(order.status)).length; return <Link key={id} href={`/admin/revenue?tab=wallets&user=${id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-primary/5"><span><b className="block">{nameOf(id)}</b><small className="text-muted-foreground">#{id} · خصم {charged} ر.س · خدمات قائمة {activeCount}</small></span><b className="text-emerald-700">{row.balance} ر.س</b></Link>; })}
      </div>
    </section>
    {member && <section className="space-y-3">
      <div className="card-3d rounded-2xl p-4"><h2 className="font-extrabold text-primary">محفظة {nameOf(userId)} <span className="text-sm text-muted-foreground">#{userId}</span></h2><p className="mt-2 text-2xl font-extrabold text-emerald-700">الرصيد المتاح: {member.balance} ر.س</p></div>
      <section className="card-3d rounded-2xl p-4"><h3 className="mb-3 font-extrabold">إنشاء خدمة خاصة</h3><form action={createMemberServiceOrderAction} className="grid gap-2 sm:grid-cols-2"><input type="hidden" name="userId" value={userId} /><input name="title" required maxLength={160} placeholder="اسم الخدمة" className={num} /><input name="amount" type="number" min={1} step={1} required placeholder="المبلغ (ر.س)" className={num} /><textarea name="description" maxLength={500} placeholder="وصف الخدمة" className="min-h-20 rounded-lg border border-primary/30 p-2 text-sm sm:col-span-2" /><label className="text-xs font-bold">البداية<input name="startsAt" type="datetime-local" required className={num} /></label><label className="text-xs font-bold">النهاية<input name="endsAt" type="datetime-local" required className={num} /></label><label className="text-xs font-bold sm:col-span-2">مهلة موافقة العضو<input name="acceptUntil" type="datetime-local" required className={num} /></label><button className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white sm:col-span-2">إنشاء مذكرة الخدمة دون خصم</button></form></section>
      <section className="card-3d rounded-2xl p-4"><h3 className="mb-2 font-extrabold">أوامر الخدمات</h3>{memberOrders.map((order) => <div key={toInt(order.id)} className="mb-2 rounded-lg border border-primary/15 p-3 text-sm"><b>{order.title} — {order.amount} ر.س</b><div className="text-xs text-muted-foreground">{order.status} · {fmt(order.starts_at?.toISOString() || null)} إلى {fmt(order.ends_at?.toISOString() || null)}</div>{order.status === 'pending_acceptance' && <form action={cancelPendingMemberServiceOrderAdminAction} className="mt-2 flex gap-2"><input type="hidden" name="orderId" value={toInt(order.id)} /><input type="hidden" name="userId" value={userId} /><input name="reason" placeholder="سبب الإلغاء" className="rounded border px-2 py-1 text-xs" /><button className="text-xs font-bold text-red-700">إلغاء قبل القبول</button></form>}</div>)}</section>
      <section className="card-3d rounded-2xl p-4"><h3 className="mb-2 font-extrabold">السجل المالي</h3>{memberTxns.map((txn) => <div key={toInt(txn.id)} className="flex justify-between border-b border-primary/10 py-2 text-sm"><span>{txn.note || txn.reason} <small className="block text-muted-foreground">#{toInt(txn.id)} · {fmt(txn.created_at?.toISOString() || null)}</small></span><b className={txn.amount >= 0 ? 'text-emerald-700' : 'text-red-600'}>{txn.amount >= 0 ? '+' : ''}{txn.amount} ر.س</b></div>)}{memberTopups.map((topup) => <div key={`topup-${toInt(topup.id)}`} className="border-b border-primary/10 py-2 text-xs">شحن #{toInt(topup.id)}: {topup.amount} ر.س — {topup.source === 'online' ? `بطاقة/بوابة ${topup.method || ''}` : 'تحويل بنكي'} {topup.provider_ref ? `· ${topup.provider_ref}` : ''}</div>)}</section>
    </section>}
  </div>;
}

async function OverviewTab() {
  const [rev, expenses, monthly] = await Promise.all([getRevenueSummary(40), listSiteExpenses(1), getMonthlyBudget(12)]);
  const net = rev.spent - expenses.total;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile icon={TrendingUp} value={`${en(rev.credited)}`} label="الدخل الحقيقي (شحن + إضافة إدارية)" tone="text-sky-600" />
        <Tile icon={TrendingDown} value={`${en(rev.spent)}`} label="الإيراد الفعلي (المستهلك)" tone="text-emerald-600" />
        <Tile icon={ReceiptText} value={`${en(expenses.total)}`} label="مصروفات الموقع" tone="text-red-500" />
        <Tile icon={Scale} value={`${net >= 0 ? '' : '−'}${en(Math.abs(net))}`} label="صافي الميزانية (الإيراد − المصروفات)" tone={net >= 0 ? 'text-emerald-600' : 'text-red-500'} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Tile icon={Wallet} value={`${en(rev.outstanding)}`} label="أرصدة الأعضاء المتبقّية (التزامات قائمة)" />
        <Tile icon={Coins} value={`${en(rev.bonuses)}`} label="مكافآت ممنوحة (خارج الميزانية)" tone="text-amber-600" />
      </div>
      <p className="text-[11px] text-muted-foreground">المكافآت (حملة الشحن، أول شحن، هدية التوثيق، الترحيبي، الإحالة، تحويل النقاط) أرصدة ممنوحة لا تدخل الميزانية: من حوّل 100 وحصل على 10 مكافأة — يدخل الميزانية 100 فقط.</p>
      {/* الميزانية بالشهور — أعمدة مقارنة: دخل / إيراد / مصروفات */}
      {monthly.length > 0 && (() => {
        const maxV = Math.max(1, ...monthly.map((m) => Math.max(m.income, m.revenue, m.expenses)));
        return (
          <div className="card-3d rounded-xl p-3">
            <div className="mb-2 text-sm font-bold text-primary">الميزانية بالشهور (آخر ١٢ شهراً)</div>
            <div className="mb-2 flex flex-wrap gap-3 text-[11px] font-bold">
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-sky-500" /> الدخل الحقيقي (بلا مكافآت)</span>
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
          <div className="mb-2 text-sm font-bold text-sky-700">الوارد حسب النوع (الشحن والإضافات دخلٌ حقيقي — والبقية مكافآت خارج الميزانية)</div>
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
        <Link href={`/admin/users/${userId}`} className="btn-3d rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">＋ إضافة / خصم رصيد</Link>
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
                    <ConfirmSubmit msg={`حذف مصروف «${r.label}» نهائياً؟`} title="حذف" className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></ConfirmSubmit>
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
              <ConfirmSubmit msg="حذف حساب الشحن هذا؟ لن يظهر للأعضاء في صفحة شحن الرصيد." title="حذف الحساب" className="flex items-center gap-1 rounded-lg border border-red-300 px-2.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> حذف</ConfirmSubmit>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}

async function CampaignsTab({ camp }: { camp?: string }) {
  const campaigns = await getTopupCampaigns();
  const activeCamp = await getActiveTopupCampaign().catch(() => null);
  const campHealth = await topupCampaignsHealth().catch(() => null);
  // 📊 سجل كل حملة: الشحن المؤكد خلال فترتها ومكافآتها وتفصيل الأعضاء — للمقارنة بين الحملات
  const { campaignTopupReport } = await import('@/lib/wallet');
  type CampReport = Awaited<ReturnType<typeof campaignTopupReport>>;
  const reports = new Map<number, CampReport>();
  await Promise.all(campaigns.map(async (c) => {
    if (campaignState(c) === 'upcoming') return;
    reports.set(c.id, await campaignTopupReport(c.from, c.to).catch(() => ({ total: 0, count: 0, bonuses: 0, members: [] })));
  }));
  const fmtCamp = (iso: string) => new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh' }).format(new Date(iso));
  const stateChip = (st: 'upcoming' | 'active' | 'ended') =>
    st === 'active' ? <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-extrabold text-white">✅ فعّالة الآن</span>
    : st === 'upcoming' ? <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-extrabold text-sky-700">⏳ قادمة</span>
    : <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-extrabold text-muted-foreground">⛔ منتهية</span>;
  return (
    <>
    {/* 🎁 حملات زيادة الشحن المجدولة — تبدأ من تاريخها وتختفي بانتهائها حتى تحين حملة أخرى */}
    <div className="card-3d mb-4 space-y-3 rounded-2xl border-2 border-emerald-300 p-4">
      <div className="flex items-center gap-2 font-bold text-emerald-800">🎁 حملات زيادة الشحن (بتواريخ)</div>
      {/* حالة البانر الحقيقية الآن — بنفس الدالة التي يقرأ منها البانر */}
      {activeCamp ? (
        <div className="rounded-lg border-2 border-emerald-400 bg-emerald-50 p-2 text-xs font-extrabold text-emerald-800">🟢 البانر ظاهر الآن في الرئيسية ولوحة العضو والمحفظة — حملة سارية{activeCamp.until ? ` حتى ${new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(activeCamp.until)}` : ''} ({activeCamp.tiers.length} شرائح).</div>
      ) : (
        <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-2 text-xs font-extrabold text-amber-800">🔴 البانر مخفي الآن — لا توجد حملة تاريخها يشمل هذه اللحظة. أضف حملة تبدأ من تاريخ اليوم (أو تشمل اليوم) ليظهر فوراً.</div>
      )}
      {campHealth && (!campHealth.storedOk || (campHealth.columnType !== 'text' && campHealth.columnType !== 'mediumtext' && campHealth.columnType !== 'longtext')) && (
        <div className="rounded-lg border-2 border-red-400 bg-red-50 p-2 text-xs font-extrabold text-red-700">
          ⚠ مشكلة تخزين: نوع عمود الإعدادات «{campHealth.columnType}»{!campHealth.storedOk ? ' والقيمة المخزنة مبتورة/تالفة' : ''} — أعد إضافة الحملة (الحفظ يصلّح العمود تلقائياً)، وإن تكررت فأعد تشغيل التطبيق بعد آخر تحديث.
        </div>
      )}
      {camp === '1' && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-xs font-bold text-emerald-800">✓ أُضيفت الحملة وتم التحقق من حفظها فعلياً.</div>}
      {camp === 'del' && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-xs font-bold text-emerald-800">✓ حُذفت الحملة.</div>}
      {camp === 'err' && <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-xs font-bold text-red-700">تعذّرت الإضافة — تأكد من التاريخ والمدة والشرائح (سطر لكل شريحة: المبلغ ثم المكافأة).</div>}
      {camp === 'overlap' && <div className="rounded-lg border-2 border-red-400 bg-red-50 p-2 text-xs font-bold text-red-700">⚠ الوقت يتداخل مع حملة قائمة في الجدول — لا يُسمح بأي تداخل ولو بدقيقة واحدة. عدّل التاريخ/الوقت/المدة، أو احذف الحملة المتداخلة أولاً.</div>}
      {camp === 'dberr' && <div className="rounded-lg border-2 border-red-400 bg-red-50 p-2 text-xs font-bold text-red-700">⚠ تعذّر الحفظ في قاعدة البيانات — أعد تشغيل التطبيق بعد آخر تحديث (يوسّع عمود الإعدادات تلقائياً) ثم أعد المحاولة.</div>}
      <p className="text-[11px] text-muted-foreground">
        جدولة عدة حملات بتواريخ مختلفة: كل حملة تبدأ تلقائياً <b>من تاريخها ولمدة الأيام المحددة</b> (مثال: من 2026/6/7 لمدة 3 أيام)، واترك المدة فارغة لحملة <b>مفتوحة بلا نهاية</b> تستمر حتى تحذفها. بانتهاء المدة يختفي البانر
        وتتوقف المكافآت حتى تحين الحملة التالية أو تضيف غيرها. <b>لا يُسمح بأي تداخل في أوقات الحملات ولو بدقيقة واحدة</b> — الفحص بالدقيقة والثانية، وأي حملة جديدة تتقاطع مع قائمة تُرفض (يجوز أن تبدأ لحظة انتهاء السابقة تماماً). الشرائح: سطر لكل شريحة «مبلغ الشحن ثم المكافأة»
        وتُعرض في البانر بنفس ترتيب إدخالك، والعداد التنازلي (يوم وساعة ودقيقة وثانية) يظهر تلقائياً حتى نهاية الحملة الفعّالة.
      </p>
      {campaigns.length > 0 ? (
        <ul className="space-y-2">
          {campaigns.map((c) => (
            <li key={c.id} className="space-y-1.5 rounded-xl border p-2.5">
              <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
                {stateChip(campaignState(c))}
                <span>{c.to ? <>من {fmtCamp(c.from)} لمدة {Math.max(1, Math.round((new Date(c.to).getTime() - new Date(c.from).getTime()) / 86400000))} يوم (حتى {fmtCamp(c.to)})</> : <>من {fmtCamp(c.from)} — <b className="text-emerald-700">مفتوحة (تستمر حتى تحذفها)</b></>}</span>
                <form action={deleteTopupCampaignAction} className="mr-auto">
                  <input type="hidden" name="id" value={c.id} />
                  <ConfirmSubmit msg="حذف هذه الحملة نهائياً؟ سيتوقف عرضها وسجلها من التقارير." className="rounded-lg border border-destructive/40 px-2 py-1 text-[11px] font-bold text-destructive">حذف</ConfirmSubmit>
                </form>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {c.tiers.map((t, i) => <span key={`${t.amount}-${i}`} className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800">اشحن {t.amount} تحصل على {t.bonus} ريال</span>)}
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-extrabold text-sky-800">قالب: {c.presentation.template}</span>
              </div>
              {/* 📊 سجل الحملة ونتائجها — لمقارنة الحملات ببعضها */}
              {(() => {
                const r = reports.get(c.id);
                if (!r) return <p className="text-[11px] font-bold text-sky-700">⏳ لم تبدأ بعد — سجلها يظهر مع أول شحن خلالها.</p>;
                return (
                  <details className="rounded-lg border border-emerald-200 bg-emerald-50/40">
                    <summary className="cursor-pointer list-none px-2.5 py-1.5 text-xs font-extrabold text-emerald-800">
                      📊 سجل الحملة: شحن مؤكد <b className="text-sky-700">{en(r.total)} ر.س</b> ({en(r.count)} عملية) · مكافآت ممنوحة <b className="text-amber-700">{en(r.bonuses)} ر.س</b> — اضغط للتفصيل
                    </summary>
                    <div className="border-t border-emerald-200 p-2.5">
                      {r.members.length === 0 ? (
                        <p className="text-center text-xs text-muted-foreground">لا يوجد شحن مؤكد خلال فترة هذه الحملة{campaignState(c) === 'active' ? ' بعد' : ''}.</p>
                      ) : (
                        <ul className="space-y-1">
                          {r.members.map((m) => (
                            <li key={m.userId} className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1 text-xs shadow-sm ring-1 ring-black/5">
                              <Link href={`/admin/users/${m.userId}`} className="min-w-0 flex-1 truncate font-bold text-primary hover:underline">{m.name}</Link>
                              <b className="shrink-0 text-sky-700">{en(m.amount)} ر.س</b>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </details>
                );
              })()}
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-[11px] font-extrabold text-amber-800">⚠ لا توجد حملات — البانر مخفي حتى تضيف حملة يشمل تاريخُها اليوم.</div>
      )}
      <Collapse summary={<span className="text-emerald-800">➕ إضافة حملة جديدة</span>} className="border-emerald-200 bg-emerald-50/40">
        <form action={addTopupCampaignAction} className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <label className="space-y-1"><span className="text-xs font-bold">تبدأ من تاريخ</span><input name="from" type="date" required className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">وقت البداية (اختياري)</span><input name="fromTime" type="time" defaultValue="00:00" className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">المدة (أيام) — فارغة = مفتوحة</span><input name="days" type="number" min={0} max={365} placeholder="3 أو اتركها فارغة" className={num} /></label>
        </div>
        {/* شرائح الحملة — حقلان مفصولان وواضحان لكل شريحة: مبلغ الشحن والمكافأة */}
        <TopupBannerStudio />
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-2 text-center text-xs font-extrabold text-emerald-800">
            <span>💳 مبلغ الشحن (ر.س)</span>
            <span>🎁 المكافأة (ر.س)</span>
          </div>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="grid grid-cols-2 gap-2">
              <input name="tierAmount" type="number" min={1} required={i === 0} placeholder={i === 0 ? '100' : i === 1 ? '200' : i === 2 ? '300' : ''} className={`${num} text-center font-bold`} />
              <input name="tierBonus" type="number" min={1} required={i === 0} placeholder={i === 0 ? '10' : i === 1 ? '25' : i === 2 ? '40' : ''} className={`${num} text-center font-bold`} />
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground">كل سطر شريحة مستقلة (الأسطر الفارغة تُتجاهل) — تُعرض في البانر بنفس هذا الترتيب، وتُطبَّق أعلى شريحة يبلغها مبلغ الشحن.</p>
        </div>
        <button className="btn-3d rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white">💾 إضافة الحملة</button>
        </form>
      </Collapse>
    </div>
    </>
  );
}

/* ===== المدفوعات المصنفة: كل ما دفعه الأعضاء مقابل الخدمات، بفلترة حسب الخدمة ===== */
const PAY_PAGE = 30;
async function PaymentsTab({ cat, page }: { cat?: string; page: number }) {
  const { REASON_LABELS } = await import('@/lib/wallet');
  const { prisma } = await import('@/lib/prisma');
  const { toInt } = await import('@/lib/utils');
  // فئات المدفوعات = أسباب الخصم مقابل خدمة (لا تشمل الشحن/المكافآت/الخصم الإداري)
  const PAY_REASONS = ['featured', 'urgent', 'bump', 'classified', 'duplicate', 'subscription', 'store_plus', 'store_show', 'ad_show', 'verify_fee', 'lead', 'auction'] as const;
  const catKey = PAY_REASONS.includes(cat as (typeof PAY_REASONS)[number]) ? (cat as (typeof PAY_REASONS)[number]) : '';
  // إجمالي وعدد كل فئة (المبالغ سالبة لأنها خصم — نعرض القيمة المطلقة)
  const sums = await prisma.wallet_txns.groupBy({ by: ['reason'], where: { reason: { in: [...PAY_REASONS] }, amount: { lt: 0 } }, _sum: { amount: true }, _count: { _all: true } }).catch(() => []);
  const sumBy = new Map(sums.map((g) => [g.reason, { total: Math.abs(g._sum.amount ?? 0), n: g._count._all }]));
  const grand = [...sumBy.values()].reduce((a, b) => a + b.total, 0);
  const where = { amount: { lt: 0 }, reason: catKey ? catKey : { in: [...PAY_REASONS] } };
  const total = await prisma.wallet_txns.count({ where }).catch(() => 0);
  const pages = Math.max(1, Math.ceil(total / PAY_PAGE));
  const cur = Math.min(page, pages);
  const rows = await prisma.wallet_txns.findMany({ where, orderBy: { id: 'desc' }, skip: (cur - 1) * PAY_PAGE, take: PAY_PAGE }).catch(() => []);
  const uids = [...new Set(rows.map((r) => toInt(r.user_id)))];
  const users = uids.length ? await prisma.users.findMany({ where: { id: { in: uids.map((u) => BigInt(u)) } }, select: { id: true, name: true, userName: true } }).catch(() => []) : [];
  const nameById = new Map(users.map((u) => [toInt(u.id), u.name || u.userName || `#${toInt(u.id)}`]));
  const fmtAt = (d: Date | null) => (d ? new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(d) : '');
  const chip = (key: string, label: string, totalV: number, n: number) => (
    <Link key={key || 'all'} href={`/admin/revenue?tab=payments${key ? `&cat=${key}` : ''}`} className={`flex flex-col items-center rounded-xl border-2 px-3 py-1.5 text-center ${catKey === key ? 'border-primary bg-primary text-white' : 'border-primary/20 bg-card text-primary hover:bg-primary/5'}`}>
      <span className="text-xs font-extrabold">{label}</span>
      <span className={`text-[11px] font-bold ${catKey === key ? 'text-white/90' : 'text-muted-foreground'}`}>{en(totalV)} ر.س · {en(n)}</span>
    </Link>
  );
  return (
    <div className="space-y-4">
      <div className="card-3d space-y-3 rounded-2xl p-4">
        <div className="flex items-center gap-2 font-bold text-primary"><HandCoins className="h-5 w-5" /> المدفوعات — كل ما دفعه الأعضاء مقابل الخدمات، مصنفاً</div>
        <p className="text-xs text-muted-foreground">تشمل الخصومات مقابل خدمة فقط (تمييز/عاجل/تحديث/مبوّبة/اشتراكات/عرض/توثيق/مزادات…) — الشحن والمكافآت والخصم الإداري في «الميزانية» و«أرصدة الأعضاء».</p>
        {/* فلترة بالفئات مع إجمالي وعدد كل فئة */}
        <div className="flex flex-wrap gap-1.5">
          {chip('', 'الكل', grand, [...sumBy.values()].reduce((a, b) => a + b.n, 0))}
          {PAY_REASONS.map((k) => { const v = sumBy.get(k); return v ? chip(k, REASON_LABELS[k], v.total, v.n) : null; })}
        </div>
        {rows.length === 0 && <p className="py-6 text-center text-muted-foreground">لا توجد مدفوعات في هذا التصنيف بعد.</p>}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="border-b-2 border-primary/15 text-xs text-muted-foreground"><th className="p-2 text-right">العضو</th><th className="p-2">الخدمة</th><th className="p-2">المبلغ</th><th className="p-2">التاريخ</th><th className="p-2 text-right">التفاصيل</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={String(r.id)} className="border-b border-border/40 text-center last:border-0">
                    <td className="p-2 text-right"><Link href={`/admin/revenue?tab=balances&user=${toInt(r.user_id)}`} className="font-bold text-primary hover:underline">{nameById.get(toInt(r.user_id)) || `#${toInt(r.user_id)}`}</Link></td>
                    <td className="p-2"><span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">{REASON_LABELS[r.reason as keyof typeof REASON_LABELS] ?? r.reason}</span></td>
                    <td className="p-2 font-extrabold text-emerald-700">{en(Math.abs(r.amount))} ر.س</td>
                    <td className="p-2 text-xs text-muted-foreground">{fmtAt(r.created_at)}</td>
                    <td className="p-2 text-right text-xs text-muted-foreground">{r.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="flex flex-wrap items-center justify-center gap-1 pt-1 text-sm">
            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
              <Link key={n} href={`/admin/revenue?tab=payments${catKey ? `&cat=${catKey}` : ''}&ppage=${n}`} className={`rounded-lg px-2.5 py-1 font-bold ${n === cur ? 'bg-primary text-white' : 'text-primary hover:bg-primary/5'}`}>{en(n)}</Link>
            ))}
            <span className="mr-2 text-xs text-muted-foreground">الإجمالي: {en(total)} عملية</span>
          </div>
        )}
      </div>
    </div>
  );
}

async function PricingTab({ canPackages, canPromos }: { canPackages: boolean; canPromos: boolean }) {
  const [sub, prices, remind, promo, verifyGift, show, extras, ptsOn, ptsCfg, refOn, refReward, welcome, plus, lead, auction, verifyPkgsAll, restoreFee, acctVerify, platformAds] = await Promise.all([
    getStoreSubPricing(), getServicePricing(), getStoreSubReminderConfig(), getTopupPromo(), getVerifyGift(), getTrbhhShowPricing(), getAdExtras(),
    pointsEnabled(), getPointsConfig(), referralEnabled(), getReferralReward(), getWelcomeCredit(),
    getStorePlusPricing(), getLeadConfig(), getAuctionConfig(),
    import('@/lib/settings').then(async (m) => {
      const [f1, d1, f2, d2, f3, d3] = await Promise.all([
        m.getSettingNum('verify_fee', 0), m.getSettingNum('verify_fee_days', 30),
        m.getSettingNum('verify_fee_2', 0), m.getSettingNum('verify_fee_days_2', 90),
        m.getSettingNum('verify_fee_3', 0), m.getSettingNum('verify_fee_days_3', 365),
      ]);
      return [{ fee: f1, days: d1 }, { fee: f2, days: d2 }, { fee: f3, days: d3 }];
    }),
    getAdRestoreFee(),
    import('@/lib/settings').then((m) => m.getAccountVerifyRenew()),
    getPlatformAdLifecycleConfig(),
  ]);
  const urgentPrices = await getUrgentPrices();
  const services: { key: PaidService; note?: string }[] = [
    { key: 'featured' },
    { key: 'classified', note: 'إعلان واحد حسب المدّة' },
    { key: 'dup3', note: 'يرفع حظر التكرار لـ 3 إعلانات' },
    { key: 'dup5', note: 'يرفع حظر التكرار لـ 5 إعلانات' },
  ];
  return (
    <>

    <p className="text-xs text-muted-foreground">كل تسعير في تربح — مهما كان نوعه — مجمَّع هنا في تبويب واحد بأقسامه؛ وأي تسعير جديد يُضاف مستقبلاً يُلحَق بنفس التبويب.</p>
    {/* قفزة سريعة بين الأقسام — الصفحة طويلة لأنها تجمع كل تسعير في تربح */}
    <div className="flex flex-wrap gap-1.5 rounded-xl border border-primary/15 bg-primary/5 p-2 text-xs font-bold">
      {canPackages && <a href="#packages" className="rounded-lg px-2 py-1 text-primary hover:bg-white">باقات عدد الإعلانات</a>}
      <a href="#store-sub" className="rounded-lg px-2 py-1 text-primary hover:bg-white">اشتراك المتجر والظهور</a>
      <a href="#ad-extras" className="rounded-lg px-2 py-1 text-primary hover:bg-white">عاجل وتحديث الإعلان</a>
      <a href="#restore-fee" className="rounded-lg px-2 py-1 text-primary hover:bg-white">استعادة الإعلان المؤرشف</a>
      <a href="#services-matrix" className="rounded-lg px-2 py-1 text-primary hover:bg-white">تمييز ومبوّب وتكرار</a>
      {canPromos && <a href="#promo-packages" className="rounded-lg px-2 py-1 text-primary hover:bg-white">باقات الإعلانات الترويجية</a>}
    </div>

    {canPackages && <PackagesSection />}

    <form action={saveRevenueAction} className="card-3d space-y-4 rounded-2xl p-4">
      <div id="store-sub" className="flex items-center gap-2 font-bold text-primary scroll-mt-20"><Crown className="h-5 w-5" /> اشتراك المتاجر</div>
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

      <div className="rounded-xl border-2 border-indigo-300 bg-indigo-50/70 p-3">
        <div className="mb-1 text-sm font-extrabold text-indigo-900">نشر الإعلانات في تربح</div>
        <p className="mb-3 text-[11px] leading-5 text-muted-foreground">لا يؤثر التفعيل على الإعلانات الحالية فوراً. عند التفعيل يصبح ظهور الإعلانات الجديدة حسب الحد المجاني والمدد أدناه، ثم يتطلب تجديداً مدفوعاً من المحفظة.</p>
        <label className="flex items-center gap-2 text-sm font-bold"><input name="platformAdLifecycleEnabled" type="checkbox" defaultChecked={platformAds.enabled} /> تفعيل رسوم ظهور الإعلانات في تربح</label>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="space-y-1"><span className="text-xs font-bold">إعلانات مجانية جديدة يومياً</span><input name="platformAdMemberFreeDailyLimit" type="number" min={0} defaultValue={platformAds.memberFreeDailyLimit} className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">مدة الظهور المجاني (أيام)</span><input name="platformAdMemberFreeDays" type="number" min={0} defaultValue={platformAds.memberFreeDays} className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">الأرشفة بعد الانتهاء (أيام، 0=إيقاف)</span><input name="platformAdArchiveAfterDays" type="number" min={0} defaultValue={platformAds.archiveAfterDays} className={num} /></label>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs font-bold"><label className="flex items-center gap-1"><input name="platformAdLockAdReplies" type="checkbox" defaultChecked={platformAds.lockAdReplies} /> قفل ردود محادثة الإعلان بعد الأرشفة</label><label className="flex items-center gap-1"><input name="platformAdSmsEnabled" type="checkbox" defaultChecked={platformAds.smsEnabled} /> إرسال SMS عند توفر البوابة</label></div>
        <div className="mt-3 space-y-2">{platformAds.packages.map((p) => <div key={p.key} className="grid grid-cols-3 items-center gap-2 rounded-lg bg-white p-2 text-xs"><label className="flex items-center gap-1 font-bold"><input name={`platformAdPkgActive_${p.key}`} type="checkbox" defaultChecked={p.active} /> {p.label}</label><span>{p.days} يوم · {p.price} ر.س</span><select name={`platformAdPkgAudience_${p.key}`} defaultValue={p.audience} className="rounded border p-1"><option value="both">عضو ومتجر</option><option value="member">عضو فقط</option><option value="store">متجر فقط</option></select></div>)}</div>
      </div>

      {/* خدمات الإعلان الإضافية: عاجل (باقتان) + تحديث (Bump) */}
      <div id="ad-extras" className="scroll-mt-20 rounded-xl border border-red-300 bg-red-50/50 p-3">
        <div className="mb-1 text-xs font-bold text-red-700">🔥 شارة «عاجل» — باقتان (سعر 0 = تعطيل الباقة) — و«تحديث الإعلان»</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1"><span className="text-xs font-bold">باقة عاجل 24 ساعة (ر.س)</span><input name="urgentPrice24" type="number" min={0} defaultValue={urgentPrices.p24} className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">باقة عاجل 48 ساعة (ر.س)</span><input name="urgentPrice48" type="number" min={0} defaultValue={urgentPrices.p48} className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">التحديث المجاني كل (أيام)</span><input name="bumpFreeDays" type="number" min={0} defaultValue={extras.bumpFreeDays} className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">سعر التحديث قبل الموعد (ر.س)</span><input name="bumpPrice" type="number" min={0} defaultValue={extras.bumpPrice} className={num} /></label>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">يختار المعلن باقة 24 أو 48 ساعة عند النشر أو من صفحة إعلانه. «تحديث» يرفع الإعلان لأعلى القوائم — مجاني كل عدد الأيام المحدد، وقبله يُخصم السعر من الرصيد (تفعيل زر التحديث نفسه من الإعدادات ← الميزات).</p>
      </div>

      {/* رسوم إعادة إظهار الإعلان المؤرشف — كانت مبعثرة داخل الإعدادات العامة */}
      <div id="restore-fee" className="scroll-mt-20 rounded-xl border border-orange-300 bg-orange-50/60 p-3">
        <div className="mb-1 text-xs font-bold text-orange-800">🗄️ رسوم إعادة إظهار الإعلان المؤرشف (0 = مجانية)</div>
        <p className="mb-2 text-[11px] text-muted-foreground">المبلغ الذي يُخصم من رصيد صاحب الإعلان عند «أعِد للظهور» من الأرشيف — مدة الأرشفة التلقائية نفسها (بالأيام) في «الإعدادات».</p>
        <label className="block max-w-[220px] space-y-1"><span className="text-xs font-bold">الرسوم (ر.س)</span><input name="adRestoreFee" type="number" min={0} defaultValue={restoreFee} className={num} /></label>
      </div>

      {/* مكافآت الشحن الثابتة — حملات الشحن المجدولة لها جدول مستقل أعلى هذا النموذج */}
      <div className="rounded-xl border border-emerald-300 bg-emerald-50/60 p-3">
        <div className="mb-1 text-xs font-bold text-emerald-800">🎁 مكافآت الشحن الثابتة (اكتب 0 للتعطيل)</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1"><span className="text-xs font-bold">مكافأة أول شحن (ر.س)</span><input name="topupFirstBonus" type="number" min={0} defaultValue={promo.first} className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">هدية التوثيق (ر.س — مرة واحدة)</span><input name="verifyGift" type="number" min={0} defaultValue={verifyGift} className={num} /></label>
        </div>
      </div>

      {/* ⭐ التوثيق المدفوع: ثلاث باقات (سعر + مدة) — يطلبها صاحب المتجر وتُخصم عند موافقة إدارة المتاجر */}
      <div className="rounded-xl border border-sky-300 bg-sky-50/60 p-3">
        <div className="mb-1 text-xs font-bold text-sky-800">⭐ توثيق المتجر المدفوع — ثلاث باقات (رسوم الباقة 0 = لا تظهر؛ الكل 0 = الخدمة معطلة)</div>
        <p className="mb-2 text-[11px] text-muted-foreground">يختار صاحب المتجر باقة ويتعهد بالالتزام بلوائح الموقع، وتُخصم الرسوم من رصيده عند موافقة إدارة المتاجر فقط — وأي إلغاء يعيد لرصيده قيمة الأيام غير المستخدمة تلقائياً.</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1"><span className="text-xs font-bold">باقة 1 — الرسوم (ر.س)</span><input name="verifyFee" type="number" min={0} defaultValue={verifyPkgsAll[0].fee} className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">باقة 1 — المدة (أيام)</span><input name="verifyFeeDays" type="number" min={1} defaultValue={verifyPkgsAll[0].days} className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">باقة 2 — الرسوم (ر.س)</span><input name="verifyFee2" type="number" min={0} defaultValue={verifyPkgsAll[1].fee} className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">باقة 2 — المدة (أيام)</span><input name="verifyFeeDays2" type="number" min={1} defaultValue={verifyPkgsAll[1].days} className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">باقة 3 — الرسوم (ر.س)</span><input name="verifyFee3" type="number" min={0} defaultValue={verifyPkgsAll[2].fee} className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">باقة 3 — المدة (أيام)</span><input name="verifyFeeDays3" type="number" min={1} defaultValue={verifyPkgsAll[2].days} className={num} /></label>
        </div>
        {/* توثيق الحساب العادي: أول توثيق بموافقة الإدارة (مجاناً بالمستندات)، ثم التجديد
            تلقائي بالحسم بلا موافقة. المدة 0 = دائم بلا انتهاء (السلوك الافتراضي). */}
        <div className="mt-3 border-t border-sky-200 pt-2">
          <div className="mb-1 text-xs font-bold text-sky-800">🪪 توثيق الحساب العادي — مدة الصلاحية والتجديد التلقائي</div>
          <p className="mb-2 text-[11px] text-muted-foreground">أول توثيق يبقى بموافقة الإدارة (بالمستندات، مجاناً). <b>المدة 0 = توثيق دائم بلا انتهاء</b> (كما هو الآن). عند ضبط مدة ورسم، ينتهي التوثيق بعدها ويُجدَّد فورياً بخصم الرسم من رصيد العضو دون موافقة.</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1"><span className="text-xs font-bold">مدة الصلاحية (أيام، 0 = دائم)</span><input name="acctVerifyDays" type="number" min={0} defaultValue={acctVerify.days} className={num} /></label>
            <label className="space-y-1"><span className="text-xs font-bold">رسم التجديد (ر.س)</span><input name="acctVerifyFee" type="number" min={0} defaultValue={acctVerify.fee} className={num} /></label>
          </div>
        </div>
      </div>

      {/* باقة متجر Plus + عمولة توصيل عميل */}
      <div className="rounded-xl border border-amber-400 bg-amber-50/60 p-3">
        <div className="mb-1 text-xs font-bold text-amber-800">⭐ باقة متجر Plus + عمولة توصيل عميل</div>
        <p className="mb-2 text-[11px] text-muted-foreground">باقة Plus صفقة واحدة للتاجر: اشتراك المتجر + عرضه في رئيسية تربح + شارة ⭐ طوال المدة. العمولة رسم صغير يُخصم من رصيد المتجر عن كل عميل جديد يضغط واتساب/اتصال (بسقف يومي) — ولا تمنع التواصل أبداً حتى مع رصيد غير كافٍ.</p>
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" name="plusOn" defaultChecked={plus.enabled} className="h-4 w-4 accent-[hsl(var(--primary))]" />
          تفعيل باقة متجر Plus (السعر 0 يخفي المدة)
        </label>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <label className="space-y-1"><span className="text-xs font-bold">Plus شهري</span><input name="plusMonthly" type="number" min={0} defaultValue={plus.monthly} className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">Plus ‏6 أشهر</span><input name="plus6mo" type="number" min={0} defaultValue={plus.sixmo} className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">Plus سنوي</span><input name="plusYearly" type="number" min={0} defaultValue={plus.yearly} className={num} /></label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" name="leadOn" defaultChecked={lead.enabled} className="h-4 w-4 accent-[hsl(var(--primary))]" />
          تفعيل عمولة توصيل العميل
        </label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="space-y-1"><span className="text-xs font-bold">العمولة عن كل عميل جديد (ر.س)</span><input name="leadPrice" type="number" min={0} defaultValue={lead.price} className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">السقف اليومي (عملاء يُحاسَب عنهم/متجر)</span><input name="leadDailyCap" type="number" min={1} defaultValue={lead.dailyCap} className={num} /></label>
        </div>
      </div>

      {/* المزادات: رسم الفتح + أقصى مدة (التفعيل من الإعدادات ← الميزات) */}
      <div className="rounded-xl border border-violet-300 bg-violet-50/60 p-3">
        <div className="mb-1 text-xs font-bold text-violet-800">🔨 المزادات (التفعيل من الإعدادات ← الميزات التفاعلية)</div>
        <p className="mb-2 text-[11px] text-muted-foreground">رسم يُخصم من رصيد العضو عند فتح مزاد على إعلانه (0 = فتح مجاني). المزايدات نفسها مجانية، والصفقة تُتم بين الفائز والبائع مباشرة.</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1"><span className="text-xs font-bold">رسم فتح المزاد (ر.س)</span><input name="auctionFee" type="number" min={0} defaultValue={auction.fee} className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">أقصى مدة للمزاد (أيام)</span><input name="auctionMaxDays" type="number" min={1} max={30} defaultValue={auction.maxDays} className={num} /></label>
        </div>
      </div>

      {/* النمو والمكافآت: رصيد ترحيبي + دعوة صديق + نظام النقاط */}
      <div className="rounded-xl border border-lime-400 bg-lime-50/60 p-3">
        <div className="mb-1 text-xs font-bold text-lime-800">🌱 النمو والمكافآت (اكتب 0 للتعطيل)</div>
        <p className="mb-2 text-[11px] text-muted-foreground">رصيد ترحيبي يُضاف تلقائياً لكل عضو جديد فور تسجيله. دعوة صديق: يشارك العضو رابطه، وعند أول إعلان أو توثيق للمدعو يحصل الطرفان على المكافأة. النقاط تُمنح على الزيارة اليومية وأول إعلان والتوثيق، ويحوّلها العضو لرصيد بالمعدّل المحدد.</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1"><span className="text-xs font-bold">الرصيد الترحيبي عند التسجيل (ر.س)</span><input name="welcomeCredit" type="number" min={0} defaultValue={welcome} className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">مكافأة دعوة صديق (ر.س — لكل طرف)</span><input name="referralReward" type="number" min={0} defaultValue={refReward} className={num} /></label>
        </div>
        <label className="mt-2 flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" name="referralOn" defaultChecked={refOn} className="h-4 w-4 accent-[hsl(var(--primary))]" />
          تفعيل دعوة صديق (رابط الإحالة في لوحة العضو)
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" name="pointsOn" defaultChecked={ptsOn} className="h-4 w-4 accent-[hsl(var(--primary))]" />
          تفعيل نظام النقاط (زيارة يومية + أول إعلان + توثيق ← تُحوَّل لرصيد)
        </label>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <label className="space-y-1"><span className="text-xs font-bold">نقاط الزيارة اليومية</span><input name="ptsDaily" type="number" min={0} defaultValue={ptsCfg.daily} className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">نقاط أول إعلان</span><input name="ptsFirstAd" type="number" min={0} defaultValue={ptsCfg.firstAd} className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">نقاط التوثيق</span><input name="ptsVerify" type="number" min={0} defaultValue={ptsCfg.verify} className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">كم نقطة = 1 ر.س</span><input name="ptsRate" type="number" min={1} defaultValue={ptsCfg.rate} className={num} /></label>
          <label className="space-y-1"><span className="text-xs font-bold">أدنى نقاط للتحويل</span><input name="ptsMinConvert" type="number" min={1} defaultValue={ptsCfg.minConvert} className={num} /></label>
        </div>
      </div>

      <div id="services-matrix" className="flex scroll-mt-20 items-center gap-2 border-t border-primary/15 pt-3 font-bold text-primary"><Megaphone className="h-5 w-5" /> تسعيرات الخدمات (السعر لكل مدّة)</div>
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

    {canPromos && <PromoPackagesSection />}
    </>
  );
}

/* ===== باقات عدد الإعلانات (تُدار سابقاً في /admin/packages المستقلة) ===== */
const pkgInputCls = 'h-9 w-full rounded-lg border border-primary/30 bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-primary/40';
const pkgLabelCls = 'text-[11px] font-medium text-muted-foreground';

function PkgField({ label, name, defaultValue, type = 'number', min = 0, placeholder }: { label: string; name: string; defaultValue?: string | number; type?: string; min?: number; placeholder?: string }) {
  return (
    <label className="block space-y-0.5">
      <span className={pkgLabelCls}>{label}</span>
      <input name={name} type={type} min={type === 'number' ? min : undefined} step={name === 'price' ? '0.01' : undefined} defaultValue={defaultValue} placeholder={placeholder} className={pkgInputCls} />
    </label>
  );
}

function PkgTierSelect({ value }: { value?: string }) {
  return (
    <label className="block space-y-0.5">
      <span className={pkgLabelCls}>باقة تميز</span>
      <select name="tier" defaultValue={value ?? ''} className={pkgInputCls}>
        <option value="">لا</option>
        <option value="gold">ذهبي</option>
        <option value="silver">فضي</option>
      </select>
    </label>
  );
}

function PackageFields({ p }: { p?: Package }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <PkgField label="اسم الباقة" name="name" type="text" defaultValue={p?.name} placeholder="مثال: الذهبية" />
        <PkgField label="السعر (0 = مجانية)" name="price" defaultValue={p?.price} />
        <PkgField label="إعلانات/اليوم (0 = بلا حد)" name="adsPerDay" defaultValue={p?.adsPerDay} />
        <PkgField label="فارق بالساعات (0 = بلا)" name="gapHours" defaultValue={p?.gapHours} />
        <PkgField label="عدد إعلانات التميز بالأعلى" name="featuredSlots" defaultValue={p?.featuredSlots} />
        <PkgField label="أيام البقاء بالأعلى" name="featuredDays" defaultValue={p?.featuredDays} />
        <PkgField label="مدة بقاء الإعلان (أيام، 0=دائم)" name="adDays" defaultValue={p?.adDays} />
        <PkgField label="مدة الاشتراك (أيام)" name="durationDays" defaultValue={p?.durationDays ?? 30} min={1} />
        <PkgTierSelect value={p?.tier} />
        <PkgField label="الترتيب" name="sort" defaultValue={p?.sort} />
      </div>
      <div className="flex flex-wrap items-center gap-4 pt-1">
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="isDefault" defaultChecked={p?.isDefault} /> الباقة الافتراضية للأعضاء</label>
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="active" defaultChecked={p ? p.active : true} /> مُفعّلة</label>
      </div>
    </>
  );
}

async function PackagesSection() {
  const packages = await getPackages();
  return (
    <div id="packages" className="card-3d scroll-mt-20 space-y-4 rounded-2xl p-4">
      <div className="flex items-center gap-2 font-bold text-primary"><Crown className="h-5 w-5" /> باقات عدد الإعلانات ({packages.length})</div>
      <p className="text-[11px] text-muted-foreground">لكل باقة: السعر (0 = مجانية)، عدد الإعلانات المسموح بها يومياً، الفارق الزمني بالساعات بين إعلان وآخر، وباقات التميز (كم إعلاناً يُثبّت بالأعلى وكم يوماً يبقى، ذهبي أو فضي).</p>

      <Collapse summary={<span className="text-primary">➕ إضافة باقة جديدة</span>} className="bg-primary/5">
        <form action={createPackageAction} className="space-y-2">
          <PackageFields />
          <button className="btn-3d rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">إضافة الباقة</button>
        </form>
      </Collapse>

      <div className="space-y-2">
        {packages.map((p) => (
          <Collapse
            key={p.id}
            className="bg-white"
            summary={<>
              {p.tier === 'gold' && <Star className="h-4 w-4 fill-amber-400 text-amber-400" />}
              {p.tier === 'silver' && <Star className="h-4 w-4 fill-slate-400 text-slate-400" />}
              <span className="truncate">{p.name}</span>
              <span className="text-xs font-normal text-muted-foreground">{p.price === 0 ? 'مجانية' : `${p.price} ﷼`}</span>
              {!p.active && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">موقوفة</span>}
              {p.isDefault && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">افتراضية</span>}
            </>}
          >
            <form action={updatePackageAction} className="space-y-2">
              <input type="hidden" name="id" value={p.id} />
              <PackageFields p={p} />
              <div className="flex items-center gap-2">
                <button className="btn-3d rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-white">حفظ</button>
                <button formAction={deletePackageAction} className="flex items-center gap-1 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-3.5 w-3.5" /> حذف
                </button>
              </div>
            </form>
          </Collapse>
        ))}
        {packages.length === 0 && <p className="py-6 text-center text-muted-foreground">لا توجد باقات بعد — أضِف أول باقة بالأعلى.</p>}
      </div>
    </div>
  );
}

/* ===== باقات الإعلانات الترويجية: المدد والأسعار (تُدار سابقاً في /admin/promos/packages المستقلة) ===== */
function PromoFields({ p }: { p?: PromoPackage }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <label className="space-y-0.5"><span className="text-[11px] text-muted-foreground">الاسم</span><input name="name" defaultValue={p?.name} placeholder="مثال: أسبوعان" className={pkgInputCls} /></label>
      <label className="space-y-0.5"><span className="text-[11px] text-muted-foreground">المدة (أيام)</span><input name="days" type="number" min={1} defaultValue={p?.days ?? 30} className={pkgInputCls} /></label>
      <label className="space-y-0.5"><span className="text-[11px] text-muted-foreground">السعر</span><input name="price" type="number" min={0} step="0.01" defaultValue={p?.price ?? 0} className={pkgInputCls} /></label>
      <label className="space-y-0.5"><span className="text-[11px] text-muted-foreground">الترتيب</span><input name="sort" type="number" defaultValue={p?.sort ?? 0} className={pkgInputCls} /></label>
    </div>
  );
}

async function PromoPackagesSection() {
  const packages = await getPromoPackages();
  return (
    <div id="promo-packages" className="card-3d scroll-mt-20 space-y-4 rounded-2xl p-4">
      <div className="flex items-center gap-2 font-bold text-primary"><Settings2 className="h-5 w-5" /> باقات الإعلانات الترويجية — المدد والأسعار ({packages.length})</div>
      <p className="text-[11px] text-muted-foreground">حدّد المدد وأسعارها (مثال: أسبوعان = 14 يوم، شهر = 30، ستة أشهر = 180، سنة = 365). تظهر للمعلن عند تصميم إعلانه الترويجي، وتبدأ من تاريخ الموافقة — مراجعة الطلبات نفسها من «الإعلانات الترويجية».</p>

      <Collapse summary={<span className="text-primary">➕ إضافة باقة مدة جديدة</span>} className="bg-primary/5">
        <form action={createPromoPackageAction} className="space-y-2">
          <PromoFields />
          <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="active" defaultChecked /> مُفعّلة</label>
          <button className="btn-3d rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">إضافة</button>
        </form>
      </Collapse>

      <div className="space-y-2">
        {packages.map((p) => (
          <Collapse
            key={p.id}
            className="bg-white"
            summary={<>
              <span className="truncate">{p.name} — {p.days} يوم — {p.price === 0 ? 'مجاني' : `${p.price} ﷼`}</span>
              {!p.active && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">موقوفة</span>}
            </>}
          >
            <form action={updatePromoPackageAction} className="space-y-2">
              <input type="hidden" name="id" value={p.id} />
              <PromoFields p={p} />
              <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="active" defaultChecked={p.active} /> مُفعّلة</label>
              <div className="flex gap-2">
                <button className="btn-3d rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-white">حفظ</button>
                <button formAction={deletePromoPackageAction} className="flex items-center gap-1 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /> حذف</button>
              </div>
            </form>
          </Collapse>
        ))}
        {packages.length === 0 && <p className="py-6 text-center text-muted-foreground">لا توجد باقات — أضِف أول باقة بالأعلى.</p>}
      </div>
    </div>
  );
}
