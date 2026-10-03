import {requireAction} from '@/lib/roles';
import {CategoryAdminNavigation} from '@/components/category-admin-navigation';
export default async function CategoriesPage(){
  await requireAction('categories','view');
  return <div dir="rtl" className="min-w-0 space-y-4"><h1 className="text-xl font-bold">الأقسام وحقولها</h1><p className="text-sm text-muted-foreground">افتح «الأقسام وحقولها» من القائمة واختر المهمة مباشرة، أو استخدم الاختصارات التالية.</p><CategoryAdminNavigation home/></div>;
}
