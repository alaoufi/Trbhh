import Link from 'next/link';
import Image from 'next/image';
import { Store } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { hasAnyAdmin } from '@/lib/roles';
import { getCategories } from '@/lib/data';
import { storeIdOfUser } from '@/lib/merchant';
import { SiteMenu } from '@/components/site-menu';
import { HeaderSearch } from '@/components/header-search';

export async function Header() {
  const session = await getSession();
  const admin = session ? await hasAnyAdmin(session.uid) : false;
  const categories = await getCategories();
  const myStoreId = session ? await storeIdOfUser(session.uid).catch(() => 0) : 0;
  return (
    <header className="sticky top-0 z-40 border-b border-primary/15 bg-accent/70 backdrop-blur">
      <div className="container relative flex h-16 items-center gap-2">
        {/* hamburger on the right (RTL: first child) */}
        <SiteMenu isAuthed={!!session} isAdmin={admin} categories={categories} />

        {/* دعوة فتح المتجر تشغل مساحة البحث بعد تصغيره لعدسة */}
        <Link
          href={myStoreId > 0 ? `/companies/${myStoreId}` : '/account/company'}
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-l from-primary to-primary/80 px-4 text-sm font-bold text-white shadow-sm transition hover:opacity-95"
        >
          <Store className="h-5 w-5" /> {myStoreId > 0 ? 'رابط المتجر' : 'افتح متجرك'}
        </Link>

        {/* بحث مصغّر: عدسة تفتح حقل البحث */}
        <HeaderSearch />

        {/* logo on the left (RTL: last child) */}
        <Link href="/" className="shrink-0">
          <Image src="/logo-icon.png" alt="تربح" width={44} height={44} priority className="h-11 w-11 rounded-lg object-contain" />
        </Link>
      </div>
    </header>
  );
}
