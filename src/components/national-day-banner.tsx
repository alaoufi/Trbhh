import type { ReactNode } from 'react';
import styles from './national-day-banner.module.css';
export { NationalDayEntry } from './national-day-entry';

/** Greeting and palette reused from national-day-entry at f103168; inline, without an entry gate. */
export function NationalDayBanner() {
  return <section aria-labelledby="national-day-title" className="relative overflow-hidden rounded-2xl border border-[#006c35]/20 bg-[#006c35] p-3 text-white shadow-sm sm:p-4">
    <span aria-hidden="true" className="pointer-events-none absolute -left-12 -top-20 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
    <div className="relative">
      <div className="min-w-0">
        <p className="text-xs font-bold text-white/90">اليوم الوطني السعودي</p>
        <h2 id="national-day-title" className="mt-0.5 text-xl font-extrabold leading-relaxed sm:text-2xl">دام عزك يا وطن</h2>
        <p className="text-sm leading-6 text-white/90">وطنٌ نعتز به، وقيادةٌ نخلص لها، وولاءٌ وانتماءٌ يتجددان في كل عام.</p>
        <p className="mt-1 text-xs font-bold leading-5 text-[#f0b429]">اللهم احفظ المملكة وأدم عليها عزها وأمنها وازدهارها.</p>
      </div>
    </div>
  </section>;
}

export function NationalDayHeroFrame({ active, children }: { active: boolean; children?: ReactNode }) {
  return active ? <div data-national-day-hero="true" className={styles.hero}>{children}</div> : children;
}
