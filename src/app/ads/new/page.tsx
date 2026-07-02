import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCategories, getSubCategories, getCountries, getCities } from '@/lib/data';
import { AdForm } from '@/components/ad-form';
import { createAdAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'أضف إعلان' };

export default async function NewAdPage({ searchParams }: { searchParams: Promise<{ error?: string; left?: string; max?: string; hours?: string; wait?: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const { error, left, max, hours, wait } = await searchParams;
  const [categories, subcategories, countries, cities, user] = await Promise.all([
    getCategories(), getSubCategories(), getCountries(), getCities(),
    prisma.users.findUnique({ where: { id: BigInt(session.uid) }, select: { phoneNumber: true, phone_whatsapp: true } }),
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
        initial={{ phone: user?.phoneNumber ?? '', whatsapp: user?.phone_whatsapp ?? '' }}
        submitLabel="نشر الإعلان"
        error={error}
        dupLeft={left}
        limitMax={max}
        gapHours={hours}
        gapWait={wait}
      />
    </div>
  );
}
