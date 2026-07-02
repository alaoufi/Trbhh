import Link from 'next/link';
import { Settings2, Trash2, ArrowRight } from 'lucide-react';
import { requirePerm } from '@/lib/roles';
import { getPromoPackages, type PromoPackage } from '@/lib/promos';
import { Button } from '@/components/ui/button';
import { createPromoPackageAction, updatePromoPackageAction, deletePromoPackageAction } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'باقات الإعلانات الترويجية' };

const inputCls = 'h-9 w-full rounded-lg border border-primary/30 bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-primary/40';

function Fields({ p }: { p?: PromoPackage }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <label className="space-y-0.5"><span className="text-[11px] text-muted-foreground">الاسم</span><input name="name" defaultValue={p?.name} placeholder="مثال: أسبوعان" className={inputCls} /></label>
      <label className="space-y-0.5"><span className="text-[11px] text-muted-foreground">المدة (أيام)</span><input name="days" type="number" min={1} defaultValue={p?.days ?? 30} className={inputCls} /></label>
      <label className="space-y-0.5"><span className="text-[11px] text-muted-foreground">السعر</span><input name="price" type="number" min={0} step="0.01" defaultValue={p?.price ?? 0} className={inputCls} /></label>
      <label className="space-y-0.5"><span className="text-[11px] text-muted-foreground">الترتيب</span><input name="sort" type="number" defaultValue={p?.sort ?? 0} className={inputCls} /></label>
    </div>
  );
}

export default async function PromoPackagesPage() {
  await requirePerm('promos');
  const packages = await getPromoPackages();
  return (
    <div className="space-y-5">
      <Link href="/admin/promos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"><ArrowRight className="h-4 w-4" /> الإعلانات الترويجية</Link>
      <div className="flex items-center gap-2">
        <Settings2 className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-primary">باقات المدد والأسعار ({packages.length})</h1>
      </div>
      <p className="text-sm text-muted-foreground">حدّد المدد وأسعارها (مثال: أسبوعان = 14 يوم، شهر = 30، ستة أشهر = 180، سنة = 365). تظهر للمعلن عند تصميم إعلانه، وتبدأ من تاريخ الموافقة.</p>

      <form action={createPromoPackageAction} className="space-y-2 rounded-xl border border-primary/20 bg-card p-3">
        <div className="text-sm font-bold text-primary">➕ باقة مدة جديدة</div>
        <Fields />
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="active" defaultChecked /> مُفعّلة</label>
        <Button>إضافة</Button>
      </form>

      <div className="space-y-3">
        {packages.map((p) => (
          <form key={p.id} action={updatePromoPackageAction} className="space-y-2 rounded-xl border border-primary/20 bg-white p-3">
            <input type="hidden" name="id" value={p.id} />
            <div className="flex items-center justify-between gap-2 text-sm font-bold">
              <span>{p.name} — {p.days} يوم — {p.price === 0 ? 'مجاني' : `${p.price} ﷼`}</span>
              {!p.active && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">موقوفة</span>}
            </div>
            <Fields p={p} />
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="active" defaultChecked={p.active} /> مُفعّلة</label>
            <div className="flex gap-2">
              <Button size="sm">حفظ</Button>
              <button formAction={deletePromoPackageAction} className="flex items-center gap-1 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /> حذف</button>
            </div>
          </form>
        ))}
        {packages.length === 0 && <p className="py-6 text-center text-muted-foreground">لا توجد باقات — أضِف أول باقة بالأعلى.</p>}
      </div>
    </div>
  );
}
