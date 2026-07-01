import Image from 'next/image';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { getStoreByUser } from '@/lib/stores';
import { mediaUrl } from '@/lib/media';
import { prisma } from '@/lib/prisma';
import { toInt } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { saveCompanyAction, addBranchAction } from './actions';

export const metadata = { title: 'شركتي' };

export default async function ManageCompanyPage() {
  const session = await getSession();
  const store = await getStoreByUser(session!.uid);
  const branches = store ? await prisma.store_branches.findMany({ where: { store_id: store.id } }) : [];
  const logoUrl = store?.logo ? mediaUrl((await prisma.uploads.findUnique({ where: { id: BigInt(store.logo) } }))?.file_name) : null;
  const field = 'h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring';
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">صفحة شركتي</h1>
        {store && <Link href={`/companies/${store.id}`} className="text-sm text-primary hover:underline">عرض الصفحة العامة</Link>}
      </div>

      <form action={saveCompanyAction} className="max-w-lg space-y-4 rounded-xl border bg-card p-5 shadow-sm">
        {logoUrl && <div className="relative h-16 w-16 overflow-hidden rounded-lg bg-muted"><Image src={logoUrl} alt="logo" fill sizes="64px" className="object-cover" /></div>}
        <div><label className="mb-1 block text-sm font-medium">شعار الشركة</label><input name="logo" type="file" accept="image/*" className="w-full rounded-lg border bg-background p-2 text-sm" /></div>
        <div><label className="mb-1 block text-sm font-medium">وصف الشركة / ملف الأعمال</label><textarea name="description" defaultValue={store?.description ?? ''} rows={5} className="w-full rounded-lg border bg-background p-3 text-sm" placeholder="نبذة عن نشاط الشركة والخدمات المقدمة" /></div>
        <div><label className="mb-1 block text-sm font-medium">العنوان</label><input name="address" defaultValue={store?.address ?? ''} className={field} /></div>
        <Button>{store ? 'حفظ' : 'إنشاء صفحة الشركة'}</Button>
      </form>

      {store && (
        <div className="max-w-lg space-y-3 rounded-xl border bg-card p-5 shadow-sm">
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
