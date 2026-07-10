import Link from 'next/link';
import { Wallet, ArrowDownCircle, ArrowUpCircle, Info, Copy, HandCoins, Receipt, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getBalance, listTxns, countTxns, getDupCredit, listMyTopups } from '@/lib/wallet';
import { AdminPager } from '@/components/admin-pager';
import {
  getServicePricing, serviceHasPrice, DURATIONS, getSetting,
  SETTING_TOPUP_INFO, DEFAULT_TOPUP_INFO,
  SETTING_TOPUP_NAME_NOTE, DEFAULT_TOPUP_NAME_NOTE,
  getTopupAccounts, getTopupPromo,
} from '@/lib/settings';
import { CopyChip } from '@/components/copy-chip';
import { Countdown } from '@/components/countdown';
import { pointsEnabled, getPoints, getPointsConfig } from '@/lib/points';
import { mediaUrl } from '@/lib/media';
import { buyDupPackAction, requestTopupAction, convertPointsAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'محفظتي' };

function fmt(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

const TOPUP_STATUS = {
  0: { label: 'بانتظار تأكيد الإدارة', cls: 'bg-amber-100 text-amber-800', icon: Clock },
  1: { label: 'تم التأكيد وأُضيف للرصيد', cls: 'bg-emerald-100 text-emerald-800', icon: CheckCircle2 },
  2: { label: 'مرفوض', cls: 'bg-red-100 text-red-700', icon: XCircle },
} as const;

const TXN_PAGE = 25;

export default async function WalletPage({ searchParams }: { searchParams: Promise<{ dup?: string; topup?: string; error?: string; price?: string; bal?: string; page?: string; pts?: string }> }) {
  const session = await requireUser();
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page || '1') || 1);
  const [balance, txns, pricing, dupCredit, topups, topupInfo, topupAccounts, topupNameNote, promo, txnTotal, ptsOn] = await Promise.all([
    getBalance(session.uid), listTxns(session.uid, TXN_PAGE, (page - 1) * TXN_PAGE), getServicePricing(), getDupCredit(session.uid),
    listMyTopups(session.uid), getSetting(SETTING_TOPUP_INFO, DEFAULT_TOPUP_INFO),
    getTopupAccounts(),
    getSetting(SETTING_TOPUP_NAME_NOTE, DEFAULT_TOPUP_NAME_NOTE),
    getTopupPromo(),
    countTxns(session.uid),
    pointsEnabled(),
  ]);
  const { getTopupTiers: _gtt, getTopupCampaignUntil: _gcu } = await import('@/lib/settings');
  const campaignUntil = await _gcu().catch(() => null);
  const campaignLive = !campaignUntil || campaignUntil.getTime() > Date.now();
  const topupTiers = campaignLive ? await _gtt().catch(() => []) : [];
  const txnPages = Math.max(1, Math.ceil(txnTotal / TXN_PAGE));
  const [pts, ptsCfg] = ptsOn ? await Promise.all([getPoints(session.uid), getPointsConfig()]) : [0, null];
  const hadTopup = topups.some((t) => t.status === 1);
  const range = (p: Record<'w2' | 'm1' | 'y1', number>) => DURATIONS.filter((d) => p[d.key] > 0).map((d) => p[d.key]);
  const priceRange = (p: Record<'w2' | 'm1' | 'y1', number>) => { const r = range(p); return r.length ? `${Math.min(...r)}–${Math.max(...r)} ر.س` : ''; };
  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-xl font-bold text-primary"><Wallet className="h-6 w-6" /> محفظتي</h1>

      <div className="card-3d rounded-2xl border-2 border-primary/30 bg-card p-5">
        <div className="text-sm font-bold text-muted-foreground">الرصيد المتاح</div>
        <div className="mt-1 text-4xl font-extrabold text-primary">{balance} <span className="text-lg">ر.س</span></div>
        <p className="mt-2 text-xs font-medium text-muted-foreground">اشحن رصيدك من نموذج «شحن رصيدك» بالأسفل. يُخصم الرصيد تلقائياً عند الإعلانات المميّزة والمبوّبة وباقات التكرار.</p>
      </div>

      {sp.dup === '1' && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">✓ تمت إضافة باقة التكرار وخُصمت الرسوم من رصيدك.</div>}
      {sp.pts && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">🎯 حُوّلت نقاطك — أُضيف {sp.pts} ر.س لرصيدك.</div>}
      {sp.topup === '1' && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">✓ أُرسل طلب الشحن للإدارة — بعد تأكيد وصول المبلغ يُضاف لرصيدك وستصلك رسالة.</div>}
      {sp.error === 'topupamount' && <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">أدخل مبلغاً صحيحاً لطلب الشحن.</div>}
      {sp.error === 'topupreceipt' && <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">أرفق صورة إيصال التحويل (حتى 8MB).</div>}
      {sp.error === 'topup' && <div className="rounded-lg border-2 border-red-400 bg-red-50 p-3 text-sm font-bold text-red-900">تعذّر إرسال طلب الشحن — حاول مجدداً.</div>}
      {sp.error === 'needcredit' && <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">💳 رصيدك لا يكفي{sp.price ? ` (المطلوب ${sp.price} ر.س)` : ''}. اشحن رصيدك من النموذج بالأسفل.</div>}

      {sp.error === 'pts' && <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">نقاطك لا تكفي للتحويل بعد — واصل جمعها.</div>}

      {/* نقاطك — تُجمع من نشاطك وتتحول رصيداً */}
      {ptsOn && ptsCfg && (
        <div className="card-3d flex flex-wrap items-center gap-3 rounded-2xl border-2 border-violet-300 bg-violet-50/50 p-4">
          <span className="grid h-11 w-11 place-items-center rounded-lg bg-violet-100 text-2xl">🎯</span>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-violet-800">نقاطك: {pts}</div>
            <div className="text-xs text-muted-foreground">اجمع النقاط من زيارتك اليومية وأول إعلان والتوثيق — كل {ptsCfg.rate} نقطة = ١ ر.س (الحد الأدنى للتحويل {ptsCfg.minConvert}).</div>
          </div>
          {pts >= ptsCfg.minConvert && (
            <form action={convertPointsAction}>
              <button className="btn-3d rounded-full bg-violet-600 px-4 py-2 text-sm font-bold text-white">حوّل نقاطك لرصيد</button>
            </form>
          )}
        </div>
      )}

      {/* شحن الرصيد: المبلغ + إيصال التحويل — يُضاف بعد تأكيد الإدارة */}
      <div id="topup" className="card-3d space-y-3 rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-2 font-bold text-primary">
          <HandCoins className="h-5 w-5" /> شحن رصيدك
          <Link href="/guide/how/topup" className="btn-3d mr-auto inline-flex items-center gap-1 rounded-full bg-red-600 px-3.5 py-1.5 text-xs font-extrabold text-white shadow-md hover:bg-red-700">🎬 شاهد طريقة الشحن</Link>
        </div>
        {/* حملة زيادة الشحن الحالية — تظهر فقط عند تفعيلها من الإدارة */}
        {(topupTiers.length > 0 || (promo.first > 0 && !hadTopup)) && (
          <div className="rounded-xl border-2 border-emerald-400 bg-emerald-50 p-2.5 text-sm font-extrabold text-emerald-800">
            {topupTiers.length > 0 && (
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">🎁 عرض حملة زيادة الشحن — كلما زاد شحنك زادت مكافأتك:{campaignUntil && <span className="flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-black text-white">⏳ عرض — باقي <Countdown until={campaignUntil.toISOString()} /></span>}</div>
                <div className="flex flex-wrap gap-1.5">
                  {topupTiers.map((t, i) => <span key={`${t.amount}-${i}`} className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-extrabold text-white">اشحن {t.amount} تحصل على {t.bonus} ريال ⭐</span>)}
                </div>
              </div>
            )}
            {promo.first > 0 && !hadTopup && <div>⭐ مكافأة أول شحن: +{promo.first} ر.س تُضاف لرصيدك مع أول شحن مؤكَّد.</div>}
          </div>
        )}
        {topupAccounts.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-bold text-foreground">حسابات التحويل:</div>
            {topupAccounts.map((a, i) => (
              <div key={i} className="space-y-2 rounded-xl border-2 border-primary/25 bg-primary/5 p-3">
                {a.bank && (
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 text-sm"><span className="font-bold text-muted-foreground">البنك: </span><b className="text-base text-foreground">{a.bank}</b></div>
                    <CopyChip text={a.bank} />
                  </div>
                )}
                {a.number && (
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 text-sm">
                      <span className="font-bold text-muted-foreground">رقم الحساب: </span>
                      <b dir="ltr" className="select-all break-all text-base font-extrabold text-primary">{a.number}</b>
                    </div>
                    <CopyChip text={a.number} />
                  </div>
                )}
                {a.iban && (
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 text-sm">
                      <span className="font-bold text-muted-foreground">الآيبان: </span>
                      <b dir="ltr" className="select-all break-all text-base font-extrabold text-primary">{a.iban}</b>
                    </div>
                    <CopyChip text={a.iban} />
                  </div>
                )}
                {a.name && (
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 text-sm">
                      <span className="font-bold text-muted-foreground">اسم صاحب الحساب: </span><b className="text-base text-foreground">{a.name}</b>
                      {topupNameNote && <div className="mt-0.5 text-xs font-bold text-amber-700">⚠ {topupNameNote}</div>}
                    </div>
                    <CopyChip text={a.name} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {topupInfo && <p className="rounded-lg bg-primary/5 p-2.5 text-xs font-medium text-foreground/80">{topupInfo}</p>}
        <form action={requestTopupAction} className="space-y-2">
          <label className="block space-y-1">
            <span className="text-sm font-medium">المبلغ (ر.س)</span>
            <input type="number" name="amount" min={1} step={1} required inputMode="numeric" placeholder="مثال: 100" className="h-11 w-full rounded-lg border border-primary/30 bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">إيصال التحويل (صورة)</span>
            <input type="file" name="receipt" accept="image/*,.pdf" required className="w-full rounded-lg border border-primary/30 bg-background p-2 text-sm file:ml-2 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white" />
          </label>
          <button className="btn-3d w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-white">إرسال طلب الشحن</button>
        </form>
        {topups.length > 0 && (
          <div className="space-y-2 border-t border-primary/10 pt-3">
            <div className="text-xs font-bold text-muted-foreground">طلباتي السابقة</div>
            {topups.map((t) => {
              const st = TOPUP_STATUS[t.status];
              return (
                <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/15 p-2.5 text-sm">
                  <st.icon className={`h-5 w-5 shrink-0 ${t.status === 1 ? 'text-emerald-600' : t.status === 2 ? 'text-red-500' : 'text-amber-500'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold">{t.amount} ر.س</div>
                    <div className="text-[11px] text-muted-foreground">{fmt(t.at)}</div>
                    {t.status === 2 && t.note && <div className="mt-0.5 text-xs font-bold text-red-600">السبب: {t.note}</div>}
                  </div>
                  {t.receipt && <a href={mediaUrl(t.receipt)} target="_blank" className="flex items-center gap-1 rounded-full border border-primary/25 px-2.5 py-1 text-[11px] font-bold text-primary"><Receipt className="h-3.5 w-3.5" /> الإيصال</a>}
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* باقات التكرار — نشر الإعلان المكرّر عدداً من المرّات (السعر حسب المدّة) */}
      {(serviceHasPrice(pricing.dup3) || serviceHasPrice(pricing.dup5)) && (
        <div className="card-3d space-y-2 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-primary"><Copy className="h-5 w-5" /> باقات التكرار</div>
            <div className="text-sm font-bold">المتبقّي: <b className="text-primary">{dupCredit}</b> نشرة</div>
          </div>
          <p className="text-xs text-muted-foreground">تتيح نشر إعلان مكرّر عدداً من المرّات (تُخصم نشرة عند كل نشر مكرّر). اختر المدّة ثم اشترِ.</p>
          <div className="grid grid-cols-2 gap-2">
            {([['3', pricing.dup3], ['5', pricing.dup5]] as const).filter(([, p]) => serviceHasPrice(p)).map(([tier, p]) => (
              <form key={tier} action={buyDupPackAction} className="flex flex-col items-center gap-1 rounded-xl border p-3 text-center">
                <input type="hidden" name="tier" value={tier} />
                <div className="text-sm font-bold">مكرّر {tier} <span className="text-[11px] text-muted-foreground">({tier} نشرات)</span></div>
                <select name="duration" className="h-9 w-full rounded-lg border bg-background px-2 text-xs">
                  {DURATIONS.filter((d) => p[d.key] > 0).map((d) => <option key={d.key} value={d.key}>{d.label} — {p[d.key]} ر.س</option>)}
                </select>
                <button className="w-full rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-white">شراء</button>
              </form>
            ))}
          </div>
        </div>
      )}

      {(serviceHasPrice(pricing.featured) || serviceHasPrice(pricing.classified) || serviceHasPrice(pricing.dup3) || serviceHasPrice(pricing.dup5)) && (
        <div className="card-3d rounded-xl p-3 text-sm">
          <div className="mb-1 flex items-center gap-1 font-bold text-primary"><Info className="h-4 w-4" /> التسعير الحالي (حسب المدّة)</div>
          <ul className="space-y-0.5 text-muted-foreground">
            {serviceHasPrice(pricing.featured) && <li>• تمييز الإعلان: <b className="text-foreground">{priceRange(pricing.featured)}</b></li>}
            {serviceHasPrice(pricing.classified) && <li>• نشر إعلان مبوّب: <b className="text-foreground">{priceRange(pricing.classified)}</b></li>}
            {serviceHasPrice(pricing.dup3) && <li>• باقة «مكرّر 3»: <b className="text-foreground">{priceRange(pricing.dup3)}</b></li>}
            {serviceHasPrice(pricing.dup5) && <li>• باقة «مكرّر 5»: <b className="text-foreground">{priceRange(pricing.dup5)}</b></li>}
          </ul>
        </div>
      )}

      <div>
        <div className="mb-2 text-sm font-bold text-muted-foreground">سجلّ العمليات ({txnTotal})</div>
        {txns.length === 0 && <p className="py-8 text-center text-muted-foreground">لا توجد عمليات بعد.</p>}
        <div className="space-y-2">
          {txns.map((t) => {
            const credit = t.amount > 0;
            return (
              <div key={t.id} className="flex items-center gap-3 card-3d rounded-xl p-3">
                {credit ? <ArrowUpCircle className="h-6 w-6 shrink-0 text-emerald-600" /> : <ArrowDownCircle className="h-6 w-6 shrink-0 text-red-500" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{t.label}</div>
                  {t.note && <div className="truncate text-xs text-muted-foreground">{t.note}</div>}
                  <div className="text-[11px] text-muted-foreground">{fmt(t.at)}{t.byAdmin ? ' • بواسطة الإدارة' : ''}</div>
                </div>
                <div className="shrink-0 text-left">
                  <div className={`text-sm font-extrabold ${credit ? 'text-emerald-600' : 'text-red-500'}`}>{credit ? '+' : ''}{t.amount} ر.س</div>
                  <div className="text-[11px] text-muted-foreground">الرصيد: {t.balanceAfter}</div>
                </div>
              </div>
            );
          })}
        </div>
        <AdminPager basePath="/account/wallet" page={page} pages={txnPages} total={txnTotal} params={{}} />
      </div>

      <Link href="/account" className="block text-center text-sm text-muted-foreground hover:text-primary">← لوحة التحكم</Link>
    </div>
  );
}
