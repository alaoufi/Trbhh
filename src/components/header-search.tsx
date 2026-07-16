'use client';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, X, SlidersHorizontal } from 'lucide-react';

/**
 * Collapsed search: just a magnifying-glass icon in the header. Tapping it
 * opens a full-width search field overlaid on the header row, freeing the
 * header space for the "open your store" call-to-action.
 */
export function HeaderSearch() {
  const [open, setOpen] = useState(false);
  // داخل لوحة الإدارة يبحث في بيانات الإدارة فقط، وفي الموقع يبحث في الموقع فقط
  const inAdmin = /^\/admin(\/|$)/.test(usePathname() || '');
  const target = inAdmin ? '/admin/search' : '/search';
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="بحث" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[#f0b429] transition hover:bg-white/10">
        <Search className="h-5 w-5" />
      </button>

      {open && (
        <div className="absolute inset-x-0 top-0 z-50 bg-accent/95 backdrop-blur">
          <form action={target} className="container flex h-16 items-center gap-2">
            <button type="button" onClick={() => setOpen(false)} aria-label="إغلاق" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-primary transition hover:bg-primary/10">
              <X className="h-5 w-5" />
            </button>
            <div className="relative flex-1">
              <input ref={ref} name="q" placeholder={inAdmin ? 'ابحث في الإدارة (عضو، إعلان، متجر…)' : 'أبحث هنا'}
                className="h-11 w-full rounded-full border border-primary/40 bg-background pr-4 pl-16 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/40" />
              <div className="absolute left-2 top-1/2 flex -translate-y-1/2 items-center gap-2 text-primary">
                {!inAdmin && <Link href="/search" aria-label="بحث متقدم" onClick={() => setOpen(false)}><SlidersHorizontal className="h-5 w-5" /></Link>}
                <button type="submit" aria-label="بحث"><Search className="h-5 w-5" /></button>
              </div>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
