'use client';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

/** كقسم الرئيسية العادي، لكن عنوانه زر يطوي/يمدّد المحتوى عند الضغط. */
export function CollapsibleSection({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={open ? 'py-4' : 'py-2'}>
      <button type="button" onClick={() => setOpen((v) => !v)} className={`flex w-full items-center justify-between gap-2 ${open ? 'mb-3' : ''}`}>
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-primary">
          <span className="h-5 w-1.5 rounded-full bg-gradient-to-b from-primary to-[hsl(var(--primary)/0.55)]" />
          {title}
        </h2>
        <ChevronDown className={`h-5 w-5 shrink-0 text-primary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && children}
    </section>
  );
}
