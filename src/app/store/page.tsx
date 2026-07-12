import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getStoreByUser } from '@/lib/stores';
import { getStoreMeta, followersCount, getStoreRating, incomingOffers, collaboratorStoreIds, storeCard, getStoreWarnings, storeProductAdIds, pendingTransferForOwner, platformRequestState, STORE_HIDE_FIELDS, parseHiddenFields } from '@/lib/merchant';
import { getMyAds } from '@/lib/account';
import { getStoreVisitorStats, getStoreViews } from '@/lib/store-analytics';
import { StoreDesigner } from '@/components/store-designer';
import { StoreMiniCard } from '@/components/store-mini-card';
import { CopyLink } from '@/components/copy-link';
import { respondOfferAction, respondTransferAction } from '@/app/companies/actions';
import { setStoreProductsAction, requestPlatformAction, saveCompanyAction, addBranchAction, saveStoreSettingsAction, subscribeStoreAction, storeBackupNowAction, storeRestoreAction, storeRestoreFileAction, bulkUploadProductsAction, buyStoreShowAction, buyAdShowAction, addStoreCouponAction, deleteStoreCouponAction, toggleStoreCouponAction, toggleAutoRenewAction, buyStorePlusAction, addStoreStaffAction, removeStoreStaffAction, requestStoreNameExceptionAction, storeMessageMemberAction } from '@/app/account/company/actions';
import { getStoreSub } from '@/lib/subscription';
import { getStoreSubPricing } from '@/lib/settings';
import { Palette, Handshake, Home, PackageOpen, UserCog, Globe, Megaphone, ShieldCheck, PlusCircle, MessageSquare, SlidersHorizontal, KeyRound, BarChart3, Crown, BookOpen, DatabaseBackup } from 'lucide-react';
import { mediaUrl } from '@/lib/media';
import { SITE } from '@/lib/constants';
import { prisma } from '@/lib/prisma';
import { toInt } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'إدارة المتجر' };

