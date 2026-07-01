import { redirect } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { getCategories, getSubCategories, getCountries, getCities } from '@/lib/data';
import { AdForm } from '@/components/ad-form';
import { createAdAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'أضف إعلان' };

export default async function NewAdPage({ searchParams }: { searchParams: Promise<{ dup?: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const sp = await searchParams;
  const [categories, subcategories, countries, cities] = await Promise.all([
    getCategories(), getSubCategories(), getCountries(), getCities(),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-primary">أضف إعلاناً جديداً</h1>
      {sp.dup === '1' && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>لديك إعلان مشابه منشور بالفعل. عدّل بياناته أو احذفه بدل تكراره — لتجنّب الإعلانات المكررة.</span>
        </div>
      )}
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
