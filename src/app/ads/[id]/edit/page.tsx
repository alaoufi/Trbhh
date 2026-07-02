import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getCategories, getSubCategories, getCountries, getCities, getAreas, getAdForEdit } from '@/lib/data';
import { AdForm } from '@/components/ad-form';
import { updateAdAction } from '../../actions';

export const metadata = { title: 'تعديل الإعلان' };

export default async function EditAdPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; hours?: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const { id } = await params;
  const { error, hours } = await searchParams;
  const [initial, categories, subcategories, countries, cities, areas] = await Promise.all([
    getAdForEdit(Number(id), session.uid),
    getCategories(), getSubCategories(), getCountries(), getCities(), getAreas(),
  ]);
  if (!initial) notFound();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">تعديل الإعلان</h1>
      <AdForm
        action={updateAdAction}
        categories={categories}
        subcategories={subcategories}
        countries={countries}
        cities={cities}
        areas={areas}
        initial={initial}
        submitLabel="حفظ التعديلات"
        error={error}
        gapHours={hours}
      />
    </div>
  );
}