export default async function StoreAdminPage({ searchParams }: { searchParams: Promise<{ error?: string; sub?: string; added?: string; settings?: string; backup?: string; bulk?: string; show?: string; adshow?: string; price?: string; coupon?: string; renew?: string; plus?: string; staff?: string; other?: string; othername?: string; want?: string; exc?: string; mm?: string; nreq?: string }> }) {
  const { error, sub, added, settings, backup, bulk, show, adshow, price, coupon, renew, plus, staff, other, othername, want, exc, mm, nreq } = await searchParams;
  const session = await requireUser();
  // تذكيرات قرب انتهاء الاشتراك + التجديد التلقائي — تشغيل كسول ذاتي الخنق (لا جدولة خلفية)
  import('@/lib/subscription').then((m) => m.sendDueSubReminders()).catch(() => {});
  import('@/lib/subscription').then((m) => m.runAutoRenewals()).catch(() => {});
  // نسخة احتياطية دورية تلقائية للمتجر (مرة يومياً كحدّ أقصى)
  import('@/lib/store-backup').then((m) => m.maybeAutoBackup(session.uid)).catch(() => {});
  const store = await getStoreByUser(session.uid);
  // موظفو المتجر (staff_on): بطاقة إدارة للمالك + لوحة مصغّرة للموظف
  const staffOn = await (await import('@/lib/settings')).staffEnabled().catch(() => false);
  const staffList = store && staffOn ? await (await import('@/lib/merchant')).listStoreStaff(store.id).catch(() => []) : [];
  const myStaffStoreId = !store && staffOn ? await (await import('@/lib/merchant')).staffStoreId(session.uid).catch(() => 0) : 0;
  const staffStore = myStaffStoreId ? await (await import('@/lib/merchant')).storeCard(myStaffStoreId).catch(() => null) : null;
  const backups = store ? await (await import('@/lib/store-backup')).listStoreBackups(store.id).catch(() => []) : [];
  const bulkCats = store ? await (await import('@/lib/data')).getCategories().catch(() => []) : [];
  // الظهور المدفوع في تربح: التسعيرات + حالة المتجر + منتجاته وحالات عرضها
  const showPricing = store ? await (await import('@/lib/settings')).getTrbhhShowPricing().catch(() => null) : null;
  const { prisma: db } = await import('@/lib/prisma');
  const storeShowRow = store ? await db.stores.findUnique({ where: { id: BigInt(store.id) }, select: { show_until: true, show_on_platform: true } }).catch(() => null) : null;
  const productAdIds = store ? await (await import('@/lib/merchant')).storeProductAdIds(store.id).catch(() => [] as number[]) : [];
  const showProducts = productAdIds.length
    ? await db.ads.findMany({ where: { id: { in: productAdIds.map((i) => BigInt(i)) } }, select: { id: true, title: true, trbhh_until: true }, orderBy: { id: 'desc' }, take: 100 }).catch(() => [])
    : [];
  const fmtD = (d: Date | null) => (d ? new Intl.DateTimeFormat('ar', { dateStyle: 'medium' }).format(d) : '');
  const storeShowActive = !!(storeShowRow?.show_until && storeShowRow.show_until > new Date());
  const shownAds = showProducts.filter((a) => a.trbhh_until && a.trbhh_until > new Date());
  // ميزات المتجر الإضافية (تفعيلها العام من التحكم): كوبونات + دوام
  const xtr = await import('@/lib/store-extras');
  const [couponsOn, hoursOn] = store ? await Promise.all([xtr.couponsEnabled(), xtr.hoursEnabled()]) : [false, false];
  const coupons = store && couponsOn ? await xtr.listStoreCoupons(store.id).catch(() => []) : [];
  const storeHours = store && hoursOn ? await xtr.getStoreHours(store.id).catch(() => ({ from: null, to: null, days: [] as number[] })) : { from: null, to: null, days: [] as number[] };
  const subState = store ? await getStoreSub(store.id) : null;
  const subPricing = await getStoreSubPricing();
  // التجديد التلقائي + باقة Plus (تفعيلهما العام من التحكم)
  const autoRenewOn = store ? await (await import('@/lib/settings')).autoRenewEnabled().catch(() => false) : false;
  const plusPricing = store ? await (await import('@/lib/settings')).getStorePlusPricing().catch(() => null) : null;
  const storeXRow = store ? await db.stores.findUnique({ where: { id: BigInt(store.id) }, select: { auto_renew: true, sub_plan: true, plus_until: true } }).catch(() => null) : null;
  const plusActive = !!(storeXRow?.plus_until && storeXRow.plus_until > new Date());
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
  // رسائل غير مقروءة (من عملاء متجره وغيرهم) — تنبيه أول ما يفتح لوحته
  const unreadChats = store ? await prisma.chats.count({ where: { reciver_id: session.uid, is_read: 0 } }).catch(() => 0) : 0;
  // طلب تغيير اسم المتجر المعلّق (بموافقة إدارة المتاجر)
  const pendingNameReq = store ? await prisma.name_requests.findFirst({ where: { user_id: BigInt(session.uid), kind: 'store', status: 0 }, select: { new_name: true } }).catch(() => null) : null;
  const myActiveAds = store ? (await getMyAds(session.uid)).filter((a) => a.status === 1) : [];
  const inStore = new Set(store ? await storeProductAdIds(store.id) : []);
  // مشاهدات المتجر = عدد مرّات دخول/تحديث صفحة المتجر (مشاهدة واحدة لكل زيارة)
  const totalAdViews = store ? await getStoreViews(store.id) : 0;
  const pendingTransfer = store ? await pendingTransferForOwner(session.uid) : null;
  const platformState = store ? await platformRequestState(store.id) : 'none';
  const fmtDate = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('ar', { dateStyle: 'medium' }).format(d); };
  const en = (n: number) => new Intl.NumberFormat('en-US').format(n);
  const field = 'h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring';
  return (
    <div className="space-y-4">
      {!store && !staffStore && (
        <div className="card-3d rounded-xl p-4">
          <h1 className="text-lg font-extrabold text-primary">افتح متجرك المستقل</h1>
          <p className="mt-1 text-sm text-muted-foreground">صمّم متجرك، اختر معرّفه (رابطه المستقل)، وابدأ عرض إعلاناتك. يخضع المتجر لموافقة إدارة المتاجر قبل الظهور.</p>
        </div>
      )}

      {/* لوحة الموظف المصغّرة: يضيف منتجات باسم المتجر الذي يعمل فيه */}
      {!store && staffStore && (
        <div className="card-3d space-y-3 rounded-2xl border-2 border-teal-300 bg-teal-50/40 p-4">
          {added === '1' && <div className="rounded-lg bg-emerald-50 p-2 text-xs font-bold text-emerald-700">✓ نُشر المنتج وأُضيف لواجهة المتجر.</div>}
          {added === 'pending' && <div className="rounded-lg bg-amber-50 p-2 text-xs font-bold text-amber-700">✓ استُلم المنتج وسيظهر بعد موافقة الإدارة.</div>}
          <div className="flex items-center gap-2 font-bold text-teal-800">👤 أنت موظف في متجر «{staffStore.name}»</div>
          <p className="text-xs text-muted-foreground">يمكنك إضافة منتجات تظهر باسم المتجر في واجهته — يديرها صاحب المتجر ويستطيع إزالتك في أي وقت.</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/ads/new?dest=store" className="btn-3d flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-extrabold text-white"><PlusCircle className="h-4 w-4" /> أضف منتجاً للمتجر</Link>
            <Link href={`/companies/${myStaffStoreId}`} className="flex items-center gap-1.5 rounded-lg border border-teal-300 bg-white px-4 py-2 text-sm font-bold text-teal-700">عرض واجهة المتجر ←</Link>
          </div>
        </div>
      )}

      {/* 💬 رسائل جديدة — تظهر للتاجر أول ما يفتح لوحة متجره */}
      {unreadChats > 0 && (
        <Link href="/messages" className="card-3d flex items-center gap-3 rounded-xl !border-sky-400 bg-sky-50 p-3 hover:bg-sky-100">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-sky-500 text-lg text-white">💬</span>
          <span className="flex-1 text-sm font-bold text-sky-900">لديك {unreadChats} رسالة جديدة (من عملاء متجرك وغيرهم) — اضغط للرد من رسائلك</span>
          <span className="shrink-0 rounded-full bg-sky-500 px-2.5 py-1 text-xs font-extrabold text-white">{unreadChats}</span>
        </Link>
      )}

      {/* ✉️ مراسلة عضو من داخل المتجر — برقم جواله، تصله باسم المتجر */}
      {store && (
        <details className="card-3d rounded-xl">
          <summary className="cursor-pointer list-none p-3 text-sm font-bold text-primary">✉️ مراسلة عضو (من متجرك — برقم جواله)…</summary>
          <div className="space-y-2 border-t border-primary/10 p-3">
            {mm === '1' && <p className="rounded-lg bg-emerald-50 p-2 text-xs font-bold text-emerald-700">✓ أُرسلت رسالتك للعضو باسم متجرك — ردّه يصلك في «رسائلي».</p>}
            {mm === 'nouser' && <p className="rounded-lg bg-red-50 p-2 text-xs font-bold text-red-700">لا يوجد عضو مسجّل بهذا الرقم.</p>}
            {mm === 'blocked' && <p className="rounded-lg bg-red-50 p-2 text-xs font-bold text-red-700">الرسالة تحتوي محتوى غير مسموح ولم تُرسل.</p>}
            {mm === 'err' && <p className="rounded-lg bg-amber-50 p-2 text-xs font-bold text-amber-800">أكمل رقم الجوال ونص الرسالة.</p>}
            <form action={storeMessageMemberAction} className="space-y-2">
              <input name="phone" type="tel" required placeholder="جوال العضو (05xxxxxxxx)" className="h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" dir="ltr" />
              <textarea name="message" required rows={2} maxLength={1500} placeholder="رسالتك — تصل العضو باسم متجرك…" className="w-full rounded-lg border bg-white p-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
              <button className="btn-3d rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">إرسال</button>
            </form>
          </div>
        </details>
      )}

      {error === 'terms' && (
        <div className="card-3d rounded-xl border-2 border-destructive/40 p-3 text-sm font-bold text-destructive">
          يجب الموافقة على شروط المتجر وتحمّل مسؤولية الإعلانات قبل فتح المتجر.
        </div>
      )}
      {error === 'badname' && (
        <div className="card-3d rounded-xl border-2 border-destructive/40 p-3 text-sm font-bold text-destructive">
          اسم المتجر (أو وصفه المختصر) يحتوي كلمة غير مسموحة — اختر اسماً آخر أو راسل الإدارة.
        </div>
      )}
      {error === 'namedup' && (
        <div className="card-3d space-y-2 rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">
          <div>⚠ الاسم مشابه لاسم متجر آخر — عدّل لاسم مختلف. (لم يُحفظ الاسم، وبقية إعداداتك لم تتأثر — جرّب كما تشاء بلا أي قيد)</div>
          {other && (
            <Link href={`/companies/${other}`} target="_blank" className="inline-flex items-center gap-1 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100">
              👁 عرض المتجر المشابه{othername ? `: «${othername}»` : ''} ←
            </Link>
          )}
          {/* طلب استثناء: يذهب للإدارة (طلبات تغيير الاسم) وتوافق أو ترفض */}
          {want && (
            <details className="rounded-lg border border-amber-300 bg-white/70">
              <summary className="cursor-pointer list-none px-3 py-2 text-xs font-extrabold text-amber-800">🙋 متمسك بالاسم؟ أرسل طلب استثناء للإدارة…</summary>
              <form action={requestStoreNameExceptionAction} className="space-y-2 border-t border-amber-200 p-3">
                <input type="hidden" name="want" value={want} />
                <input type="hidden" name="other" value={other || ''} />
                <input type="hidden" name="othername" value={othername || ''} />
                <div className="text-xs">الاسم المطلوب: <b>«{want}»</b></div>
                <textarea name="reason" rows={2} maxLength={500} placeholder="مبررك (اختياري): مثال — اسم سجلّي التجاري الرسمي…" className="w-full rounded-lg border border-amber-300 bg-white p-2 text-xs outline-none focus:ring-2 focus:ring-amber-400" />
                <button className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700">إرسال طلب الاستثناء للإدارة</button>
              </form>
            </details>
          )}
        </div>
      )}
      {exc === '1' && <div className="card-3d rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">✓ أُرسل طلب الاستثناء للإدارة — ستصلك رسالة بالموافقة أو الرفض، وعند الموافقة يُطبَّق الاسم تلقائياً.</div>}
      {nreq === '1' && <div className="card-3d rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">✓ حُفظت إعداداتك، وطلب تغيير اسم المتجر أُرسل لإدارة المتاجر — يبقى الاسم الحالي حتى الموافقة، وتصلك رسالة بالنتيجة.</div>}
      {nreq === 'dup' && <div className="card-3d rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900">حُفظت إعداداتك، لكن لديك طلب تغيير اسم سابق قيد المراجعة — انتظر نتيجته قبل طلب اسم آخر.</div>}
      {pendingNameReq && nreq !== '1' && (
        <div className="card-3d rounded-xl border-2 border-sky-300 bg-sky-50 p-3 text-sm font-bold text-sky-900">⏳ طلب تغيير اسم متجرك إلى «{pendingNameReq.new_name}» قيد مراجعة إدارة المتاجر.</div>
      )}
      {exc === 'dup' && <div className="card-3d rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900">لديك طلب استثناء سابق قيد المراجعة — انتظر نتيجته أولاً.</div>}

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
          {sub === 'nocredit' && <div className="rounded-lg bg-amber-50 p-2 text-xs font-bold text-amber-700">الرصيد غير كافٍ — <Link href="/account/wallet#topup" className="text-primary underline">اشحن رصيدك من هنا</Link> ثم أعد المحاولة.</div>}
          {subState.trial && subState.state === 'active' && (
            <div className="rounded-lg bg-indigo-50 p-2 text-xs font-bold text-indigo-700">
              🎁 فترة تجريبية مجانية — متبقٍ {en(Math.max(0, subState.daysLeft))} يوم حتى {fmtDate(subState.until?.toISOString() ?? null)}، ثم يبدأ الاشتراك. لتمديد التجربة <Link href="/messages/admin" className="underline">راسل الإدارة</Link>.
            </div>
          )}
          {subState.trial && subState.state === 'grace' && (
            <div className="rounded-lg bg-amber-50 p-2 text-xs font-bold text-amber-800">⚠️ انتهت فترتك التجريبية. متجرك في <b>مهلة {en(subState.graceDays)} أيام</b> ({en(Math.max(0, subState.graceDaysLeft))} يوم متبقٍ) ثم يُخفى. اشترك الآن أو <Link href="/messages/admin" className="underline">راسل الإدارة</Link> لتمديد التجربة.</div>
          )}
          {!subState.trial && subState.state === 'active' && <div className="rounded-lg bg-emerald-50 p-2 text-xs font-bold text-emerald-700">✓ اشتراكك فعّال حتى {fmtDate(subState.until?.toISOString() ?? null)} (متبقٍ {en(Math.max(0, subState.daysLeft))} يوم).{subState.daysLeft <= 7 && ' يُستحسن التجديد قريباً.'}</div>}
          {!subState.trial && subState.state === 'grace' && <div className="rounded-lg bg-amber-50 p-2 text-xs font-bold text-amber-800">⚠️ انتهى اشتراكك. متجرك في <b>مهلة {en(subState.graceDays)} أيام</b> ({en(Math.max(0, subState.graceDaysLeft))} يوم متبقٍ) ثم يُخفى من العرض. جدّد الآن لتفادي الإيقاف — لن يُحذف شيء.</div>}
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

          {/* التجديد التلقائي — يتجدد بآخر خطة دفعتها ويُخصم من رصيدك قبل الانتهاء بيوم */}
          {autoRenewOn && (
            <div className="rounded-xl border border-primary/15 bg-primary/5 p-3">
              {renew === 'saved' && <div className="mb-2 rounded-lg bg-emerald-50 p-2 text-xs font-bold text-emerald-700">✓ تم حفظ خيار التجديد التلقائي.</div>}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-bold">🔄 التجديد التلقائي {storeXRow?.auto_renew === 1 ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-700">مفعّل</span> : <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-extrabold text-muted-foreground">موقوف</span>}</div>
                  <div className="text-[11px] text-muted-foreground">يتجدد اشتراكك تلقائياً بآخر خطة دفعتها{storeXRow?.sub_plan ? ` (${storeXRow.sub_plan === 'monthly' ? 'شهري' : storeXRow.sub_plan === 'sixmo' ? '6 أشهر' : 'سنوي'})` : ''} ويُخصم من رصيدك قبل الانتهاء بيوم — وتصلك رسالة بالنتيجة. أوقفه متى شئت.</div>
                </div>
                <form action={toggleAutoRenewAction}>
                  <input type="hidden" name="on" value={storeXRow?.auto_renew === 1 ? '0' : '1'} />
                  <button className={`btn-3d rounded-lg px-3 py-1.5 text-xs font-bold text-white ${storeXRow?.auto_renew === 1 ? 'bg-slate-500' : 'bg-emerald-600'}`}>{storeXRow?.auto_renew === 1 ? 'إيقاف التجديد التلقائي' : 'تفعيل التجديد التلقائي'}</button>
                </form>
              </div>
              {storeXRow?.auto_renew === 1 && !storeXRow?.sub_plan && <p className="mt-1 text-[11px] font-bold text-amber-700">⚠ يعمل التجديد التلقائي بعد أول دفعة اشتراك (لتحديد الخطة).</p>}
            </div>
          )}
        </div>
      )}

      {/* باقة متجر Plus ⭐ — اشتراك + عرض في تربح + شارة مميزة، دفعة واحدة */}
      {store && plusPricing && plusPricing.enabled && (plusPricing.monthly > 0 || plusPricing.sixmo > 0 || plusPricing.yearly > 0) && (
        <div className="card-3d space-y-3 rounded-2xl border-2 border-amber-300 bg-amber-50/40 p-4">
          <div className="flex items-center gap-2 font-bold text-amber-800">⭐ باقة متجر Plus</div>
          {plus === '1' && <div className="rounded-lg bg-emerald-50 p-2 text-xs font-bold text-emerald-700">✓ فُعّلت باقة Plus وخُصم المبلغ من رصيدك — اشتراكك وعرضك في تربح وشارتك ⭐ سارية الآن.</div>}
          {plus === 'needcredit' && <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-2 text-xs font-bold text-amber-900">💳 رصيدك لا يكفي — <Link href="/account/wallet#topup" className="text-primary underline">اشحن رصيدك من هنا</Link> ثم أعد المحاولة.</div>}
          {plus === 'err' && <div className="rounded-lg bg-red-50 p-2 text-xs font-bold text-red-700">تعذّر التنفيذ — حاول مجدداً.</div>}
          {plusActive && <div className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">⭐ باقة Plus مفعّلة حتى: {fmtD(storeXRow!.plus_until)}</div>}
          <p className="text-xs text-muted-foreground">صفقة واحدة تجمع: <b>اشتراك المتجر</b> + <b>عرض متجرك ومنتجاته في رئيسية تربح</b> + <b>شارة ⭐ Plus</b> على واجهة متجرك طوال المدة — تُخصم من رصيدك.</p>
          <div className="grid grid-cols-3 gap-2">
            {([['monthly', plusPricing.monthly, 'شهري'], ['sixmo', plusPricing.sixmo, '6 أشهر'], ['yearly', plusPricing.yearly, 'سنوي']] as const).filter(([, p0]) => p0 > 0).map(([plan, p0, label]) => (
              <form key={plan} action={buyStorePlusAction} className="flex flex-col items-center gap-1 rounded-xl border border-amber-300 bg-white p-3 text-center">
                <input type="hidden" name="plan" value={plan} />
                <div className="text-xs font-bold text-muted-foreground">{label}</div>
                <div className="text-lg font-extrabold text-amber-700">{en(p0)} <span className="text-[10px]">ر.س</span></div>
                <button className="btn-3d w-full rounded-lg bg-amber-500 px-2 py-1.5 text-xs font-bold text-white">{plusActive ? 'تمديد' : 'اشتراك Plus'}</button>
              </form>
            ))}
          </div>
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
            <span className="mt-0.5 block text-xs text-muted-foreground">نصوص تظهر لعملاء متجرك داخل مربّع المحادثة ليعدّلوها ويرسلوها، وتُعبَّأ في واتساب عند التواصل (مع رابط المنتج تلقائياً). المتغيّرات: {'{link}'} الرابط، {'{name}'} اسم المنتج. كل سطر = نص مستقل.</span>
            <textarea name="msgTemplates" rows={3} defaultValue={meta?.msgTemplates ?? ''} placeholder={'السلام عليكم، هل هذا المنتج متوفّر؟\nما هي طرق التوصيل والدفع؟'} className="mt-2 w-full rounded-lg border bg-white p-2 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div className="rounded-xl border p-3">
            <b className="flex items-center gap-1 text-sm"><ShieldCheck className="h-4 w-4" /> تنويه صفحة المنتج</b>
            <span className="mt-0.5 block text-xs text-muted-foreground">نص يظهر أسفل صفحة منتج متجرك (سياسة التوصيل/الإرجاع، مسؤولية المتجر...). اتركه فارغاً لاستخدام النص الافتراضي.</span>
            <textarea name="productNote" rows={2} maxLength={300} defaultValue={meta?.productNote ?? ''} placeholder="مثال: التوصيل خلال ٢٤ ساعة • الاستبدال خلال ٣ أيام" className="mt-2 w-full rounded-lg border bg-white p-2 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          {hoursOn && (
            <div className="rounded-xl border p-3">
              <input type="hidden" name="hoursPresent" value="1" />
              <b className="flex items-center gap-1 text-sm">🕒 دوام المتجر</b>
              <span className="mt-0.5 block text-xs text-muted-foreground">حدد ساعات وأيام العمل ليظهر لعملائك «مفتوح الآن» أو «مغلق الآن» على واجهة متجرك (بتوقيت السعودية). اترك الوقتين فارغين لإخفاء الدوام.</span>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="space-y-1"><span className="text-xs font-bold">من الساعة</span><input name="hoursFrom" type="time" defaultValue={storeHours.from ?? ''} className="h-10 w-full rounded-lg border bg-white px-2 text-sm" /></label>
                <label className="space-y-1"><span className="text-xs font-bold">إلى الساعة</span><input name="hoursTo" type="time" defaultValue={storeHours.to ?? ''} className="h-10 w-full rounded-lg border bg-white px-2 text-sm" /></label>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'].map((d, i) => (
                  <label key={d} className="flex items-center gap-1 rounded-lg border bg-white px-2 py-1 text-xs font-bold">
                    <input type="checkbox" name="hoursDay" value={i} defaultChecked={storeHours.days.length === 0 || storeHours.days.includes(i)} className="h-3.5 w-3.5 accent-[hsl(var(--primary))]" /> {d}
                  </label>
                ))}
              </div>
            </div>
          )}
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

      {/* كوبونات المتجر — رموز خصم تظهر لعملائك على واجهة المتجر (التفعيل العام من التحكم) */}
      {store && couponsOn && (
        <div className="card-3d space-y-3 rounded-2xl p-4">
          <div className="flex items-center gap-2 font-bold text-primary">🎟️ كوبونات الخصم</div>
          {coupon === '1' && <div className="rounded-lg bg-emerald-50 p-2 text-xs font-bold text-emerald-700">✓ أُضيف الكوبون وسيظهر لعملائك على واجهة متجرك.</div>}
          {coupon === 'err' && <div className="rounded-lg bg-red-50 p-2 text-xs font-bold text-red-700">تعذّرت الإضافة — تأكد من الرمز ووصف الخصم (الحد ٢٠ كوبوناً).</div>}
          <p className="text-xs text-muted-foreground">أنشئ رمز خصم (مثال: SALE10 — خصم ١٠٪) يظهر بارزاً على واجهة متجرك مع زر نسخ. العميل يرسله لك عند الطلب وتطبّق الخصم بنفسك.</p>
          <form action={addStoreCouponAction} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <input name="code" required maxLength={30} placeholder="الرمز (SALE10)" dir="ltr" className="h-10 rounded-lg border bg-white px-2 text-sm" />
            <input name="discount" required maxLength={80} placeholder="وصف الخصم (خصم ١٠٪ على الكل)" className="h-10 rounded-lg border bg-white px-2 text-sm sm:col-span-2" />
            <div className="flex gap-2">
              <input name="expires" type="date" className="h-10 min-w-0 flex-1 rounded-lg border bg-white px-2 text-sm" title="تاريخ الانتهاء (اختياري)" />
              <button className="btn-3d shrink-0 rounded-lg bg-primary px-3 text-sm font-bold text-white">إضافة</button>
            </div>
          </form>
          {coupons.length > 0 && (
            <ul className="space-y-1.5">
              {coupons.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl border p-2 text-sm">
                  <b dir="ltr" className="rounded bg-primary/10 px-2 py-0.5 text-primary">{c.code}</b>
                  <span className="min-w-0 flex-1 truncate">{c.discount}</span>
                  {c.expiresAt && <span className="text-[11px] text-muted-foreground">حتى {c.expiresAt}</span>}
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${c.active ? 'bg-emerald-100 text-emerald-700' : 'bg-secondary text-muted-foreground'}`}>{c.active ? 'فعّال' : 'موقوف'}</span>
                  <form action={toggleStoreCouponAction}><input type="hidden" name="id" value={c.id} /><button className="rounded-lg border px-2 py-1 text-[11px] font-bold text-amber-700">{c.active ? 'إيقاف' : 'تفعيل'}</button></form>
                  <form action={deleteStoreCouponAction}><input type="hidden" name="id" value={c.id} /><button className="rounded-lg border border-destructive/40 px-2 py-1 text-[11px] font-bold text-destructive">حذف</button></form>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* موظفو المتجر — يضيفهم المالك برقم الجوال ليضيفوا منتجات باسم المتجر */}
      {store && staffOn && (
        <div className="card-3d space-y-3 rounded-2xl p-4">
          <div className="flex items-center gap-2 font-bold text-primary">👥 موظفو المتجر ({en(staffList.length)}/5)</div>
          {staff === '1' && <div className="rounded-lg bg-emerald-50 p-2 text-xs font-bold text-emerald-700">✓ أُضيف الموظف — يمكنه الآن إضافة منتجات باسم متجرك من «متجري».</div>}
          {staff === 'removed' && <div className="rounded-lg bg-emerald-50 p-2 text-xs font-bold text-emerald-700">✓ أُزيل الموظف.</div>}
          {staff === 'notfound' && <div className="rounded-lg bg-red-50 p-2 text-xs font-bold text-red-700">لا يوجد عضو مسجّل بهذا الرقم — تأكد أن الموظف سجّل في تربح أولاً.</div>}
          {staff === 'cap' && <div className="rounded-lg bg-amber-50 p-2 text-xs font-bold text-amber-800">بلغت الحد الأقصى (5 موظفين) — أزل موظفاً لإضافة آخر.</div>}
          {staff === 'self' && <div className="rounded-lg bg-amber-50 p-2 text-xs font-bold text-amber-800">هذا رقمك أنت — أدخل رقم جوال الموظف.</div>}
          <p className="text-xs text-muted-foreground">أضف موظفاً برقم جواله (يجب أن يكون عضواً مسجّلاً في تربح) — يظهر له في «متجري» لوحة مصغّرة يضيف منها منتجات تظهر باسم متجرك، ولا يملك أي صلاحية أخرى.</p>
          <form action={addStoreStaffAction} className="flex gap-2">
            <input name="phone" required inputMode="tel" dir="ltr" placeholder="05xxxxxxxx" className="h-10 min-w-0 flex-1 rounded-lg border bg-white px-3 text-sm" />
            <button className="btn-3d shrink-0 rounded-lg bg-primary px-4 text-sm font-bold text-white">إضافة موظف</button>
          </form>
          {staffList.length > 0 && (
            <ul className="space-y-1.5">
              {staffList.map((m) => (
                <li key={m.userId} className="flex flex-wrap items-center gap-2 rounded-xl border p-2 text-sm">
                  <span className="font-bold">{m.name}</span>
                  {m.phone && <span dir="ltr" className="text-xs text-muted-foreground">{m.phone}</span>}
                  <form action={removeStoreStaffAction} className="mr-auto">
                    <input type="hidden" name="userId" value={m.userId} />
                    <button className="rounded-lg border border-destructive/40 px-2 py-1 text-[11px] font-bold text-destructive">إزالة</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* بيانات الدخول موحّدة: دخولك في تربح (الجوال + كلمة المرور) يفتح إدارة متجرك تلقائياً */}
      {store && (
        <div className="card-3d rounded-xl p-3 text-sm">
          <div className="flex items-center gap-2 font-bold text-primary"><KeyRound className="h-5 w-5" /> دخول موحّد</div>
          <p className="mt-1 text-xs text-muted-foreground">بيانات دخولك موحّدة (رقم الجوال وكلمة المرور) لتربح ومتجرك معاً — دخولك على تربح يفتح إدارة متجرك تلقائياً بلا دخول آخر، والخروج يخرجك من الاثنين.</p>
        </div>
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

      {/* دليل المتجر — كل ما يخصّ إدارة المتجر */}
      <Link href="/guide/store" className="flex items-center justify-between gap-2 rounded-2xl border-2 border-teal-200 bg-teal-50/60 p-4 transition hover:bg-teal-100/60">
        <span className="flex items-center gap-2 font-bold text-teal-800"><BookOpen className="h-5 w-5" /> دليل المتجر</span>
        <span className="text-xs text-muted-foreground">شرح كل ما يخصّ إدارة متجرك ←</span>
      </Link>

      {/* الظهور المدفوع في تربح: عرض المتجر بالمدد + عرض إعلان بباقة — يُخصم من الرصيد */}
      {store && showPricing && (showPricing.store.w2 > 0 || showPricing.store.m1 > 0 || showPricing.store.y1 > 0 || showPricing.ads.some((a) => a.price > 0)) && (
        <div className="card-3d space-y-3 rounded-2xl p-4">
          <div className="flex items-center gap-2 font-bold text-primary">📣 الظهور في تربح (مدفوع)</div>
          {show === '1' && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-xs font-bold text-emerald-800">✓ فُعّل عرض متجرك في تربح وخُصم المبلغ من رصيدك.</div>}
          {adshow === '1' && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-xs font-bold text-emerald-800">✓ فُعّل عرض إعلانك في تربح وخُصم المبلغ من رصيدك.</div>}
          {(show === 'needcredit' || adshow === 'needcredit') && <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-2 text-xs font-bold text-amber-900">💳 رصيدك لا يكفي{price ? ` (المطلوب ${price} ر.س)` : ''} — <Link href="/account/wallet#topup" className="text-primary underline">اشحن رصيدك من هنا</Link> ثم أعد المحاولة.</div>}
          {(show === 'err' || adshow === 'err') && <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-xs font-bold text-red-700">تعذّر التنفيذ — تأكد من الاختيار وحاول مجدداً.</div>}

          {(showPricing.store.w2 > 0 || showPricing.store.m1 > 0 || showPricing.store.y1 > 0) && (
            <div className="space-y-2 rounded-xl border border-primary/15 bg-primary/5 p-3">
              <div className="text-sm font-bold">🏪 عرض متجرك في رئيسية تربح</div>
              <p className="text-[11px] text-muted-foreground">يظهر متجرك (ومنتجاته) في قسم المتاجر بالصفحة الرئيسية طوال المدة.</p>
              {storeShowActive && <div className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-800">مفعّل حتى: {fmtD(storeShowRow!.show_until)}</div>}
              <div className="grid grid-cols-3 gap-2">
                {([['w2', 'أسبوعان'], ['m1', 'شهر'], ['y1', 'سنة']] as const).filter(([k]) => showPricing.store[k] > 0).map(([k, label]) => (
                  <form key={k} action={buyStoreShowAction} className="text-center">
                    <input type="hidden" name="duration" value={k} />
                    <button className="btn-3d w-full rounded-lg bg-primary px-2 py-2 text-xs font-bold text-white">{label}<br /><span className="text-[10px] opacity-90">{showPricing.store[k]} ر.س</span></button>
                  </form>
                ))}
              </div>
            </div>
          )}

          {showPricing.ads.some((a) => a.price > 0) && showProducts.length > 0 && (
            <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50/50 p-3">
              <div className="text-sm font-bold">📢 عرض إعلان من متجرك في تربح</div>
              <p className="text-[11px] text-muted-foreground">يظهر الإعلان المحدد في كل قوائم تربح (الرئيسية/البحث/الأقسام) طوال مدة الباقة، ويُخصم سعرها من رصيدك.</p>
              <form action={buyAdShowAction} className="space-y-2">
                <select name="adId" required className="h-10 w-full rounded-lg border border-primary/30 bg-background px-2 text-sm">
                  {showProducts.map((a) => (
                    <option key={String(a.id)} value={String(a.id)}>{a.title}{a.trbhh_until && a.trbhh_until > new Date() ? ` — معروض حتى ${fmtD(a.trbhh_until)}` : ''}</option>
                  ))}
                </select>
                <select name="pkg" required className="h-10 w-full rounded-lg border border-primary/30 bg-background px-2 text-sm">
                  {showPricing.ads.filter((a) => a.price > 0).map((a) => (
                    <option key={a.key} value={a.key}>{a.key === 'gold' ? '🥇' : a.key === 'silver' ? '🥈' : '⭐'} {a.label} — {a.days} يوماً — {a.price} ر.س</option>
                  ))}
                </select>
                <button className="btn-3d w-full rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-white">شراء وعرض الإعلان في تربح</button>
              </form>
              {shownAds.length > 0 && (
                <div className="space-y-1 border-t border-amber-200 pt-2 text-[11px] font-bold">
                  <div className="text-muted-foreground">المعروض حالياً في تربح:</div>
                  {shownAds.map((a) => <div key={String(a.id)}>✅ {a.title} — حتى {fmtD(a.trbhh_until)}</div>)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* رفع منتجات دفعة واحدة من ملف Excel/CSV */}
      {store && (
        <div className="card-3d space-y-2 rounded-2xl p-4">
          <div className="flex items-center gap-2 font-bold text-primary">📥 رفع منتجات دفعة واحدة (Excel/CSV)</div>
          {bulk === 'err' && <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-xs font-bold text-red-700">تعذّر قراءة الملف — تأكد أنه CSV (من Excel: حفظ باسم ← CSV UTF-8) وبحجم أقل من 2MB.</div>}
          {bulk && bulk !== 'err' && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-xs font-bold text-emerald-800">✓ أُضيف {bulk} منتجاً لمتجرك دفعة واحدة.</div>}
          <p className="text-xs text-muted-foreground">
            أعمدة الملف: <b>العنوان، التفاصيل، السعر</b> (صف لكل منتج، حتى ٥٠). من Excel: حفظ باسم ← CSV UTF-8.
            {' '}<a href="/bulk-template.csv" download className="font-bold text-primary underline">تنزيل ملف نموذجي</a>
          </p>
          <form action={bulkUploadProductsAction} className="space-y-2">
            <label className="block space-y-1">
              <span className="text-xs font-bold">قسم المنتجات (يُطبَّق على كل الصفوف)</span>
              <select name="category" className="h-10 w-full rounded-lg border border-primary/30 bg-background px-2 text-sm">
                {bulkCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <input type="file" name="file" accept=".csv,text/csv" required className="w-full rounded-lg border border-primary/30 bg-background p-2 text-sm" />
            <button className="btn-3d rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">رفع المنتجات</button>
          </form>
        </div>
      )}

      {/* النسخ الاحتياطي للمتجر — تلقائي دوري + يدوي مع الاستعادة والتحذيرات */}
      {store && (
        <div className="card-3d space-y-3 rounded-2xl p-4">
          <div className="flex items-center gap-2 font-bold text-primary"><DatabaseBackup className="h-5 w-5" /> النسخ الاحتياطي للمتجر</div>
          {backup === 'done' && <div className="rounded-lg bg-emerald-50 p-2 text-xs font-bold text-emerald-700">✓ تم أخذ نسخة احتياطية جديدة.</div>}
          {backup === 'restored' && <div className="rounded-lg bg-emerald-50 p-2 text-xs font-bold text-emerald-700">✓ تمت استعادة المتجر من النسخة.</div>}
          {backup === 'error' && <div className="rounded-lg bg-red-50 p-2 text-xs font-bold text-red-700">⚠️ تعذّرت الاستعادة — تأكّد من صحة الملف/النسخة.</div>}
          <p className="text-xs text-muted-foreground">تُؤخذ نسخة تلقائية دورية لإعدادات متجرك ومنتجاته وفروعه (مرة يومياً)، ويمكنك أخذ نسخة الآن أو الاستعادة. <b className="text-amber-700">تنبيه: الاستعادة تستبدل إعدادات متجرك الحالية ولا يمكن التراجع.</b></p>

          <form action={storeBackupNowAction}>
            <Button size="sm" className="gap-1.5"><DatabaseBackup className="h-4 w-4" /> أخذ نسخة الآن</Button>
          </form>

          {backups.length > 0 ? (
            <ul className="space-y-2">
              {backups.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-2.5 text-sm">
                  <span className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${b.kind === 'manual' ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}`}>{b.kind === 'manual' ? 'يدوية' : 'تلقائية'}</span>
                    <span className="text-xs text-muted-foreground">{b.at ? fmtDate(b.at) : ''}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <a href={`/store/backup/download/${b.id}`} className="rounded-lg border px-2.5 py-1 text-xs font-bold text-primary hover:bg-secondary">تنزيل</a>
                    <form action={storeRestoreAction}>
                      <input type="hidden" name="id" value={b.id} />
                      <button className="rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-amber-700">استعادة</button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">لا توجد نسخ محفوظة بعد.</p>
          )}

          <div className="border-t pt-3">
            <div className="mb-1 text-xs font-bold text-muted-foreground">استعادة من ملف نسخة احتياطية</div>
            <form action={storeRestoreFileAction} className="flex flex-wrap items-center gap-2">
              <input type="file" name="file" accept="application/json,.json" required className="min-w-0 flex-1 text-xs" />
              <button className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700">استعادة من الملف</button>
            </form>
          </div>
        </div>
      )}

      {store && <CopyLink url={`https://${SITE.domain}/companies/${store.id}`} />}

      {/* الرابط المستقل للمتجر — مسار باسم المتجر (يعمل دائماً، بلا حاجة لإعداد نطاق) */}
      {store && meta?.handle && (
        <div className="card-3d space-y-2 rounded-2xl p-4">
          <div className="flex items-center gap-2 font-bold text-primary"><Globe className="h-5 w-5" /> رابط متجرك المستقل</div>
          <CopyLink url={`https://${SITE.domain}/companies/${meta.handle}`} label="رابط باسم متجرك" />
          <p className="text-xs text-muted-foreground">رابط جميل باسم متجرك يعمل فوراً — شاركه بدل الرقمي.</p>
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
