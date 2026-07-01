import Link from 'next/link';
import { Search, SlidersHorizontal, Menu, LogIn, Shield } from 'lucide-react';
import { SITE } from '@/lib/constants';
import { getSession } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';

export async function Header() {
  const session = await getSession();
  const admin = session ? await isAdmin(session.uid) : false;
  return (
    <header className="sticky top-0 z-40 border-b border-primary/15 bg-accent/70 backdrop-blur">
      <div className="container flex h-16 items-center gap-2">
        <Link href="/" className="shrink-0">
          <span className="grid h-11 w-11 place-items-center rounded-full border-2 border-primary bg-white text-lg font-extrabold text-primary">
            ت
          </span>
        </Link>

        <form action="/search" className="relative flex-1">
          <input
            name="q"
            placeholder="أبحث هنا"
            className="h-11 w-full rounded-full border border-primary/40 bg-white pr-4 pl-20 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
          <div className="absolute left-2 top-1/2 flex -translate-y-1/2 items-center gap-2 text-primary">
            <button type="submit" aria-label="بحث"><Search className="h-5 w-5" /></button>
            <Link href="/search" aria-label="بحث متقدم"><SlidersHorizontal className="h-5 w-5" /></Link>
          </div>
        </form>

        {admin && (
          <Link href="/admin" aria-label="الإدارة" className="hidden text-primary sm:block">
            <Shield className="h-6 w-6" />
          </Link>
        )}
        {session ? (
          <Link href="/account" aria-label="حسابي" className="text-primary">
            <Menu className="h-7 w-7" />
          </Link>
        ) : (
          <Link href="/login" className="flex items-center gap-1 rounded-full border border-primary/40 px-3 py-1.5 text-sm text-primary">
            <LogIn className="h-4 w-4" /> دخول
          </Link>
        )}
      </div>
    </header>
  );
}
