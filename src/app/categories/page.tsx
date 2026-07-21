import { redirect } from 'next/navigation';
import { getCategories } from '@/lib/data';
import { CategoryGrid } from '@/components/category-grid';
import { Breadcrumb } from '@/components/breadcrumb';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'جميع الأقسام' };

export default async function CategoriesPage() {
  // الأقسام مخفية من التحكم — الصفحة تعود للرئيسية
  if (!(await import('@/lib/settings').then((x) => x.categoriesEnabled()).catch(() => false))) redirect('/');
  const categories = await getCategories();
  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: 'جميع الأقسام' }]} />
      <h1 className="text-xl font-bold">جميع الأقسام</h1>
      <CategoryGrid categories={categories} />
    </div>
  );
}
