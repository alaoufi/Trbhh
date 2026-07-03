import { Trash2, Save } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { toInt } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { requirePerm } from '@/lib/roles';
import { addCategoryAction, toggleCategoryAction, updateCategoryAction, deleteCategoryAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'إدارة الأقسام' };

export default async function AdminCategories() {
  await requirePerm('categories');
  const cats = await prisma.categories.findMany({ orderBy: [{ ordered: 'desc' }, { id: 'desc' }] });
  const field = 'h-9 rounded-lg border bg-background px-2 text-sm';

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-primary">الأقسام</h1>

      <form action={addCategoryAction} className="flex flex-wrap items-center gap-2 card-3d rounded-xl p-3">
        <input name="name" required placeholder="اسم قسم جديد" className={`${field} flex-1`} />
        <input name="ordered" type="number" defaultValue={0} title="الترتيب (الأكبر يظهر أولاً)" className={`${field} w-20`} />
        <Button size="sm">إضافة</Button>
      </form>

      <p className="text-xs font-bold text-muted-foreground">الترتيب: الرقم الأكبر يظهر أولاً. «موقوف» يختفي من الموقع خلال ثوانٍ.</p>

      <div className="grid gap-2">
        {cats.map((c) => (
          <div key={toInt(c.id)} className="flex flex-wrap items-center gap-2 card-3d rounded-xl p-3">
            <form action={updateCategoryAction} className="flex flex-1 items-center gap-2">
              <input type="hidden" name="catId" value={toInt(c.id)} />
              <input name="name" defaultValue={c.name} required className={`${field} min-w-0 flex-1`} />
              <input name="ordered" type="number" defaultValue={c.ordered} title="الترتيب" className={`${field} w-16`} />
              <button className="flex items-center gap-1 rounded-md border border-primary/30 px-2 py-1.5 text-xs font-bold text-primary hover:bg-accent" title="حفظ التعديل">
                <Save className="h-3.5 w-3.5" /> حفظ
              </button>
            </form>
            <Badge variant={c.is_active === 'yes' ? 'trusted' : 'muted'}>{c.is_active === 'yes' ? 'مفعّل' : 'موقوف'}</Badge>
            <form action={toggleCategoryAction}>
              <input type="hidden" name="catId" value={toInt(c.id)} />
              <button className="rounded-md border px-2 py-1.5 text-xs font-bold hover:bg-secondary">{c.is_active === 'yes' ? 'إيقاف' : 'تفعيل'}</button>
            </form>
            <form action={deleteCategoryAction}>
              <input type="hidden" name="catId" value={toInt(c.id)} />
              <button className="flex items-center gap-1 rounded-md border border-destructive/30 px-2 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/10" title="حذف القسم">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
