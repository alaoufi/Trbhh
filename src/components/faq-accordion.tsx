'use client';
import { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';

export type QA = { q: string; a: string };

export function FaqAccordion({ items }: { items: QA[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="space-y-2.5">
      {items.map((it, i) => {
        const isOpen = open === i;
        return (
          <div key={i} className={`card-3d overflow-hidden rounded-2xl transition ${isOpen ? 'ring-2 ring-primary/25' : ''}`}>
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              className="flex w-full items-center gap-3 p-4 text-right"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><HelpCircle className="h-5 w-5" /></span>
              <span className="flex-1 text-[15px] font-extrabold text-primary">{it.q}</span>
              <ChevronDown className={`h-5 w-5 shrink-0 text-primary transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            <div className={`grid transition-all duration-300 ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
              <div className="overflow-hidden">
                <p className="border-t border-primary/10 px-4 py-3 leading-8 text-foreground/90">{it.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
