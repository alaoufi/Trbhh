'use client';
import { useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { ChevronDown, Check, ListFilter } from 'lucide-react';

type Cat = { id: number; name: string };

function SaveButton({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending || !dirty} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
      {pending ? 'جارٍ الحفظ…' : 'حفظ اهتماماتي'}
    </button>
  );
}

/**
 * Dropdown multi-select of categories. The member ticks the categories they
 * care about; on save they are pinned to the top of the home page.
 */
export function InterestsPicker({ categories, selected, action }: { categories: Cat[]; selected: number[]; action: (fd: FormData) => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<Set<number>>(new Set(selected));
  const initial = useRef(selected.slice().sort().join(','));
  const dirty = [...chosen].sort().join(',') !== initial.current;

  const toggle = (id: number) => {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <form action={action} className="space-y-2">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border-2 border-primary/25 bg-white px-3 py-2.5 text-sm font-medium">
        <span className="flex items-center gap-2 text-primary"><ListFilter className="h-4 w-4" /> اختر أقسامك المهمّة {chosen.size > 0 && `(${chosen.size})`}</span>
        <ChevronDown className={`h-4 w-4 text-primary transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-primary/20 bg-white p-2">
          {categories.map((c) => {
            const on = chosen.has(c.id);
            return (
              <button type="button" key={c.id} onClick={() => toggle(c.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${on ? 'bg-primary/10 font-bold text-primary' : 'hover:bg-accent'}`}>
                <span>{c.name}</span>
                {on && <Check className="h-4 w-4 text-primary" />}
              </button>
            );
          })}
        </div>
      )}

      {/* selected ids submitted with the form */}
      {[...chosen].map((id) => <input key={id} type="hidden" name="categoryId" value={id} />)}

      <div className="flex items-center gap-2">
        <SaveButton dirty={dirty} />
        {chosen.size > 0 && <span className="text-xs text-muted-foreground">تظهر هذه الأقسام دائماً بأعلى الصفحة الرئيسية.</span>}
      </div>
    </form>
  );
}
