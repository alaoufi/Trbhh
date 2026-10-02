import type { Metadata } from 'next';
import Link from 'next/link';
import { Home, Search } from 'lucide-react';

export const metadata: Metadata = {
  title: 'الصفحة غير موجودة',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[55vh] max-w-2xl items-center justify-center px-4 py-10 text-center" aria-labelledby="not-found-title">
      <div className="w-full rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-10">
        <p className="text-5xl font-black text-primary/25" aria-hidden="true">404</p>
        <h1 id="not-found-title" className="mt-3 text-2xl font-extrabold text-primary">الصفحة غير موجودة</h1>
        <p className="mt-2 text-sm text-muted-foreground">قد يكون الرابط تغيّر أو أن الصفحة لم تعد متاحة.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground">
            <Home className="h-4 w-4" /> العودة للرئيسية
          </Link>
          <Link href="/search" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 py-2 font-bold text-foreground hover:bg-accent">
            <Search className="h-4 w-4" /> البحث في الإعلانات
          </Link>
        </div>
      </div>
    </main>
  );
}
