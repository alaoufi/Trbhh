import Link from 'next/link';
import { Search, PlusCircle, LogIn, LayoutGrid } from 'lucide-react';
import { SITE } from '@/lib/constants';
import { getSession } from '@/lib/auth';
import { Button } from '@/components/ui/button';

export async function Header() {
  const session = await getSession();
  return (
    <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="container flex h-16 items-center gap-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">
            ت
          </span>
          <span className="text-xl font-bold text-foreground">{SITE.name}</span>
        </Link>

        <form action="/search" className="relative mx-auto hidden w-full max-w-xl md:block">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            placeholder="ابحث عن خدمة، معدة، مورد..."
            className="h-10 w-full rounded-lg border bg-background pr-10 pl-4 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </form>

        <nav className="mr-auto flex items-center gap-2">
          <Link href="/categories" className="hidden md:block">
            <Button variant="ghost" size="sm"><LayoutGrid className="h-4 w-4" /> الأقسام</Button>
          </Link>
          {session ? (
            <Link href="/account">
              <Button variant="outline" size="sm">{session.name || 'حسابي'}</Button>
            </Link>
          ) : (
            <Link href="/login">
              <Button variant="outline" size="sm"><LogIn className="h-4 w-4" /> دخول</Button>
            </Link>
          )}
          <Link href="/ads/new" className="hidden sm:block">
            <Button size="sm"><PlusCircle className="h-4 w-4" /> أضف إعلان</Button>
          </Link>
        </nav>
      </div>
    </header>
  );
}
