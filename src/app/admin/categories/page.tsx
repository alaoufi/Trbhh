import { prisma } from '@/lib/prisma';
import { toInt } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { requirePerm } from '@/lib/roles';
import { addCategoryAction, toggleCategoryAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'إدارة الأقسام' };

export default async function AdminCategories() {
  await requirePerm('categories');
  const cats = await prisma.categories.findMany({ orderBy: { ordered: 'desc' } });
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-primary">الأقسام</h1>
      <form action={addCategoryAction} className="flex gap-2">
        <input name="name" required placeholder="اسم قسم جديد" className="h-10 flex-1 rounded-lg border bg-background px-3 text-sm" />
        <Button size="sm">إضافة</Button>
      </form>
      <div className="grid gap-2 sm:grid-cols-2">
        {cats.map((c) => (
          <div key={toInt(c.id)} className="flex items-center justify-between card-3d rounded-xl p-3">
            <span className="font-medium">{c.name}</span>
            <div className="flex items-center gap-2">
              <Badge variant={c.is_active === 'yes' ? 'trusted' : 'muted'}>{c.is_active === 'yes' ? 'مفعّل' : 'موقوف'}</Badge>
              <form action={toggleCategoryAction}><input type="hidden" name="catId" value={toInt(c.id)} /><button className="rounded-md border px-2 py-1 text-xs hover:bg-secondary">{c.is_active === 'yes' ? 'إيقاف' : 'تفعيل'}</button></form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
