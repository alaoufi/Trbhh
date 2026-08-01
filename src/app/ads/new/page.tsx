import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCountries, getCities, getAreas } from '@/lib/data';
import { AdForm } from '@/components/ad-form';
import { getSettingBool, SETTING_ADS_APPROVAL } from '@/lib/settings';
import { createAdAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'أضف إعلان' };

export default async function NewAdPage({ searchParams }: { searchParams: Promise<{ error?: string; left?: string; max?: string; hours?: string; wait?: string; cat?: string; banned?: string; dup?: string; price?: string; bal?: string; dest?: string }> }) {
  const allowSchedule = (await getSettingBool('schedule_on', false).catch(() => false)) && !(await getSettingBool(SETTING_ADS_APPROVAL, false).catch(() => false));
  const scheduleMaxDays = await import('@/lib/settings').then((m) => m.getScheduleMaxDays()).catch(() => 30);
  const [dealsOn, stockOn] = await Promise.all([
    import('@/lib/store-extras').then((m) => m.dealsEnabled()).catch(() => false),
    import('@/lib/store-extras').then((m) => m.stockEnabled()).catch(() => false),
  ]);
  // شارة عاجل — عرض تسويقي داخل نموذج النشر (لإعلانات تربح فقط)
  const extras = await import('@/lib/settings').then((m) => m.getAdExtras()).catch(() => null);
  const session = await getSession();
  if (!session) redirect('/login');
  const { error, left, max, hours, wait, cat, banned, dup, price, bal, dest } = await searchParams;
  // رسالة إيقاف العقار (من الإعدادات) — تُقرأ فقط عند وقوع هذا الخطأ
  const realestateMsg = error === 'realestate'
    ? await import('@/lib/realestate').then((m) => m.realEstateBlockMsg()).catch(() => '')
    : undefined;
  // الهوية الفعّالة الحالية (نفس مصدر createAdAction) — لعرضها صريحةً وتحديد المجال افتراضياً
  const active = await import('@/lib/profiles').then((m) => m.getActiveProfile(session.uid)).catch(() => null);
  // الوجهة: المعامل الصريح يفصل (store/personal)، وإلا تُشتقّ من مجال الهوية الفعّالة —
  // فما تراه في المبدّل هو ما تنشر فيه فعلاً. استقلالية تامّة: هوية تربح ⇐ تربح، هوية متجر ⇐ متجرها.
  const publishingAsStore = dest === 'store' || (dest !== 'personal' && active?.type === 'store');
  const [countries, cities, areas, user] = await Promise.all([
    getCountries(), getCities(), getAreas(),
    prisma.users.findUnique({ where: { id: BigInt(session.uid) }, select: { phoneNumber: true, phone_whatsapp: true } }),
  ]);
  const balance = await import('@/lib/wallet').then((m) => m.getBalance(session.uid)).catch(() => 0);
  const urgentOffer = extras && extras.urgentPacks.length > 0 && !publishingAsStore
    ? { packs: extras.urgentPacks, balance }
    : undefined;
  // التمييز ⭐ — عرض المدد المسعّرة داخل نموذج النشر (لإعلانات تربح فقط)
  const { getServicePricing, DURATIONS } = await import('@/lib/settings');
  const svc = await getServicePricing().catch(() => null);
  const featuredOpts = svc && !publishingAsStore
    ? DURATIONS.map((d) => ({ key: d.key, label: d.label, price: svc.featured[d.key] })).filter((o) => o.price > 0)
    : [];
  const featuredOffer = featuredOpts.length ? { options: featuredOpts, balance } : undefined;
  // «أنشر باسم…» — إن كان للعضو متجر نشط يختار: باسمه الشخصي أو باسم متجره (عزل الهويات)
  const myStore = await import('@/lib/merchant').then(async (m) => {
    const sid = await m.storeIdOfUser(session.uid).catch(() => 0);
    if (!sid) return null;
    const meta = await m.getStoreMeta(sid).catch(() => null);
    return meta && meta.status === 1 ? { id: sid, name: meta.storeName || 'متجري' } : null;
  }).catch(() => null);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-primary">أضف إعلاناً جديداً</h1>

      {/* بانر صريح: بأي هوية وفي أي مجال يُنشر هذا الإعلان الآن — يقطع أي التباس/تداخل */}
      {active && (
        <div className={`rounded-xl border-2 p-3 text-sm ${publishingAsStore ? 'border-emerald-300 bg-emerald-50' : 'border-sky-300 bg-sky-50'}`}>
          <div className="font-extrabold">
            {publishingAsStore
              ? <>🏬 تنشر الآن داخل متجرك «{myStore?.name || active.name}» فقط</>
              : <>🟢 تنشر الآن في تربح (إعلانات عامة) باسم «{active.name}»</>}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {publishingAsStore
              ? 'الإعلان يظهر لزوّار متجرك فقط، لا في قوائم تربح العامة — مستقلّ تماماً عن هويتك الشخصية.'
              : 'الإعلان يظهر في تربح للجميع باسم هذه الهوية — مستقلّ تماماً عن أي متجر.'}
          </div>
        </div>
      )}

      {/* اختيار الهوية: باسمي الشخصي أو باسم متجري — يمنع تداخل النشر بين الهويات */}
      {myStore && (
        <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-3">
          <div className="mb-2 text-sm font-extrabold text-primary">🎭 أنشر باسم</div>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/ads/new?dest=personal" className={`rounded-xl border-2 px-3 py-2.5 text-center text-sm font-bold ${!publishingAsStore ? 'border-primary bg-primary text-white' : 'border-primary/25 bg-white text-primary'}`}>
              👤 باسمي الشخصي (تربح)
            </Link>
            <Link href="/ads/new?dest=store" className={`rounded-xl border-2 px-3 py-2.5 text-center text-sm font-bold ${publishingAsStore ? 'border-primary bg-primary text-white' : 'border-primary/25 bg-white text-primary'}`}>
              🏬 باسم متجر «{myStore.name}»
            </Link>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {publishingAsStore
              ? 'سيظهر هذا الإعلان لزوّار متجرك باسم متجرك ورقمه — لا باسمك الشخصي.'
              : 'سيظهر هذا الإعلان في تربح باسمك الشخصي. اختر «باسم متجري» لنشره داخل متجرك بهويته.'}
          </p>
        </div>
      )}

      <AdForm
        allowSchedule={allowSchedule}
        scheduleMaxDays={scheduleMaxDays}
        allowOldPrice={dealsOn}
        allowStock={stockOn && publishingAsStore}
        urgentOffer={urgentOffer}
        featuredOffer={featuredOffer}
        action={createAdAction}
        countries={countries}
        cities={cities}
        areas={areas}
        initial={{ phone: user?.phoneNumber ?? '', whatsapp: user?.phone_whatsapp ?? '' }}
        submitLabel="نشر الإعلان"
        error={error}
        realestateMsg={realestateMsg}
        dupLeft={left}
        dupId={dup}
        needPrice={price}
        needBal={bal}
        dest={publishingAsStore ? 'store' : undefined}
        identity={active ? { name: publishingAsStore ? (myStore?.name || active.name) : active.name, isStore: publishingAsStore } : undefined}
        limitMax={max}
        gapHours={hours}
        gapWait={wait}
        blockCat={cat}
        banned={banned === '1'}
      />
    </div>
  );
}
