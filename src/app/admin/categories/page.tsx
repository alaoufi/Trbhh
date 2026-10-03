import {requireAction} from '@/lib/roles';
import {CategoryAdminNavigation} from '@/components/category-admin-navigation';
export default async function CategoriesPage(){
  await requireAction('categories','view');
  return <div dir="rtl" className="min-w-0 space-y-4"><h1 className="text-xl font-bold">الأقسام وإدارتها</h1><p className="text-sm text-muted-foreground">اختر المهمة المطلوبة. لكل مهمة صفحة مستقلة مناسبة للجوال.</p><CategoryAdminNavigation home/></div>;
}
