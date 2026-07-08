import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getStoreByUser } from '@/lib/stores';
import { getStoreMeta, followersCount, getStoreRating, incomingOffers, collaboratorStoreIds, storeCard, getStoreWarnings, storeProductAdIds, pendingTransferForOwner, platformRequestState, getStoreLogin, STORE_HIDE_FIELDS, parseHiddenFields } from '@/lib/merchant';
import { getMyAds } from '@/lib/account';
import { getStoreVisitorStats, getStoreViews } from '@/lib/store-analytics';
import { StoreDesigner } from '@/components/store-designer';
import { StoreMiniCard } from '@/components/store-mini-card';
import { CopyLink } from '@/components/copy-link';
import { respondOfferAction, respondTransferAction } from '@/app/companies/actions';
import { setStoreProductsAction, requestPlatformAction, saveCompanyAction, addBranchAction, saveStoreSettingsAction, setStoreCredentialsAction, subscribeStoreAction } from '@/app/account/company/actions';
import { getStoreSub } from '@/lib/subscription';
import { getStoreSubPricing } from '@/lib/settings';
import { Palette, Handshake, Home, PackageOpen, UserCog, Globe, Megaphone, ShieldCheck, PlusCircle, MessageSquare, SlidersHorizontal, KeyRound, BarChart3, Crown } from 'lucide-react';
import { mediaUrl } from '@/lib/media';
import { SITE } from '@/lib/constants';
import { prisma } from '@/lib/prisma';
import { toInt } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'إدارة المتجر' };

