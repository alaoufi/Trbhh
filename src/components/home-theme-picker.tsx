'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, LayoutTemplate } from 'lucide-react';
import { resolveHomeTheme, type HomeTheme } from '@/lib/home-theme';

const HOME_THEMES: { id: HomeTheme; name: string }[] = [
  { id: 'market', name: 'سوق تربح — الجديد' },
  { id: 'classic', name: 'الرئيسية السابقة' },
];

function persistHomeTheme(theme: HomeTheme) {
  document.cookie = `home_theme=${theme}; path=/; max-age=31536000; samesite=lax`;
}

export function HomeThemePicker() {
  const router = useRouter();
  const [current, setCurrent] = useState<HomeTheme>('market');
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const value = document.cookie.split(';').map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith('home_theme='))?.slice('home_theme='.length);
    setCurrent(resolveHomeTheme(value));
  }, []);

  function selectTheme(theme: HomeTheme) {
    persistHomeTheme(theme);
    setCurrent(theme);
    startTransition(() => router.refresh());
  }

  return (
    <fieldset className="space-y-2" aria-busy={pending}>
      <legend className="flex items-center gap-2 text-sm font-bold text-primary">
        <LayoutTemplate className="h-4 w-4" aria-hidden="true" /> شكل الصفحة الرئيسية
      </legend>
      <p className="text-xs leading-relaxed text-muted-foreground">اختر ترتيب الصفحة الرئيسية. تبقى قوالب الألوان والهوية السابقة متاحة بشكل مستقل أدناه.</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {HOME_THEMES.map((theme) => {
          const active = current === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              aria-pressed={active}
              disabled={pending}
              onClick={() => selectTheme(theme.id)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-right text-xs font-bold transition disabled:opacity-60 ${active ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/30' : 'border-border hover:bg-accent'}`}
            >
              {active && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
              {theme.name}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
