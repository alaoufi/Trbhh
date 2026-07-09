'use client';
import { useEffect, useRef, useState } from 'react';
import { Search as SearchIcon } from 'lucide-react';

/** حقل بحث باقتراحات فورية أثناء الكتابة (يُعطَّل من الإعدادات فيصبح حقلاً عادياً). */
export function SearchSuggestInput({ name = 'q', defaultValue = '', placeholder = 'كلمة البحث' }: { name?: string; defaultValue?: string; placeholder?: string }) {
  const [v, setV] = useState(defaultValue);
  const [items, setItems] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function onChange(next: string) {
    setV(next);
    if (t.current) clearTimeout(t.current);
    if (next.trim().length < 2) { setItems([]); setOpen(false); return; }
    t.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search/suggest?q=${encodeURIComponent(next.trim())}`).then((x) => x.json());
        setItems(r.items || []);
        setOpen((r.items || []).length > 0);
      } catch { /* ignore */ }
    }, 250);
  }

  return (
    <div ref={box} className="relative">
      <SearchIcon className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        name={name}
        value={v}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => items.length > 0 && setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        className="h-10 w-full rounded-lg border bg-background pr-10 pl-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      {open && (
        <div className="absolute inset-x-0 top-11 z-30 overflow-hidden rounded-xl border-2 border-primary/20 bg-card shadow-xl">
          {items.map((s) => (
            <button
              key={s}
              type="submit"
              onClick={() => { setV(s); setOpen(false); }}
              className="block w-full truncate px-3 py-2.5 text-right text-sm font-medium hover:bg-accent"
            >
              🔎 {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
