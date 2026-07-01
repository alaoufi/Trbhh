import { getCategories } from '@/lib/data';
import { CategoryGrid } from '@/components/category-grid';

export const revalidate = 300;
export const metadata = { title: 'جميع الأقسام' };

export default async function CategoriesPage() {
  const categories = await getCategories();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">جميع الأقسام</h1>
      <CategoryGrid categories={categories} />
    </div>
  );
}
