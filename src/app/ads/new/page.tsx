import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getCategories, getSubCategories, getCountries, getCities } from '@/lib/data';
import { AdForm } from '@/components/ad-form';
import { createAdAction } from '../actions';

export const metadata = { title: 'أضف إعلان' };

export default async function NewAdPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const [categories, subcategories, countries, cities] = await Promise.all([
    getCategories(), getSubCategories(), getCountries(), getCities(),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">أضف إعلاناً جديداً</h1>
      <AdForm
        action={createAdAction}
        categories={categories}
        subcategories={subcategories}
        countries={countries}
        cities={cities}
        submitLabel="نشر الإعلان"
      />
    </div>
  );
}
