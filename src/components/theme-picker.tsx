'use client';
import { useEffect, useState } from 'react';
import { Check, Palette } from 'lucide-react';

export const THEMES: { id: string; name: string; color: string }[] = [
  { id: '', name: 'أزرق', color: '#3287da' },
  { id: 'desert', name: 'الصحراوي', color: '#b5893f' },
  { id: 'spring', name: 'الربيعي', color: '#d56fa0' },
  { id: 'agri', name: 'الزراعي', color: '#3f9d5b' },
  { id: 'sea', name: 'البحري', color: '#1aa3c2' },
  { id: 'snow', name: 'الثلجي', color: '#5ab0e0' },
  { id: 'mountain', name: 'الجبلي', color: '#5a8a45' },
  { id: 'sunset', name: 'الغروب', color: '#e2683a' },
  { id: 'night', name: 'الليلي', color: '#1e293b' },
  { id: 'mint', name: 'النعناعي', color: '#2fb0a3' },
  { id: 'lavender', name: 'الخزامى', color: '#8a7fd6' },
];

function applyTheme(id: string) {
  const el = document.documentElement;
  if (id) el.setAttribute('data-theme', id);
  else el.removeAttribute('data-theme');
  // persist for one year so SSR renders the same theme (no flash)
  document.cookie = `theme=${id}; path=/; max-age=31536000; samesite=lax`;
}

export function ThemePicker() {
  const [current, setCurrent] = useState('');
  useEffect(() => {
    setCurrent(document.documentElement.getAttribute('data-theme') || '');
  }, []);

  return (
    <div className="px-3 py-2">
      <div className="mb-2 flex items-center gap-2 text-[13px] font-bold text-muted-foreground">
        <Palette className="h-4 w-4 text-primary" /> الثيمات (ألوان الموقع)
      </div>
      <div className="grid grid-cols-3 gap-2">
        {THEMES.map((t) => {
          const active = current === t.id;
          return (
            <button
              key={t.id || 'default'}
              type="button"
              onClick={() => { applyTheme(t.id); setCurrent(t.id); }}
              className={`flex items-center gap-1.5 rounded-lg border px-2 py-2 text-xs transition ${active ? 'border-primary ring-2 ring-primary/40' : 'border-border hover:bg-accent'}`}
            >
              <span className="relative grid h-5 w-5 shrink-0 place-items-center rounded-full ring-1 ring-black/10" style={{ backgroundColor: t.color }}>
                {active && <Check className="h-3 w-3 text-white" />}
              </span>
              <span className="truncate">{t.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
