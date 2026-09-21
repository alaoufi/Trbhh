import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './national-day-banner.module.css';

/** Greeting and palette reused from national-day-entry at f103168; inline, without an entry gate. */
export function NationalDayBanner() {
  return <section aria-labelledby="national-day-title" className="relative overflow-hidden rounded-3xl border border-[#006c35]/20 bg-[#006c35] p-5 text-white shadow-sm sm:p-6">
    <span aria-hidden="true" className="pointer-events-none absolute -left-12 -top-20 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
    <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-bold text-white/90">اليوم الوطني السعودي</p>
        <h2 id="national-day-title" className="mt-1 text-2xl font-extrabold leading-relaxed sm:text-3xl">دام عزك يا وطن</h2>
        <p className="mt-1 text-sm leading-6 text-white/90">نحتفل معكم، ونجمعكم بسوق يقرّب البائع والمشتري.</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Link href="/search" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#f0b429] px-4 py-2 text-sm font-extrabold text-[#16294a] transition hover:bg-[#f8c955] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">تصفح السوق ←</Link>
        <Link href="/ads/new" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/60 bg-[#004c25] px-4 py-2 text-sm font-extrabold text-white transition hover:bg-[#003b1d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">أضف إعلانك</Link>
      </div>
    </div>
  </section>;
}

export function NationalDayHeroFrame({ active, children }: { active: boolean; children?: ReactNode }) {
  return active ? <div data-national-day-hero="true" className={styles.hero}>{children}</div> : children;
}
