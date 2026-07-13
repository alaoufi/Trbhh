import { Trash2, Save, ChevronUp, ChevronDown } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { toInt } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { requirePerm } from '@/lib/roles';
import { addCategoryAction, toggleCategoryAction, updateCategoryAction, deleteCategoryAction, moveCategoryAction } from '../actions';
import { ConfirmSubmit } from '@/components/confirm-submit';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'إدارة الأقسام' };

export default async function AdminCategories() {
  const catsOnNow = await import('@/lib/settings').then((x) => x.categoriesEnabled()).catch(() => true);
  await requirePerm('categories');
  const cats = await prisma.categories.findMany({ orderBy: [{ ordered: 'desc' }, { id: 'desc' }] });
  const field = 'h-9 rounded-lg border bg-background px-2 text-sm';

  return (
    <div className="space-y-4">
      {!catsOnNow && <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">⚠ الأقسام مخفية حالياً من كل الموقع (من الإعدادات ← «إظهار الأقسام في الموقع») — إدارتها هنا تبقى متاحة، والإعلانات الجديدة تُسند داخلياً لقسم «عروض أخرى»، وإعادة الإظهار تعيد كل شيء لمكانه.</div>}
      <h1 className="text-xl font-bold text-primary">الأقسام</h1>

      <form action={addCategoryAction} className="flex flex-wrap items-center gap-2 card-3d rounded-xl p-3">
        <input name="name" required placeholder="اسم قسم جديد" className={`${field} flex-1`} />
        <input name="ordered" type="number" defaultValue={0} title="الترتيب (الأكبر يظهر أولاً)" className={`${field} w-20`} />
        <Button size="sm">إضافة</Button>
      </form>

      <p className="text-xs font-bold text-muted-foreground">الترتيب: الرقم الأكبر يظهر أولاً. «موقوف» يختفي من الموقع خلال ثوانٍ.</p>

      <div className="grid gap-2">
        {cats.map((c, i) => (
          <div key={toInt(c.id)} className="flex flex-wrap items-center gap-2 card-3d rounded-xl p-3">
            <div className="flex flex-col">
              <form action={moveCategoryAction}>
                <input type="hidden" name="catId" value={toInt(c.id)} />
                <input type="hidden" name="dir" value="up" />
                <button disabled={i === 0} className="rounded-md border px-1.5 py-0.5 text-xs hover:bg-secondary disabled:opacity-30" title="تحريك لأعلى"><ChevronUp className="h-4 w-4" /></button>
              </form>
              <form action={moveCategoryAction}>
                <input type="hidden" name="catId" value={toInt(c.id)} />
                <input type="hidden" name="dir" value="down" />
                <button disabled={i === cats.length - 1} className="rounded-md border px-1.5 py-0.5 text-xs hover:bg-secondary disabled:opacity-30" title="تحريك لأسفل"><ChevronDown className="h-4 w-4" /></button>
              </form>
            </div>
            <form action={updateCategoryAction} className="flex flex-1 items-center gap-2">
              <input type="hidden" name="catId" value={toInt(c.id)} />
              <input name="name" defaultValue={c.name} required className={`${field} min-w-0 flex-1`} />
              <button className="flex items-center gap-1 rounded-md border border-primary/30 px-2 py-1.5 text-xs font-bold text-primary hover:bg-accent" title="حفظ التعديل">
                <Save className="h-3.5 w-3.5" /> حفظ
              </button>
            </form>
            <Badge variant={c.is_active === 'yes' ? 'trusted' : 'muted'}>{c.is_active === 'yes' ? 'مفعّل' : 'موقوف'}</Badge>
            <form action={toggleCategoryAction}>
              <input type="hidden" name="catId" value={toInt(c.id)} />
              <ConfirmSubmit msg={c.is_active === 'yes' ? `إيقاف قسم «${c.name}»؟ يختفي من الموقع حتى إعادة تفعيله.` : `تفعيل قسم «${c.name}»؟`} className="rounded-md border px-2 py-1.5 text-xs font-bold hover:bg-secondary">{c.is_active === 'yes' ? 'إيقاف' : 'تفعيل'}</ConfirmSubmit>
            </form>
            <form action={deleteCategoryAction}>
              <input type="hidden" name="catId" value={toInt(c.id)} />
              <ConfirmSubmit msg={`حذف قسم «${c.name}» نهائياً؟ لا يمكن التراجع.`} title="حذف القسم" className="flex items-center gap-1 rounded-md border border-destructive/30 px-2 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/10">
                <Trash2 className="h-3.5 w-3.5" />
              </ConfirmSubmit>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
