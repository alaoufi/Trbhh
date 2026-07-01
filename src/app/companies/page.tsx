import Link from 'next/link';
import Image from 'next/image';
import { BadgeCheck, Building2, MapPin } from 'lucide-react';
import { getStores } from '@/lib/stores';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'الشركات' };

export default async function CompaniesPage() {
  const stores = await getStores();
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><Building2 className="h-6 w-6 text-primary" /><h1 className="text-xl font-bold">الشركات والمتاجر</h1></div>
      {stores.length === 0 && <p className="py-8 text-center text-muted-foreground">لا توجد شركات مسجّلة بعد. <Link href="/account/company" className="text-primary hover:underline">أنشئ صفحة شركتك</Link></p>}
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
