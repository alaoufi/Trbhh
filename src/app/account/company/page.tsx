import Image from 'next/image';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getStoreByUser } from '@/lib/stores';
import { getStoreMeta, followersCount, getStoreRating } from '@/lib/merchant';
import { mediaUrl } from '@/lib/media';
import { prisma } from '@/lib/prisma';
import { toInt } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { saveCompanyAction, addBranchAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'شركتي' };

export default async function ManageCompanyPage() {
  const session = await requireUser();
  const store = await getStoreByUser(session.uid);
  const branches = store ? await prisma.store_branches.findMany({ where: { store_id: store.id } }) : [];
  const logoUrl = store?.logo ? mediaUrl((await prisma.uploads.findUnique({ where: { id: BigInt(store.logo) } }))?.file_name) : null;
  const meta = store ? await getStoreMeta(store.id) : null;
  const stats = store
    ? { followers: await followersCount(store.id), rating: await getStoreRating(store.id), ads: await prisma.ads.count({ where: { user_id: BigInt(session.uid), status: 1 } }) }
    : null;
  const en = (n: number) => new Intl.NumberFormat('en-US').format(n);
  const field = 'h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring';
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">متجري</h1>
        {store && <Link href={`/companies/${store.id}`} className="text-sm text-primary hover:underline">عرض صفحة المتجر</Link>}
      </div>

      {store && meta && (
        <div className={`card-3d rounded-xl p-3 text-sm font-bold ${meta.status === 1 ? 'text-emerald-700' : meta.status === 0 ? 'text-amber-700' : 'text-red-700'}`}>
          {meta.status === 1 ? '✓ متجرك مُعتمَد وظاهر للجميع.' : meta.status === 0 ? '⏳ متجرك بانتظار موافقة الإدارة قبل الظهور.' : '⛔ متجرك موقوف. تواصل مع الإدارة.'}
        </div>
      )}

      {store && stats && (
        <div className="grid grid-cols-3 gap-2">
          {[{ l: 'متابعون', v: en(stats.followers) }, { l: 'التقييم', v: stats.rating.count ? `${stats.rating.avg}★` : '—' }, { l: 'إعلانات نشطة', v: en(stats.ads) }].map((s) => (
            <div key={s.l} className="card-3d flex flex-col items-center gap-0.5 rounded-xl p-3 text-center">
              <div className="text-lg font-bold text-primary">{s.v}</div><div className="text-[11px] text-muted-foreground">{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {store && (
        <div className="card-3d flex items-center justify-between gap-2 rounded-xl p-3 text-sm">
          <span className="min-w-0 truncate text-muted-foreground" dir="ltr">/companies/{store.id}</span>
          <span className="shrink-0 font-bold text-primary">رابط متجرك الخاص</span>
        </div>
      )}

      <form action={saveCompanyAction} className="max-w-lg space-y-4 card-3d rounded-xl p-5">
        {logoUrl && <div className="relative h-16 w-16 overflow-hidden rounded-lg bg-muted"><Image src={logoUrl} alt="logo" fill sizes="64px" className="object-cover" /></div>}
        <div><label className="mb-1 block text-sm font-medium">اسم المتجر</label><input name="storeName" defaultValue={meta?.storeName ?? ''} className={field} placeholder="اسم متجرك التجاري" /></div>
        <div>
          <label className="mb-1 block text-sm font-medium">لون هوية المتجر</label>
          <input name="color" type="color" defaultValue={meta?.color ?? '#3287da'} className="h-11 w-20 cursor-pointer rounded-lg border bg-background p-1" />
          <span className="mr-2 text-xs text-muted-foreground">يظهر في رأس متجرك وأزراره.</span>
        </div>
        <div><label className="mb-1 block text-sm font-medium">شعار المتجر</label><input name="logo" type="file" accept="image/*" className="w-full rounded-lg border bg-background p-2 text-sm" /></div>
        <div><label className="mb-1 block text-sm font-medium">نبذة عن المتجر</label><textarea name="about" defaultValue={meta?.about ?? ''} rows={3} className="w-full rounded-lg border bg-background p-3 text-sm" placeholder="تعريف مختصر جذّاب بمتجرك" /></div>
        <div><label className="mb-1 block text-sm font-medium">وصف النشاط / ملف الأعمال</label><textarea name="description" defaultValue={store?.description ?? ''} rows={4} className="w-full rounded-lg border bg-background p-3 text-sm" placeholder="نبذة عن نشاط المتجر والخدمات المقدمة" /></div>
        <div><label className="mb-1 block text-sm font-medium">العنوان</label><input name="address" defaultValue={store?.address ?? ''} className={field} /></div>
        <Button>{store ? 'حفظ' : 'إنشاء المتجر'}</Button>
      </form>

      {store && (
        <div className="max-w-lg space-y-3 card-3d rounded-xl p-5">
          <h2 className="font-bold">الفروع</h2>
          <ul className="space-y-1 text-sm">
            {branches.map((b) => <li key={toInt(b.id)}>• {b.name} {b.address && <span className="text-muted-foreground">— {b.address}</span>}</li>)}
            {branches.length === 0 && <li className="text-muted-foreground">لا توجد فروع بعد.</li>}
          </ul>
          <form action={addBranchAction} className="flex flex-wrap gap-2">
            <input name="name" required placeholder="اسم الفرع" className="h-10 flex-1 rounded-lg border bg-background px-3 text-sm" />
            <input name="address" placeholder="العنوان" className="h-10 flex-1 rounded-lg border bg-background px-3 text-sm" />
            <Button size="sm">إضافة فرع</Button>
          </form>
        </div>
      )}
    </div>
  );
}
