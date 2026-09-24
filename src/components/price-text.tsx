import type { ReactNode } from 'react';

/** One readable price treatment across product and advertisement cards. */
export function PriceText({ children, size = 'card', muted = false }: { children: ReactNode; size?: 'card' | 'detail'; muted?: boolean }) {
  return <span className={`font-black tabular-nums ${muted ? 'text-slate-500' : 'text-emerald-700'} ${size === 'detail' ? 'text-3xl sm:text-4xl' : 'text-lg sm:text-xl'}`}>{children}</span>;
}
