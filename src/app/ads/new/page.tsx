import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCategories, getSubCategories, getCountries, getCities, getAreas } from '@/lib/data';
import { AdForm } from '@/components/ad-form';
import { getSettingBool, SETTING_ADS_APPROVAL } from '@/lib/settings';
import { createAdAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'أضف إعلان' };

export default async function NewAdPage({ searchParams }: { searchParams: Promise<{ error?: string; left?: string; max?: string; hours?: string; wait?: string; cat?: string; banned?: string; dup?: string; price?: string; bal?: string; dest?: string }> }) {
  const allowSchedule = (await getSettingBool('schedule_on', false).catch(() => false)) && !(await getSettingBool(SETTING_ADS_APPROVAL, false).catch(() => false));
  const [dealsOn, stockOn] = await Promise.all([
    import('@/lib/store-extras').then((m) => m.dealsEnabled()).catch(() => false),
    import('@/lib/store-extras').then((m) => m.stockEnabled()).catch(() => false),
  ]);
  // شارة عاجل — عرض تسويقي داخل نموذج النشر (لإعلانات تربح فقط)
  const extras = await import('@/lib/settings').then((m) => m.getAdExtras()).catch(() => null);
  const session = await getSession();
  if (!session) redirect('/login');
  const { error, left, max, hours, wait, cat, banned, dup, price, bal, dest } = await searchParams;
  const [categories, subcategories, countries, cities, areas, user] = await Promise.all([
    getCategories(), getSubCategories(), getCountries(), getCities(), getAreas(),
    prisma.users.findUnique({ where: { id: BigInt(session.uid) }, select: { phoneNumber: true, phone_whatsapp: true } }),
  ]);
  const balance = await import('@/lib/wallet').then((m) => m.getBalance(session.uid)).catch(() => 0);
  const urgentOffer = extras && extras.urgentPrice > 0 && dest !== 'store'
    ? { price: extras.urgentPrice, hours: extras.urgentHours, balance }
    : undefined;
  // التمييز ⭐ — عرض المدد المسعّرة داخل نموذج النشر (لإعلانات تربح فقط)
  const { getServicePricing, DURATIONS } = await import('@/lib/settings');
  const svc = await getServicePricing().catch(() => null);
  const featuredOpts = svc && dest !== 'store'
    ? DURATIONS.map((d) => ({ key: d.key, label: d.label, price: svc.featured[d.key] })).filter((o) => o.price > 0)
    : [];
  const featuredOffer = featuredOpts.length ? { options: featuredOpts, balance } : undefined;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-primary">أضف إعلاناً جديداً</h1>
      <AdForm
        allowSchedule={allowSchedule}
        allowOldPrice={dealsOn}
        allowStock={stockOn && dest === 'store'}
        urgentOffer={urgentOffer}
        featuredOffer={featuredOffer}
        action={createAdAction}
        categories={categories}
        subcategories={subcategories}
        countries={countries}
        cities={cities}
        areas={areas}
        initial={{ phone: user?.phoneNumber ?? '', whatsapp: user?.phone_whatsapp ?? '' }}
        submitLabel="نشر الإعلان"
        error={error}
        dupLeft={left}
        dupId={dup}
        needPrice={price}
        needBal={bal}
        dest={dest === 'store' ? 'store' : undefined}
        limitMax={max}
        gapHours={hours}
        gapWait={wait}
        blockCat={cat}
        banned={banned === '1'}
      />
    </div>
  );
}
