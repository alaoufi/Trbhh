import { Crown, Trash2, Star } from 'lucide-react';
import { requirePerm } from '@/lib/roles';
import { getPackages, type Package } from '@/lib/packages';
import { Button } from '@/components/ui/button';
import { createPackageAction, updatePackageAction, deletePackageAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'الباقات' };

const inputCls = 'h-9 w-full rounded-lg border border-primary/30 bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-primary/40';
const labelCls = 'text-[11px] font-medium text-muted-foreground';

function Field({ label, name, defaultValue, type = 'number', min = 0, placeholder }: { label: string; name: string; defaultValue?: string | number; type?: string; min?: number; placeholder?: string }) {
  return (
    <label className="block space-y-0.5">
      <span className={labelCls}>{label}</span>
      <input name={name} type={type} min={type === 'number' ? min : undefined} step={name === 'price' ? '0.01' : undefined} defaultValue={defaultValue} placeholder={placeholder} className={inputCls} />
    </label>
  );
}

function TierSelect({ value }: { value?: string }) {
  return (
    <label className="block space-y-0.5">
      <span className={labelCls}>باقة تميز</span>
      <select name="tier" defaultValue={value ?? ''} className={inputCls}>
        <option value="">لا</option>
        <option value="gold">ذهبي</option>
        <option value="silver">فضي</option>
      </select>
    </label>
  );
}

function PackageFields({ p }: { p?: Package }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="اسم الباقة" name="name" type="text" defaultValue={p?.name} placeholder="مثال: الذهبية" />
        <Field label="السعر (0 = مجانية)" name="price" defaultValue={p?.price} />
        <Field label="إعلانات/اليوم (0 = بلا حد)" name="adsPerDay" defaultValue={p?.adsPerDay} />
        <Field label="فارق بالساعات (0 = بلا)" name="gapHours" defaultValue={p?.gapHours} />
        <Field label="عدد إعلانات التميز بالأعلى" name="featuredSlots" defaultValue={p?.featuredSlots} />
        <Field label="أيام البقاء بالأعلى" name="featuredDays" defaultValue={p?.featuredDays} />
        <TierSelect value={p?.tier} />
        <Field label="الترتيب" name="sort" defaultValue={p?.sort} />
      </div>
      <div className="flex flex-wrap items-center gap-4 pt-1">
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="isDefault" defaultChecked={p?.isDefault} /> الباقة الافتراضية للأعضاء</label>
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="active" defaultChecked={p ? p.active : true} /> مُفعّلة</label>
      </div>
    </>
  );
}

export default async function AdminPackages() {
  await requirePerm('packages');
  const packages = await getPackages();
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Crown className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-primary">الباقات ({packages.length})</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        حدّد لكل باقة: السعر (اكتب 0 لتظهر «مجانية»)، عدد الإعلانات المسموح بها يومياً، الفارق الزمني بالساعات بين إعلان وآخر،
        وباقات التميز (كم إعلاناً يُثبّت بالأعلى وكم يوماً يبقى، ذهبي أو فضي).
      </p>

      {/* new package */}
      <form action={createPackageAction} className="space-y-2 rounded-xl border border-primary/20 bg-card p-3">
        <div className="text-sm font-bold text-primary">➕ باقة جديدة</div>
        <PackageFields />
        <Button>إضافة الباقة</Button>
      </form>

      {/* existing packages */}
      <div className="space-y-3">
        {packages.map((p) => (
          <form key={p.id} action={updatePackageAction} className="space-y-2 rounded-xl border border-primary/20 bg-white p-3">
            <input type="hidden" name="id" value={p.id} />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold">
                {p.tier === 'gold' && <Star className="h-4 w-4 fill-amber-400 text-amber-400" />}
                {p.tier === 'silver' && <Star className="h-4 w-4 fill-slate-400 text-slate-400" />}
                {p.name}
                <span className="text-xs font-normal text-muted-foreground">{p.price === 0 ? 'مجانية' : `${p.price} ﷼`}</span>
                {!p.active && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">موقوفة</span>}
                {p.isDefault && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">افتراضية</span>}
              </div>
            </div>
            <PackageFields p={p} />
            <div className="flex items-center gap-2">
              <Button size="sm">حفظ</Button>
              <button formAction={deletePackageAction} className="flex items-center gap-1 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10">
                <Trash2 className="h-3.5 w-3.5" /> حذف
              </button>
            </div>
          </form>
        ))}
        {packages.length === 0 && <p className="py-6 text-center text-muted-foreground">لا توجد باقات بعد — أضِف أول باقة بالأعلى.</p>}
      </div>
    </div>
  );
}
