'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Check, LayoutGrid, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

type Cat = { id: number; name: string; icon?: string };

/**
 * A 3D dropdown multi-select for browsing categories on the home page.
 * Pick one or more categories, then "عرض المختار" shows their ads at the top.
 */
export function CategorySelect({ categories, initial = [] }: { categories: Cat[]; initial?: number[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(initial.length > 0);
  const [sel, setSel] = useState<Set<number>>(new Set(initial));

  const toggle = (id: number) =>
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const show = () => {
    const ids = [...sel];
    router.push(ids.length ? `/?cats=${ids.join(',')}` : '/');
    setOpen(false);
  };
  const clearAll = () => { setSel(new Set()); router.push('/'); setOpen(false); };

  return (
    <div className="card-3d rounded-2xl p-3">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[15px] font-extrabold text-primary">
          <LayoutGrid className="h-5 w-5" /> تصفّح الأقسام {sel.size > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-white">{new Intl.NumberFormat('en-US').format(sel.size)}</span>}
        </span>
        <ChevronDown className={cn('h-5 w-5 text-primary transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted-foreground">اختر قسماً أو أكثر ثم اضغط «عرض المختار» لتظهر إعلاناتها بالأعلى.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {categories.map((c) => {
              const on = sel.has(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  className={cn(
                    'card-3d relative flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-xl p-3 text-center transition',
                    on ? '!border-primary ring-2 ring-primary/40 bg-primary/5' : 'hover:-translate-y-0.5',
                  )}
                >
                  {on && <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-primary text-white"><Check className="h-3.5 w-3.5" /></span>}
                  {c.icon
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={c.icon} alt="" className="h-9 w-9 object-contain" />
                    : <LayoutGrid className="h-7 w-7 text-primary" />}
                  <span className="line-clamp-1 text-xs font-bold text-primary">{c.name}</span>
                </button>
              );
            })}
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={show} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-extrabold text-white shadow-md hover:bg-primary/90">
              <Eye className="h-4 w-4" /> عرض المختار
            </button>
            <button onClick={clearAll} className="rounded-xl border-2 border-primary/30 px-4 py-2.5 text-sm font-bold text-primary hover:bg-accent">
              الكل
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
