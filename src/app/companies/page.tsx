import Link from 'next/link';
import Image from 'next/image';
import { BadgeCheck, Store, MapPin } from 'lucide-react';
import { getStores } from '@/lib/stores';
import { approvedStoreIds } from '@/lib/merchant';
import { getEmptyText } from '@/lib/settings';
import { Breadcrumb } from '@/components/breadcrumb';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'المكاتب العقارية' };

export default async function CompaniesPage() {
  const [all, approved] = await Promise.all([getStores(), approvedStoreIds()]);
  const stores = all.filter((s) => approved.has(s.id));
  const emptyStores = await getEmptyText('stores').catch(() => 'لا توجد متاجر معتمدة بعد.');
  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: 'المكاتب العقارية' }]} />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><Store className="h-6 w-6 text-primary" /><h1 className="text-xl font-bold">المكاتب العقارية</h1></div>
        <Link href="/account/company" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white">افتح مكتبك العقاري</Link>
      </div>
      {stores.length === 0 && <p className="py-8 text-center text-muted-foreground">{emptyStores} <Link href="/account/company" className="text-primary hover:underline">افتح مكتبك العقاري الآن</Link></p>}
      {/* شبكة مضغوطة متقاربة بارتفاع قليل */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {stores.map((s) => (
          <Link key={s.id} href={`/companies/${s.id}`} className="flex items-center gap-2 card-3d rounded-xl p-2.5 hover:border-primary">
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted"><Image src={s.logo} alt={s.name} fill sizes="40px" className="object-cover" /></div>
            <div className="min-w-0">
              <div className="flex items-center gap-1 truncate text-sm font-semibold leading-5">{s.name}{s.trusted && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" />}</div>
              {s.address && <div className="flex items-center gap-1 truncate text-[10px] leading-4 text-muted-foreground"><MapPin className="h-2.5 w-2.5 shrink-0" />{s.address}</div>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