export default async function StoreAdminPage({ searchParams }: { searchParams: Promise<{ error?: string; sub?: string; added?: string; settings?: string; cred?: string; crederr?: string }> }) {
  const { error, sub, added, settings, cred, crederr } = await searchParams;
  const session = await requireUser();
  // تذكيرات قرب انتهاء الاشتراك — تشغيل كسول ذاتي الخنق (لا جدولة خلفية)
  import('@/lib/subscription').then((m) => m.sendDueSubReminders()).catch(() => {});
  const store = await getStoreByUser(session.uid);
  const subState = store ? await getStoreSub(store.id) : null;
  const subPricing = await getStoreSubPricing();
  const branches = store ? await prisma.store_branches.findMany({ where: { store_id: store.id } }) : [];
  const logoUrl = store?.logo ? mediaUrl((await prisma.uploads.findUnique({ where: { id: BigInt(store.logo) } }))?.file_name) : null;
  const meta = store ? await getStoreMeta(store.id) : null;
  const visitorStats = store ? await getStoreVisitorStats(store.id) : null;
  const stats = store
    ? { followers: await followersCount(store.id), rating: await getStoreRating(store.id), ads: await prisma.ads.count({ where: { user_id: BigInt(session.uid), status: 1 } }) }
    : null;
  const offers = store ? await incomingOffers(store.id) : [];
  const collabIds = store ? await collaboratorStoreIds(store.id) : [];
  const collabs = store ? (await Promise.all(collabIds.map((id) => storeCard(id)))).filter(Boolean) : [];
  const warnings = store ? await getStoreWarnings(store.id) : [];
  const myActiveAds = store ? (await getMyAds(session.uid)).filter((a) => a.status === 1) : [];
  const inStore = new Set(store ? await storeProductAdIds(store.id) : []);
  // مشاهدات المتجر = عدد مرّات دخول/تحديث صفحة المتجر (مشاهدة واحدة لكل زيارة)
  const totalAdViews = store ? await getStoreViews(store.id) : 0;
  const pendingTransfer = store ? await pendingTransferForOwner(session.uid) : null;
  const platformState = store ? await platformRequestState(store.id) : 'none';
  const storeLoginInfo = store ? await getStoreLogin(session.uid) : { username: null, hasPassword: false };
  const storePwSet = storeLoginInfo.hasPassword;
  const fmtDate = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('ar', { dateStyle: 'medium' }).format(d); };
  const en = (n: number) => new Intl.NumberFormat('en-US').format(n);
  const field = 'h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring';
  return (
    <div className="space-y-4">
      {!store && (
        <div className="card-3d rounded-xl p-4">
          <h1 className="text-lg font-extrabold text-primary">افتح متجرك المستقل</h1>
          <p className="mt-1 text-sm text-muted-foreground">صمّم متجرك، اختر معرّفه (رابطه المستقل)، وابدأ عرض إعلاناتك. يخضع المتجر لموافقة إدارة المتاجر قبل الظهور.</p>
        </div>
      )}

      {error === 'terms' && (
        <div className="card-3d rounded-xl border-2 border-destructive/40 p-3 text-sm font-bold text-destructive">
          يجب الموافقة على شروط المتجر وتحمّل مسؤولية الإعلانات قبل فتح المتجر.
        </div>
      )}

      {store && meta && (
        <div className={`card-3d rounded-xl p-3 text-sm font-bold ${meta.status === 1 ? 'text-emerald-700' : meta.status === 0 ? 'text-amber-700' : 'text-red-700'}`}>
          {meta.status === 1 ? '✓ متجرك مُعتمَد وظاهر للجميع.' : meta.status === 0 ? '⏳ متجرك بانتظار موافقة الإدارة قبل الظهور.' : '⛔ متجرك موقوف. تواصل مع الإدارة.'}
        </div>
      )}

      {/* اشتراك المتجر — حالة + تذكيرات + خطط الدفع (يظهر عند تفعيل الاشتراكات) */}
      {store && subState && subState.enabled && (
        <div className="card-3d space-y-3 rounded-2xl p-4">
          <div className="flex items-center gap-2 font-bold text-primary"><Crown className="h-5 w-5" /> اشتراك المتجر</div>
          {sub === 'ok' && <div className="rounded-lg bg-emerald-50 p-2 text-xs font-bold text-emerald-700">✓ تم تجديد الاشتراك وخُصمت الرسوم من رصيدك.</div>}
          {sub === 'nocredit' && <div className="rounded-lg bg-amber-50 p-2 text-xs font-bold text-amber-700">الرصيد غير كافٍ — اشحن رصيدك من «محفظتي» ثم أعد المحاولة.</div>}
          {subState.state === 'active' && <div className="rounded-lg bg-emerald-50 p-2 text-xs font-bold text-emerald-700">✓ اشتراكك فعّال حتى {fmtDate(subState.until?.toISOString() ?? null)} (متبقٍ {en(Math.max(0, subState.daysLeft))} يوم).{subState.daysLeft <= 7 && ' يُستحسن التجديد قريباً.'}</div>}
          {subState.state === 'grace' && <div className="rounded-lg bg-amber-50 p-2 text-xs font-bold text-amber-800">⚠️ انتهى اشتراكك. متجرك في <b>مهلة {en(subState.graceDays)} أيام</b> ({en(Math.max(0, subState.graceDaysLeft))} يوم متبقٍ) ثم يُخفى من العرض. جدّد الآن لتفادي الإيقاف — لن يُحذف شيء.</div>}
          {subState.state === 'suspended' && <div className="rounded-lg bg-red-50 p-2 text-xs font-bold text-red-700">⛔ اشتراكك منتهٍ ومتجرك <b>مخفيّ من العرض</b> (بياناتك وإعلاناتك محفوظة). جدّد لإعادة الظهور فوراً.</div>}
          {subState.state === 'none' && <div className="rounded-lg bg-sky-50 p-2 text-xs font-bold text-sky-700">لم تشترك بعد. اشترك ليظهر متجرك للعملاء.</div>}
          <div className="grid grid-cols-3 gap-2">
            {([['monthly', subPricing.monthly, 'شهري'], ['sixmo', subPricing.sixmo, '6 أشهر'], ['yearly', subPricing.yearly, 'سنوي']] as const).map(([plan, price, label]) => (
              <form key={plan} action={subscribeStoreAction} className="flex flex-col items-center gap-1 rounded-xl border p-3 text-center">
                <input type="hidden" name="plan" value={plan} />
                <div className="text-xs font-bold text-muted-foreground">{label}</div>
                <div className="text-lg font-extrabold text-primary">{en(price)} <span className="text-[10px]">ر.س</span></div>
                <Button size="sm" className="w-full">{subState.state === 'active' || subState.state === 'grace' ? 'تجديد' : 'اشتراك'}</Button>
              </form>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">تُخصم الرسوم من رصيدك. التجديد المبكر يضيف المدة إلى ما تبقّى. عند انتهاء الاشتراك تُمنح مهلة {en(subState.graceDays)} أيام قبل الإخفاء، ولا يُحذف المتجر أو إعلاناته.</p>
        </div>
      )}

      {store && added === '1' && <div className="card-3d rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">✓ تم نشر الإعلان وإضافته لواجهة متجرك.</div>}
      {store && added === 'pending' && <div className="card-3d rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-800">✓ تم استلام الإعلان، وسيظهر في متجرك بعد موافقة الإدارة.</div>}
      {store && settings === '1' && <div className="card-3d rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">✓ تم حفظ إعدادات المتجر.</div>}

      {/* أضف إعلان — يظهر عند تفعيل «السماح بنشر الإعلانات» في إعدادات المتجر */}
      {store && meta?.allowAds && (
        <Link href="/ads/new?dest=store" className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-extrabold text-white shadow-md transition hover:-translate-y-0.5">
          <PlusCircle className="h-5 w-5" /> أضف إعلان جديد لمتجرك
        </Link>
      )}

      {/* إعدادات المتجر — السماح بنشر الإعلانات + قفل/فتح التعليقات والتقييم */}
      {store && (
        <form action={saveStoreSettingsAction} className="card-3d space-y-3 rounded-2xl p-4">
          <div className="flex items-center gap-2 font-bold text-primary"><SlidersHorizontal className="h-5 w-5" /> إعدادات المتجر</div>
          <label className="flex items-start gap-2 rounded-xl border p-3 text-sm">
            <input type="checkbox" name="allowAds" defaultChecked={meta?.allowAds ?? true} className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" />
            <span><b className="flex items-center gap-1"><Megaphone className="h-4 w-4" /> السماح بنشر الإعلانات</b><span className="block text-xs text-muted-foreground">يظهر زر «أضف إعلان» ويسمح لمتجرك بالمشاركة في نشر الإعلانات.</span></span>
          </label>
          <label className="flex items-start gap-2 rounded-xl border p-3 text-sm">
            <input type="checkbox" name="allowReviews" defaultChecked={meta?.allowReviews ?? true} className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" />
            <span><b className="flex items-center gap-1"><MessageSquare className="h-4 w-4" /> فتح التعليقات والتقييم</b><span className="block text-xs text-muted-foreground">عند الإيقاف تُقفل تقييمات وتعليقات العملاء في صفحة المتجر.</span></span>
          </label>
          <div className="rounded-xl border p-3">
            <b className="flex items-center gap-1 text-sm"><Megaphone className="h-4 w-4" /> إعلان/تنويه أعلى المتجر</b>
            <span className="mt-0.5 block text-xs text-muted-foreground">نص يظهر بارزاً أعلى واجهة متجرك (عرض، ساعات العمل، ملاحظة...). اتركه فارغاً لإخفائه.</span>
            <textarea name="announce" rows={2} maxLength={300} defaultValue={meta?.announce ?? ''} placeholder="مثال: خصم ٢٠٪ هذا الأسبوع • التوصيل خلال ٢٤ ساعة" className="mt-2 w-full rounded-lg border bg-white p-2 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div className="rounded-xl border p-3">
            <b className="flex items-center gap-1 text-sm"><MessageSquare className="h-4 w-4" /> نصوص مراسلة المتجر الجاهزة</b>
            <span className="mt-0.5 block text-xs text-muted-foreground">نصوص تظهر لعملاء متجرك داخل مربّع المحادثة ليعدّلوها ويرسلوها، وتُعبَّأ في واتساب عند التواصل. كل سطر = نص مستقل. اتركها فارغة لإخفائها. (خاصّة بمتجرك — مستقلّة عن نصوص تربح).</span>
            <textarea name="msgTemplates" rows={3} defaultValue={meta?.msgTemplates ?? ''} placeholder={'السلام عليكم، هل هذا المنتج متوفّر؟\nما هي طرق التوصيل والدفع؟'} className="mt-2 w-full rounded-lg border bg-white p-2 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div className="rounded-xl border p-3">
            <b className="flex items-center gap-1 text-sm"><SlidersHorizontal className="h-4 w-4" /> إظهار / إخفاء عناصر المتجر</b>
            <span className="mt-0.5 mb-2 block text-xs text-muted-foreground">اختر ما يظهر لزوّار متجرك. متجرك مستقل — تتحكم بعناصره كما تريد.</span>
            <div className="grid grid-cols-2 gap-2">
              {STORE_HIDE_FIELDS.map((f) => (
                <label key={f.key} className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm">
                  <input type="checkbox" name={`show_${f.key}`} defaultChecked={!parseHiddenFields(meta?.hiddenFields).has(f.key)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                  {f.label}
                </label>
              ))}
            </div>
          </div>
          <Button size="sm">حفظ الإعدادات</Button>
        </form>
      )}

      {/* دخول مستقل للمتجر — اسم دخول وكلمة مرور خاصّان بالمتجر (منفصلان تماماً عن تربح) */}
      {store && (
        <form action={setStoreCredentialsAction} className="card-3d space-y-3 rounded-2xl p-4">
          <div className="flex items-center gap-2 font-bold text-primary"><KeyRound className="h-5 w-5" /> دخول مستقل للمتجر</div>
          {cred === 'ok' && <div className="rounded-lg bg-emerald-50 p-2 text-xs font-bold text-emerald-700">✓ تم حفظ بيانات الدخول.</div>}
          {crederr && <div className="rounded-lg bg-red-50 p-2 text-xs font-bold text-red-700">⚠️ {decodeURIComponent(crederr)}</div>}
          <p className="text-xs text-muted-foreground">
            عيّن <b>اسم دخول</b> و<b>كلمة مرور</b> خاصّين بالمتجر ومختلفين تماماً عن بيانات دخولك في تربح.
            تدخل بهما لوحة متجرك مباشرة من صفحة <b>دخول المتاجر</b>. إن تركت اسم الدخول فارغاً يمكنك الدخول بمعرّف المتجر{meta?.handle ? <> (<span dir="ltr">{meta.handle}</span>)</> : ''}.
          </p>
          <div className={`rounded-lg p-2 text-xs font-bold ${storePwSet ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            {storePwSet ? '✓ الدخول المستقل مُفعّل — يمكنك تعديل الاسم أو كلمة المرور أدناه.' : '⚠️ لم يُفعّل بعد. عيّن اسم دخول وكلمة مرور لتفعيله.'}
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-muted-foreground">اسم دخول المتجر</label>
            <input name="storeUsername" dir="ltr" defaultValue={storeLoginInfo.username ?? ''} placeholder="mystore" className="h-11 w-full rounded-lg border bg-background px-3 text-left text-sm outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-muted-foreground">كلمة مرور المتجر</label>
            <input name="storePassword" type="password" minLength={4} required={!storePwSet} placeholder={storePwSet ? 'اتركها فارغة للإبقاء على كلمة المرور الحالية' : 'كلمة مرور المتجر (٤ خانات فأكثر)'} className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm">{storePwSet ? 'حفظ التعديلات' : 'تفعيل الدخول المستقل'}</Button>
            <a href="/store-login" target="_blank" className="text-xs font-bold text-primary underline">صفحة دخول المتاجر</a>
          </div>
        </form>
      )}

      {/* تعهّد الشروط الموثّق (نسخة لدى العضو ونسخة لدى الإدارة) */}
      {store && meta?.termsAgreed && (
        <div className="card-3d rounded-xl p-3 text-sm">
          <div className="font-bold text-emerald-700">📄 تعهّدك موثّق</div>
          <p className="mt-1 text-muted-foreground">وافقت على <Link href="/store-terms" target="_blank" className="font-bold text-primary underline">الشروط والأحكام وسياسة الخصوصية</Link> وتحمّل مسؤولية إعلاناتك{meta.termsAgreedAt ? ` بتاريخ ${fmtDate(meta.termsAgreedAt)}` : ''}. (صفحة مقروءة غير قابلة للتعديل، نسخة محفوظة لديك ونسخة لدى إدارة متاجر تربّح).</p>
        </div>
      )}

      {/* إنذارات المخالفة الموجّهة للمتجر */}
      {store && warnings.length > 0 && (
        <div className="card-3d rounded-xl border-2 border-red-200 bg-red-50/50 p-3 text-sm">
          <div className="font-bold text-red-700">⚠️ إنذارات ({en(warnings.length)}/3) — عند بلوغ ٣ يُوقف المتجر</div>
          <ul className="mt-1 space-y-1 text-foreground/80">
            {warnings.map((w) => <li key={w.id} className="flex justify-between gap-2"><span>• {w.reason || 'مخالفة'}</span><span className="shrink-0 text-xs text-muted-foreground">{w.at ? fmtDate(w.at) : ''}</span></li>)}
          </ul>
        </div>
      )}

      {store && stats && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {[
            { l: 'زوّار المتجر', v: en(visitorStats?.uniqueVisitors ?? 0) },
            { l: 'مشاهدات المتجر', v: en(totalAdViews) },
            { l: 'المتابعون', v: en(stats.followers) },
            { l: 'التقييم', v: stats.rating.count ? `${stats.rating.avg}★` : '—' },
            { l: 'إعلانات نشطة', v: en(stats.ads) },
            { l: 'زيارات ٧ أيام', v: en(visitorStats?.visits7 ?? 0) },
          ].map((s) => (
            <div key={s.l} className="card-3d flex flex-col items-center gap-0.5 rounded-xl p-3 text-center">
              <div className="text-lg font-bold text-primary">{s.v}</div><div className="text-[11px] leading-tight text-muted-foreground">{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* إحصائيات المتجر: زوّار + مشاهدات إعلانات + تحليل الإعلانات */}
      {store && (
        <Link href="/store/analytics" className="flex items-center justify-between gap-2 rounded-2xl border-2 border-primary/20 bg-primary/5 p-4 transition hover:bg-primary/10">
          <span className="flex items-center gap-2 font-bold text-primary"><BarChart3 className="h-5 w-5" /> إحصائيات المتجر</span>
          <span className="text-xs text-muted-foreground">زوّار المتجر • مشاهدات الإعلانات • تحليل الإعلانات ←</span>
        </Link>
      )}

      {store && <CopyLink url={`https://${SITE.domain}/companies/${store.id}`} />}

      {/* الرابط المستقل للمتجر (نطاق فرعي) */}
      {store && meta?.handle && (
        <div className="card-3d space-y-2 rounded-2xl p-4">
          <div className="flex items-center gap-2 font-bold text-primary"><Globe className="h-5 w-5" /> رابط متجرك المستقل</div>
          <CopyLink url={`https://${meta.handle}.${SITE.domain}`} label="النطاق الفرعي للمتجر" />
          <p className="text-xs text-muted-foreground">يعمل النطاق الفرعي فور تفعيل إعداد النطاق على الخادم. حتى ذلك الحين يعمل الرابط المختصر <b dir="ltr">{SITE.domain}/companies/{store.id}</b>.</p>
        </div>
      )}

      {/* طلب عرض الإعلانات في منصة تربح — يعتمده مراقب المتاجر (إعلان المتجر يظهر تلقائياً) */}
      {store && (
        <div className="card-3d space-y-2 rounded-2xl p-4">
          <div className="flex items-center gap-2 font-bold text-primary"><Megaphone className="h-5 w-5" /> عرض إعلاناتي في منصة تربح</div>
          <p className="text-xs text-muted-foreground">إعلان متجرك يظهر في تربح تلقائياً بعد الاعتماد. أمّا عرض <b>إعلاناتك</b> في صفحة تربح فيحتاج طلباً تعتمده إدارة المتاجر.</p>
          {platformState === 'approved' ? (
            <div className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">✓ إعلاناتك معتمدة للعرض في منصة تربح.</div>
          ) : platformState === 'pending' ? (
            <div className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-700">⏳ طلبك قيد المراجعة لدى إدارة المتاجر.</div>
          ) : (
            <form action={requestPlatformAction}>
              <Button size="sm"><Megaphone className="h-4 w-4" /> إرسال طلب عرض الإعلانات</Button>
            </form>
          )}
        </div>
      )}

      {/* طلب نقل ملكية وارد — يحتاج موافقة الصاحب الأول قبل تنفيذ الإدارة */}
      {store && pendingTransfer && (
        <div className="card-3d space-y-2 rounded-2xl border-2 border-amber-300 bg-amber-50/50 p-4">
          <div className="flex items-center gap-2 font-bold text-amber-700"><UserCog className="h-5 w-5" /> طلب نقل ملكية المتجر</div>
          <p className="text-sm text-foreground/80">
            العضو <b>{pendingTransfer.toName}</b>{pendingTransfer.toPhone ? <> (<span dir="ltr">{pendingTransfer.toPhone}</span>)</> : null} يطلب نقل ملكية متجرك إليه.
            بموافقتك ينتقل المتجر بكامل معلوماته (الاسم والجوال والبريد) بعد تنفيذ الإدارة، وتعود أنت عضواً عادياً.
          </p>
          <div className="flex gap-2">
            <form action={respondTransferAction}><input type="hidden" name="storeId" value={store.id} /><input type="hidden" name="action" value="accept" /><button className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white">أوافق على النقل</button></form>
            <form action={respondTransferAction}><input type="hidden" name="storeId" value={store.id} /><input type="hidden" name="action" value="reject" /><button className="rounded-lg border border-destructive/40 px-4 py-1.5 text-xs font-bold text-destructive">رفض</button></form>
          </div>
        </div>
      )}

      {/* إعلانات المتجر — المتجر مستقل: يعرض فقط ما تختاره هنا، لا كل إعلاناتك */}
      {store && (
        <form action={setStoreProductsAction} className="card-3d space-y-3 rounded-2xl p-4">
          <div className="flex items-center gap-2 font-bold text-primary"><PackageOpen className="h-5 w-5" /> إعلانات المتجر</div>
          <p className="text-xs text-muted-foreground">المتجر مستقل تماماً: اختر الإعلانات التي تريد عرضها في متجرك. الإعلانات غير المحدّدة لا تظهر في المتجر.</p>
          {myActiveAds.length === 0 ? (
            <p className="rounded-xl bg-secondary/30 p-3 text-sm text-muted-foreground">لا توجد لديك إعلانات نشطة لعرضها. أضف إعلاناً أولاً ثم اختره هنا.</p>
          ) : (
            <>
              <div className="grid max-h-80 gap-1.5 overflow-y-auto">
                {myActiveAds.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
                    <input type="checkbox" name="productIds" value={a.id} defaultChecked={inStore.has(a.id)} className="h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" />
                    <span className="truncate">{a.title || `إعلان #${a.id}`}</span>
                    <span className="mr-auto shrink-0 text-xs text-muted-foreground">{a.adsType === 'request' ? 'طلب' : 'عرض'}</span>
                  </label>
                ))}
              </div>
              <Button size="sm">حفظ إعلانات المتجر</Button>
            </>
          )}
        </form>
      )}

      {store && offers.length > 0 && (
        <div className="card-3d space-y-3 rounded-2xl p-4">
          <div className="flex items-center gap-2 font-bold text-primary"><Handshake className="h-5 w-5" /> دعوات واردة</div>
          {offers.map((o) => (
            <div key={o.id} className="space-y-2 rounded-xl border-2 border-primary/20 bg-primary/5 p-3">
              <div className="flex items-center gap-1.5 text-sm font-bold text-primary">
                {o.kind === 'home' ? <><Home className="h-4 w-4" /> طلب من الإدارة بعرض إعلاناتك في الصفحة الرئيسية</> : <><Handshake className="h-4 w-4" /> دعوة تعاون لعرض الإعلانات المتبادل</>}
              </div>
              {o.from && <StoreMiniCard s={o.from} />}
              <div className="flex gap-2">
                <form action={respondOfferAction}><input type="hidden" name="offerId" value={o.id} /><input type="hidden" name="action" value="accept" /><button className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white">قبول</button></form>
                <form action={respondOfferAction}><input type="hidden" name="offerId" value={o.id} /><input type="hidden" name="action" value="reject" /><button className="rounded-lg border border-destructive/40 px-4 py-1.5 text-xs font-bold text-destructive">رفض</button></form>
              </div>
            </div>
          ))}
        </div>
      )}

      {store && collabs.length > 0 && (
        <div className="card-3d space-y-2 rounded-2xl p-4">
          <div className="flex items-center gap-2 font-bold text-primary"><Handshake className="h-5 w-5" /> شركاء متجرك ({collabs.length})</div>
          {collabs.map((c) => c && <StoreMiniCard key={c.id} s={c} href={`/companies/${c.id}`} />)}
        </div>
      )}

      <form action={saveCompanyAction} className="space-y-4 card-3d rounded-xl p-5">
        <div className="flex items-center gap-2 text-sm font-extrabold text-primary"><Palette className="h-5 w-5" /> مصمّم المتجر الذكي</div>
        <StoreDesigner initial={{ storeName: meta?.storeName, color: meta?.color, banner: meta?.banner, tagline: meta?.tagline, about: meta?.about, layout: meta?.layout, catalog: meta?.catalog, fields: meta?.fields, handle: meta?.handle, logoUrl }} />
        <div><label className="mb-1 block text-sm font-medium">شعار المتجر (صورة)</label><input name="logo" type="file" accept="image/*" className="w-full rounded-lg border bg-background p-2 text-sm" /></div>

        {/* بيانات النشاط التجاري */}
        <div className="space-y-3 rounded-xl border-2 border-primary/15 bg-secondary/20 p-3">
          <div className="text-sm font-extrabold text-primary">بيانات النشاط التجاري</div>
          <div>
            <label className="mb-1 block text-sm font-medium">تخصّص المتجر</label>
            <input name="specialty" defaultValue={meta?.specialty ?? ''} maxLength={120} className={field} placeholder="مثال: إلكترونيات ومستلزمات الجوّال" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">الطبقة المستهدفة</label>
            <input name="audience" defaultValue={meta?.audience ?? ''} maxLength={160} className={field} placeholder="مثال: أصحاب المشاريع الصغيرة والأفراد" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">تاريخ مزاولة النشاط <span className="text-muted-foreground">(اختياري)</span></label>
            <input name="since" type="date" defaultValue={meta?.since ?? ''} className={field} />
          </div>
        </div>

        {/* بيانات التواصل والهوية */}
        <div className="space-y-3 rounded-xl border-2 border-primary/15 bg-secondary/20 p-3">
          <div className="text-sm font-extrabold text-primary">بيانات التواصل والهوية</div>
          <div>
            <label className="mb-1 block text-sm font-medium">رقم الهوية / السجل التجاري <span className="text-muted-foreground">(سرّي — للإدارة فقط)</span></label>
            <input name="nationalId" defaultValue={meta?.nationalId ?? ''} maxLength={30} inputMode="numeric" className={field} placeholder="10xxxxxxxx" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">رقم الجوال</label>
            <input name="phone" defaultValue={meta?.phone ?? ''} maxLength={24} inputMode="tel" dir="ltr" className={field} placeholder="05xxxxxxxx" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">البريد الإلكتروني</label>
            <input name="email" type="email" defaultValue={meta?.email ?? ''} maxLength={120} dir="ltr" className={field} placeholder="store@example.com" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">وسائل تواصل أخرى <span className="text-muted-foreground">(اختياري)</span></label>
            <input name="contacts" defaultValue={meta?.contacts ?? ''} maxLength={500} dir="ltr" className={field} placeholder="واتساب / تويتر / موقع إلكتروني ..." />
          </div>
        </div>

        <div><label className="mb-1 block text-sm font-medium">وصف النشاط / ملف الأعمال</label><textarea name="description" defaultValue={store?.description ?? ''} rows={4} className="w-full rounded-lg border bg-background p-3 text-sm" placeholder="نبذة عن نشاط المتجر والخدمات المقدمة" /></div>
        <div><label className="mb-1 block text-sm font-medium">العنوان</label><input name="address" defaultValue={store?.address ?? ''} className={field} /></div>

        {/* الموافقة على شروط المتجر — إلزامية عند فتح متجر جديد */}
        {!store && (
          <label className="flex items-start gap-2 rounded-xl border-2 border-primary/25 bg-primary/5 p-3 text-sm">
            <input type="checkbox" name="agreeTerms" required className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" />
            <span>أتعهّد بالموافقة على <Link href="/store-terms" target="_blank" className="font-bold text-primary underline">الشروط والأحكام وسياسة الخصوصية</Link> وأتحمّل كامل مسؤولية إعلاناتي وصحّة بياناتي.</span>
          </label>
        )}

        <Button>{store ? 'حفظ المتجر' : 'إنشاء المتجر'}</Button>
      </form>

      {store && (
        <div className="space-y-3 card-3d rounded-xl p-5">
          <h2 className="font-bold">الفروع</h2>
          <ul className="space-y-1 text-sm">
            {branches.map((b) => <li key={toInt(b.id)}>• {b.name} {b.address && <span className="text-muted-foreground">— {b.address}</span>}</li>)}
            {branches.length === 0 && <li className="text-muted-foreground">لا توجد فروع بعد.</li>}
          </ul>
          <form action={addBranchAction} className="flex flex-wrap gap-2">
            <input name="name" required placeholder="اسم الفرع" className="h-10 flex-1 rounded-lg border bg-background px-3 text-sm" />
            <input name="address" placeholder="العنوان" className="h-10 flex-1 rounded-lg border bg-background px-3 text-sm" />
            <Button size="sm">إضافة فرع</Button>
          </form>
        </div>
      )}

      {/* علاقة المتجر بتربح: عبر إدارة المتاجر فقط */}
      <div className="rounded-xl border border-primary/15 bg-primary/5 p-3 text-[11px] leading-5 text-muted-foreground">
        <span className="flex items-center gap-1.5 font-bold text-primary"><ShieldCheck className="h-3.5 w-3.5" /> علاقة المتجر بمنصة تربح</span>
        متجرك مستقل بصفحته وإدارته. علاقته بتربح عبر «إدارة المتاجر» فقط: الاعتماد والإيقاف/الحذف، الاشتراكات، نقل الملكية، واعتماد عرض الإعلانات في المنصة.
      </div>
    </div>
  );
}
