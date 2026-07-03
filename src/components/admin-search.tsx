'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

/** Debounced live-filter input: updates ?q= as you type (server re-renders). */
export function AdminSearch({ basePath, defaultValue = '', placeholder }: { basePath: string; defaultValue?: string; placeholder?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onChange = (v: string) => {
    setValue(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const q = v.trim();
      router.replace(q ? `${basePath}?q=${encodeURIComponent(q)}` : basePath);
    }, 300);
  };

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border bg-background pr-9 pl-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}
