'use client';
import { useMemo, useRef, useState, useEffect } from 'react';
import { Search, ChevronDown, Check, MapPin } from 'lucide-react';

type City = { id: number; name: string };

/** Searchable city picker: type to filter ("ابحث عن المدينة") then choose. */
export function CityCombobox({ name, cities, defaultId, placeholder = 'اختر المدينة' }: {
  name: string; cities: City[]; defaultId?: number; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<number | ''>(defaultId ?? '');
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // keep selection valid when the city list changes (e.g. country switched)
  useEffect(() => {
    if (selected !== '' && !cities.some((c) => c.id === selected)) { setSelected(''); }
  }, [cities, selected]);

  const filtered = useMemo(() => {
    const s = q.trim();
    return (s ? cities.filter((c) => c.name.includes(s)) : cities).slice(0, 60);
  }, [cities, q]);
  const selectedName = cities.find((c) => c.id === selected)?.name;

  return (
    <div className="relative" ref={boxRef}>
      <input type="hidden" name={name} value={selected} />
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-full items-center justify-between rounded-lg border-2 border-primary/25 bg-white px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/40">
        <span className={selectedName ? 'text-foreground' : 'text-muted-foreground'}>
          <MapPin className="ml-1 inline h-4 w-4 text-primary" />{selectedName || placeholder}
        </span>
        <ChevronDown className={`h-4 w-4 text-primary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border-2 border-primary/25 bg-white shadow-xl">
          <div className="flex items-center gap-2 border-b p-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن المدينة…"
              className="w-full text-sm outline-none" />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 && <p className="p-3 text-center text-xs text-muted-foreground">لا توجد نتيجة</p>}
            {filtered.map((c) => (
              <button key={c.id} type="button"
                onClick={() => { setSelected(c.id); setOpen(false); setQ(''); }}
                className={`flex w-full items-center justify-between px-3 py-2.5 text-right text-sm hover:bg-accent ${selected === c.id ? 'bg-accent font-bold text-primary' : ''}`}>
                {c.name}
                {selected === c.id && <Check className="h-4 w-4 text-primary" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
