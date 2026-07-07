import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCategories, getSubCategories, getCountries, getCities, getAreas } from '@/lib/data';
import { AdForm } from '@/components/ad-form';
import { createAdAction } from '../actions';
import { getAdPricing } from '@/lib/settings';
import { getBalance } from '@/lib/wallet';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'أضف إعلان' };

export default async function NewAdPage({ searchParams }: { searchParams: Promise<{ error?: string; left?: string; max?: string; hours?: string; wait?: string; cat?: string; banned?: string; dup?: string; price?: string; bal?: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const { error, left, max, hours, wait, cat, banned, dup, price, bal } = await searchParams;
  const [categories, subcategories, countries, cities, areas, user, adPricing, balance] = await Promise.all([
    getCategories(), getSubCategories(), getCountries(), getCities(), getAreas(),
    prisma.users.findUnique({ where: { id: BigInt(session.uid) }, select: { phoneNumber: true, phone_whatsapp: true } }),
    getAdPricing(), getBalance(session.uid),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-primary">أضف إعلاناً جديداً</h1>
      <AdForm
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
        durations={adPricing.enabled ? { w2: adPricing.w2, m1: adPricing.m1, m3: adPricing.m3 } : null}
        balance={balance}
        limitMax={max}
        gapHours={hours}
        gapWait={wait}
        blockCat={cat}
        banned={banned === '1'}
      />
    </div>
  );
}
