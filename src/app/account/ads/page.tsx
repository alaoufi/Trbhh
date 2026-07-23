import Link from 'next/link';
import Image from 'next/image';
import { Pencil, Trash2, Eye, EyeOff, Wallet, Archive } from 'lucide-react';
import { AdStatsCard } from '@/components/ad-stats-card';
import { requireUser } from '@/lib/auth';
import { getMyAds, adContactCounts } from '@/lib/account';
import { adViewCounts } from '@/lib/merchant';
import { getServicePricing, serviceHasPrice, DURATIONS, DUR_DAYS, getAdExtras, getSettingBool, getAdRestoreFee, getMemberWindows, adWindowState } from '@/lib/settings';
import { getBalance } from '@/lib/wallet';
import { formatPrice, timeAgo } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { deleteAdAction, toggleAdStatusAction, featureAdAction, buyUrgentAction, bumpAdAction, restoreArchivedAdAction, archiveAdAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'إعلاناتي' };

export default async function MyAdsPage({ searchParams }: { searchParams: Promise<{ pending?: string; error?: string; hours?: string; featured?: string; price?: string; bal?: string; urgent?: string; urgentneed?: string; featuredneed?: string; bumped?: string; bumpwait?: string; scheduled?: string; restored?: string }> }) {
  const session = await requireUser();
  const sp = await searchParams;
  const [ads, servicePricing, balance, extras, bumpOn, contactStatsOn, auctionOn, restoreFee, memberWindows] = await Promise.all([
    getMyAds(session.uid), getServicePricing(), getBalance(session.uid), getAdExtras(),
    getSettingBool('bump_on', false), getSettingBool('ad_contact_stats_on', true), getSettingBool('auction_on', false),
    getAdRestoreFee(), getMemberWindows(),
  ]);
  const contacts = contactStatsOn ? await adContactCounts(ads.map((a) => a.id)) : new Map<number, { whatsapp: number; call: number }>();
  const viewCounts = contactStatsOn ? await adViewCounts(ads.map((a) => a.id)) : new Map<number, number>();
  const now = Date.now();
  const featuredSold = serviceHasPrice(servicePricing.featured);
  const en = (n: number) => new Intl.NumberFormat('en-US').format(n);
  const fmtDay = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('ar', { dateStyle: 'medium' }).format(d); };
  // متبقي مهلة التعديل/الحذف على كل زر — 0 = بلا حد فلا نعرض شيئاً
  const windowState = adWindowState;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">إعلاناتي ({ads.length})</h1>
        <div className="flex items-center gap-2">
          <Link href="/account/wallet" className="flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-2 text-xs font-bold text-primary"><Wallet className="h-4 w-4" /> رصيدي: {balance} ر.س</Link>
          <Link href="/ads/new" className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">أضف إعلان</Link>
        </div>
      </div>
      {sp.featured === '1' && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">⭐ تم تمييز الإعلان وخُصمت الرسوم من رصيدك.</div>}
      {sp.urgent === '1' && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">🔥 فُعّلت شارة «عاجل» وخُصمت الرسوم من رصيدك.</div>}
      {sp.bumped === '1' && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">⬆ تم تحديث إعلانك — أصبح في مقدمة القوائم.</div>}
      {sp.bumpwait && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900">⬆ التحديث المجاني متاح بعد {sp.bumpwait} يوم — أو فعّل التحديث المدفوع إن وُفّر.</div>}
      {sp.scheduled === '1' && <div className="rounded-lg border border-sky-300 bg-sky-50 p-3 text-sm font-bold text-sky-800">🕒 حُفظ إعلانك وسيُنشر تلقائياً في الموعد الذي حددته.</div>}
      {sp.restored === '1' && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">📤 أُعيد إعلانك للظهور من الأرشيف وعاد لمقدمة القوائم.</div>}
      {sp.error === 'adminhidden' && <div className="rounded-lg border-2 border-red-400 bg-red-50 p-3 text-sm font-bold text-red-800">🚫 هذا الإعلان أخفته الإدارة عن النشر لمخالفة — لا يمكنك إعادة نشره بنفسك. عالِج سبب المخالفة (المذكور تحت الإعلان) وراسل الإدارة لإعادة نشره.</div>}
      {sp.error === 'needcredit' && <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">💳 رصيدك لا يكفي{sp.price ? <> (المطلوب {sp.price} ر.س</> : ''}{sp.bal !== undefined ? <>، ورصيدك {sp.bal} ر.س)</> : ')'}. <Link href="/account/wallet#topup" className="text-primary underline">اشحن رصيدك من هنا</Link> ثم أعد المحاولة.</div>}
      {sp.urgentneed === '1' && <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">💳 حُفظ إعلانك، لكن رصيدك لا يغطي شارة «عاجل» — <Link href="/account/wallet#topup" className="text-primary underline">اشحن رصيدك من هنا</Link> ثم فعّلها بزر «🔥 عاجل» أسفل الإعلان.</div>}
      {sp.featuredneed === '1' && <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">💳 حُفظ إعلانك، لكن رصيدك لا يغطي رسوم التمييز ⭐ — <Link href="/account/wallet#topup" className="text-primary underline">اشحن رصيدك من هنا</Link> ثم ميّزه من «تمييز الإعلان (مدفوع)» أسفل الإعلان.</div>}
      {sp.pending === '1' && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          إعلانك مشابه لإعلان قائم (تطابق ٩٠٪ في العنوان/التفاصيل أو الصور)، فتم حفظه <b>بانتظار موافقة الإدارة</b> قبل نشره.
        </div>
      )}
      {sp.error === 'deleteWindow' && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          انتهت المدة المسموح بها لحذف الإعلان{sp.hours ? ` (${sp.hours} ساعة من النشر)` : ''} حسب إعدادات الموقع. للحذف بعد هذه المدة تواصل مع الإدارة.
        </div>
      )}
      {ads.length === 0 && <p className="py-8 text-center text-muted-foreground">لا توجد إعلانات بعد.</p>}
      <div className="space-y-3">
        {ads.map((ad) => {
          const editState = windowState(ad.createdAt, memberWindows.editHours);
          const deleteState = windowState(ad.createdAt, memberWindows.deleteHours);
          return (
          <div key={ad.id} className="flex gap-3 card-3d rounded-xl p-3">
            <Link href={`/ads/${ad.id}`} className="relative block h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
              <Image src={ad.image} alt={ad.title} fill sizes="80px" className="object-cover" />
            </Link>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/ads/${ad.id}`} className="line-clamp-1 font-semibold hover:text-primary">{ad.title}</Link>
                <div className="flex shrink-0 gap-1">
                  {ad.special && <Badge variant="special">مميّز</Badge>}
                  {ad.urgentUntil && new Date(ad.urgentUntil).getTime() > now && <span className="animate-pulse rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-extrabold text-white">🔥 عاجل</span>}
                  <Badge variant={ad.status === 1 ? 'trusted' : 'special'}>{ad.status === 1 ? 'نشط' : ad.hiddenReason ? 'مخفيّ من الإدارة' : ad.archived ? 'مؤرشف' : ad.pausedByOwner ? 'موقوف (أوقفته أنت)' : ad.publishAt ? `مجدول: ${fmtDay(ad.publishAt)}` : 'بانتظار الموافقة'}</Badge>
                </div>
              </div>
              <span className="text-sm font-bold text-primary">{formatPrice(ad.price, 'ر.س', ad.adsType)}</span>
              <span className="text-xs text-muted-foreground">
                {timeAgo(ad.createdAt)}
                {contactStatsOn && (() => { const c = contacts.get(ad.id); return c && (c.whatsapp + c.call) > 0 ? <> • 💬 {c.whatsapp} واتساب • 📞 {c.call} اتصال</> : null; })()}
              </span>
              {ad.status !== 1 && (
                <span className={`mt-1 rounded-md px-2 py-1 text-[11px] font-bold leading-4 ${ad.hiddenReason ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                  {ad.hiddenReason
                    ? <>🚫 <b>أخفت الإدارة هذا الإعلان عن النشر</b> لمخالفة: «{ad.hiddenReason}» — عالِج السبب، وقد سُجّل إنذار على متجرك (راجع لوحة متجرك). للاعتراض راسل الإدارة.</>
                    : ad.archived
                    ? <>📦 <b>مؤرشف</b> — لم يعد ظاهراً للعامة (مضت مدة عرضه أو أرشفته الإدارة). يظهر لك وحدك، واضغط <b>«أعِد للظهور»</b>{restoreFee > 0 ? <> ليعود بخصم <b>{restoreFee} ر.س</b> من رصيدك</> : ' ليعود مجاناً'}.</>
                    : ad.pausedByOwner
                    ? <>سبب عدم الظهور: <b>أوقفته أنت</b> — اضغط <b>«تفعيل»</b> ليعود للعرض فوراً.</>
                    : <>سبب عدم الظهور: الإعلان <b>بانتظار الموافقة</b> — غالباً لتشابهه مع إعلان قائم (٩٠٪+) أو تفعيل مراجعة الإعلانات. اضغط <b>«تفعيل»</b> لعرضه فوراً، أو احذف النسخة المكرّرة.</>}
                </span>
              )}

              {/* إحصائيات الإعلان */}
              {contactStatsOn && (
                <AdStatsCard
                  stats={{
                    views: viewCounts.get(ad.id) || 0,
                    contacts: (contacts.get(ad.id)?.whatsapp || 0) + (contacts.get(ad.id)?.call || 0),
                    messages: 0, // TODO: add messages count
                    favorites: 0, // TODO: add favorites count
                    createdAt: ad.createdAt || '',
                    expiresAt: ad.expiresAt || ad.createdAt || '',
                  }}
                />
              )}

              {ad.special && ad.expiresAt && (
                <span className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-bold leading-4 text-amber-700">⭐ مميّز حتى {fmtDay(ad.expiresAt)}.</span>
              )}
              {featuredSold && (() => {
                const priced = DURATIONS.filter((d) => servicePricing.featured[d.key] > 0);
                const affordable = priced.filter((d) => servicePricing.featured[d.key] <= balance);
                const featuredActive = !!(ad.special && ad.expiresAt && new Date(ad.expiresAt).getTime() > now);
                return (
                  <details className="mt-1">
                    <summary className="cursor-pointer list-none text-[11px] font-bold text-amber-700">{featuredActive ? 'تمديد التمييز…' : 'تمييز الإعلان (مدفوع)…'}</summary>
                    {priced.length > 0 && affordable.length === 0 ? (
                      <div className="mt-1 rounded-md border-2 border-red-400 bg-red-50 px-2 py-1.5 text-[11px] font-bold text-red-700">💳 رصيدك لا يكفي لتمييز الإعلان — <Link href="/account/wallet" className="underline">اشحن رصيدك</Link></div>
                    ) : (
                      <form action={featureAdAction} className="mt-1 flex flex-wrap items-center gap-1">
                        <input type="hidden" name="adId" value={ad.id} />
                        <select name="duration" defaultValue={affordable[0]?.key} className="h-8 rounded-md border bg-background px-2 text-xs">
                          {priced.map((d) => (
                            <option key={d.key} value={d.key} disabled={servicePricing.featured[d.key] > balance}>{d.label} — {en(servicePricing.featured[d.key])} ر.س{servicePricing.featured[d.key] > balance ? ' (غير متاح)' : ''}</option>
                          ))}
                        </select>
                        <ConfirmSubmit
                          msg="تأكيد تمييز الإعلان للمدة المختارة؟ سيُخصم السعر من رصيدك فوراً."
                          extendUntil={featuredActive ? ad.expiresAt! : undefined}
                          extendField="duration"
                          extendUnit="days"
                          extendMap={DUR_DAYS}
                          extendTemplate={`إعلانك مميّز حالياً حتى ${fmtDay(ad.expiresAt)} — عند التأكيد سيُمدَّد إلى {date}. سيُخصم السعر من رصيدك.`}
                          className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-bold text-white"
                        >
                          {featuredActive ? 'تمديد' : 'تمييز'}
                        </ConfirmSubmit>
                      </form>
                    )}
                  </details>
                );
              })()}
              <div className="mt-auto flex flex-wrap gap-2 pt-2">
                {editState.expired ? (
                  <span className="flex items-center gap-1 rounded-md border border-border/50 bg-secondary/30 px-2 py-1 text-xs text-muted-foreground" title="تجاوز الإعلان مدة السماح بالتعديل">
                    <Pencil className="h-3 w-3" /> انتهت مهلة السماح
                  </span>
                ) : (
                  <Link href={`/ads/${ad.id}/edit`} className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-secondary">
                    <Pencil className="h-3 w-3" /> تعديل{editState.label ? ` (${editState.label})` : ''}
                  </Link>
                )}
                {bumpOn && ad.status === 1 && !ad.storeOnly && (() => {
                  const last = new Date(ad.bumpedAt || ad.createdAt || 0);
                  const daysSince = (now - last.getTime()) / 86400_000;
                  const bumpFree = extras.bumpFreeDays > 0 && daysSince >= extras.bumpFreeDays;
                  const bumpCost = bumpFree ? 0 : extras.bumpPrice;
                  const canBump = bumpCost <= 0 || balance >= bumpCost;
                  return (
                    <form action={bumpAdAction}>
                      <input type="hidden" name="adId" value={ad.id} />
                      <ConfirmSubmit
                        disabled={!canBump}
                        msg="تأكيد تحديث الإعلان (رفعه لأعلى القوائم)؟ إن لم يكن التحديث المجاني متاحاً يُخصم السعر من رصيدك."
                        title={canBump ? 'رفع الإعلان لأعلى القوائم' : `رصيدك لا يكفي (${bumpCost} ر.س)`}
                        className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-bold ${canBump ? 'border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100' : 'cursor-not-allowed border-red-300 bg-red-50 text-red-400 opacity-60'}`}
                      >⬆ تحديث{!canBump ? ` (${bumpCost} ر.س)` : ''}</ConfirmSubmit>
                    </form>
                  );
                })()}
                {auctionOn && ad.status === 1 && !ad.storeOnly && (
                  <Link href={`/auctions/new?ad=${ad.id}`} className="flex items-center gap-1 rounded-md border border-violet-300 bg-violet-50 px-2 py-1 text-xs font-bold text-violet-700 hover:bg-violet-100" title="افتح مزاداً على هذا الإعلان">🔨 مزاد</Link>
                )}
                {extras.urgentPacks.length > 0 && ad.status === 1 && !ad.storeOnly && (() => {
                  const urgentActive = !!(ad.urgentUntil && new Date(ad.urgentUntil).getTime() > now);
                  const affordablePacks = extras.urgentPacks.filter((p0) => p0.price <= balance);
                  if (affordablePacks.length === 0) {
                    return <span className="flex items-center gap-1 rounded-md border-2 border-red-300 bg-red-50 px-2 py-1 text-[11px] font-bold text-red-600">💳 لا يكفي لباقة عاجل — <Link href="/account/wallet" className="underline">اشحن رصيدك</Link></span>;
                  }
                  const hoursMap = Object.fromEntries(extras.urgentPacks.map((p) => [String(p.hours), p.hours]));
                  const untilLabel = urgentActive ? new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ad.urgentUntil!)) : '';
                  return (
                    <form action={buyUrgentAction} className="flex items-center gap-1">
                      <input type="hidden" name="adId" value={ad.id} />
                      <select name="hours" defaultValue={affordablePacks[0]?.hours} className="h-7 rounded-md border border-red-300 bg-red-50 px-1 text-[11px] font-bold text-red-600">
                        {extras.urgentPacks.map((p0) => <option key={p0.hours} value={p0.hours} disabled={p0.price > balance}>{p0.hours} ساعة — {p0.price} ر.س{p0.price > balance ? ' (غير متاح)' : ''}</option>)}
                      </select>
                      <ConfirmSubmit
                        msg="تأكيد تفعيل شارة «عاجل» للباقة المختارة؟ سيُخصم السعر من رصيدك فوراً."
                        extendUntil={urgentActive ? ad.urgentUntil! : undefined}
                        extendField="hours"
                        extendUnit="hours"
                        extendMap={hoursMap}
                        extendTemplate={`شارة «عاجل» فعّالة حتى ${untilLabel} — عند التأكيد ستُمدَّد إلى {date}. سيُخصم السعر من رصيدك.`}
                        className="flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-100"
                      >
                        {urgentActive ? 'تمديد عاجل' : '🔥 عاجل'}
                      </ConfirmSubmit>
                    </form>
                  );
                })()}
                {/* مؤرشف → إعادة إظهار برسوم (لا يُعاد مجاناً)؛ مخفيّ من الإدارة → لا زر؛ غير ذلك → إيقاف/تفعيل مجاني */}
                {ad.hiddenReason ? null : ad.archived ? (() => {
                  const canRestore = restoreFee <= 0 || balance >= restoreFee;
                  return (
                    <form action={restoreArchivedAdAction}>
                      <input type="hidden" name="adId" value={ad.id} />
                      <ConfirmSubmit
                        disabled={!canRestore}
                        msg={restoreFee > 0 ? `إعادة إظهار هذا الإعلان المؤرشف؟ سيُخصم ${restoreFee} ر.س من رصيدك فوراً.` : 'إعادة إظهار هذا الإعلان المؤرشف؟'}
                        title={canRestore ? undefined : `رصيدك لا يكفي (${restoreFee} ر.س)`}
                        className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-bold ${canRestore ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'cursor-not-allowed border-red-300 bg-red-50 text-red-400 opacity-60'}`}
                      >
                        <Eye className="h-3 w-3" /> أعِد للظهور{restoreFee > 0 ? ` (${restoreFee} ر.س)` : ''}
                      </ConfirmSubmit>
                    </form>
                  );
                })() : (
                  <>
                    <form action={toggleAdStatusAction}>
                      <input type="hidden" name="adId" value={ad.id} />
                      <ConfirmSubmit msg={ad.status === 1 ? 'إيقاف هذا الإعلان؟ يختفي من الموقع ويعود متى فعّلته.' : 'تفعيل هذا الإعلان؟ يعود للعرض فوراً.'} className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-secondary">
                        {ad.status === 1 ? <><EyeOff className="h-3 w-3" /> إيقاف</> : <><Eye className="h-3 w-3" /> تفعيل</>}
                      </ConfirmSubmit>
                    </form>
                    {ad.status === 1 && (
                      <form action={archiveAdAction}>
                        <input type="hidden" name="adId" value={ad.id} />
                        <ConfirmSubmit msg={`نقل «${ad.title || `#${ad.id}`}» للأرشيف؟ يختفي فوراً عن الموقع ولا يُحذف — إعادته لاحقاً${restoreFee > 0 ? ` تُكلّف ${restoreFee} ر.س` : ' مجانية'}.`} className="flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700 hover:bg-amber-100">
                          <Archive className="h-3 w-3" /> نقل للأرشيف
                        </ConfirmSubmit>
                      </form>
                    )}
                  </>
                )}
                {deleteState.expired ? (
                  <span className="flex items-center gap-1 rounded-md border border-border/50 bg-secondary/30 px-2 py-1 text-xs text-muted-foreground" title="تجاوز الإعلان مدة السماح بالحذف">
                    <Trash2 className="h-3 w-3" /> انتهت مهلة السماح
                  </span>
                ) : (
                  <form action={deleteAdAction}>
                    <input type="hidden" name="adId" value={ad.id} />
                    <ConfirmSubmit msg={`حذف إعلانك «${ad.title || `#${ad.id}`}» نهائياً؟ لا يمكن التراجع.`} className="flex items-center gap-1 rounded-md border border-destructive/30 px-2 py-1 text-xs text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-3 w-3" /> حذف{deleteState.label ? ` (${deleteState.label})` : ''}
                    </ConfirmSubmit>
                  </form>
                )}
              </div>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
