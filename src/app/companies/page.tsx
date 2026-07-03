import Link from 'next/link';
import Image from 'next/image';
import { BadgeCheck, Store, MapPin } from 'lucide-react';
import { getStores } from '@/lib/stores';
import { approvedStoreIds } from '@/lib/merchant';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'المتاجر' };

export default async function CompaniesPage() {
  const [all, approved] = await Promise.all([getStores(), approvedStoreIds()]);
  const stores = all.filter((s) => approved.has(s.id));
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><Store className="h-6 w-6 text-primary" /><h1 className="text-xl font-bold">المتاجر</h1></div>
        <Link href="/account/company" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white">افتح متجرك</Link>
      </div>
      {stores.length === 0 && <p className="py-8 text-center text-muted-foreground">لا توجد متاجر معتمدة بعد. <Link href="/account/company" className="text-primary hover:underline">افتح متجرك الآن</Link></p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stores.map((s) => (
          <Link key={s.id} href={`/companies/${s.id}`} className="flex items-center gap-3 card-3d rounded-xl p-4 hover:border-primary">
            <div className="relative h-14 w-14 overflow-hidden rounded-lg bg-muted"><Image src={s.logo} alt={s.name} fill sizes="56px" className="object-cover" /></div>
            <div className="min-w-0">
              <div className="flex items-center gap-1 font-semibold">{s.name}{s.trusted && <BadgeCheck className="h-4 w-4 text-primary" />}</div>
              {s.address && <div className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{s.address}</div>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
