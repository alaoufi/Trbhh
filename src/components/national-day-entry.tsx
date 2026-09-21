'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const CAMPAIGN_KEY = 'trbhh:national-day:2026:entry-seen';

export function NationalDayEntry({ active }: { active: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!active) return;
    try {
      if (localStorage.getItem(CAMPAIGN_KEY) !== '1') setOpen(true);
    } catch {
      setOpen(true);
    }
  }, [active]);

  const dismiss = () => {
    try { localStorage.setItem(CAMPAIGN_KEY, '1'); } catch {}
    setOpen(false);
  };

  if (!active || !open) return null;

  return (
    <div className="fixed inset-0 z-[2147482500] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="اليوم الوطني السعودي">
      <div className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-white/20 bg-[#006c35] text-white shadow-2xl">
        <button
          type="button"
          onClick={dismiss}
          aria-label="إغلاق"
          className="absolute left-4 top-4 z-20 grid h-10 w-10 place-items-center rounded-full bg-black/20 text-xl font-black text-white backdrop-blur hover:bg-black/30"
        >
          ×
        </button>

        <div className="relative overflow-hidden px-5 pb-5 pt-12 sm:px-8 sm:pb-8 sm:pt-14">
          <span aria-hidden="true" className="pointer-events-none absolute -left-20 -top-20 h-60 w-60 rounded-full bg-white/10 blur-3xl" />
          <span aria-hidden="true" className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-white/10 blur-3xl" />

          <div className="relative text-center">
            <p className="text-xs font-extrabold tracking-[.2em] text-white/75">اليوم الوطني السعودي</p>
            <h2 className="mt-2 text-3xl font-black sm:text-5xl">دام عزك يا وطن</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm font-semibold leading-7 text-white/85 sm:text-base">
              احتفالًا باليوم الوطني، اختر وجهتك مباشرة وابدأ من المكان المناسب لك.
            </p>
          </div>

          <div className="relative mt-6 grid gap-3 sm:grid-cols-3">
            <Link
              href="/shop"
              onClick={dismiss}
              className="group rounded-2xl bg-white p-5 text-[#006c35] shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl"
            >
              <div className="text-sm font-black">عروض تربح</div>
              <div className="mt-1 text-xs font-bold text-[#006c35]/65">تصفح المنتجات والعروض المميزة</div>
              <div className="mt-4 text-sm font-black">استكشف الآن ←</div>
            </Link>

            <Link
              href="/search"
              onClick={dismiss}
              className="group rounded-2xl border border-white/25 bg-white/10 p-5 text-white shadow-lg backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/15"
            >
              <div className="text-sm font-black">أحدث الإعلانات</div>
              <div className="mt-1 text-xs font-bold text-white/70">شاهد الجديد في مختلف الأقسام</div>
              <div className="mt-4 text-sm font-black">تصفح الإعلانات ←</div>
            </Link>

            <button
              type="button"
              onClick={dismiss}
              className="rounded-2xl border border-white/25 bg-[#004c25]/55 p-5 text-right text-white shadow-lg backdrop-blur transition hover:-translate-y-0.5 hover:bg-[#004c25]/75"
            >
              <div className="text-sm font-black">الدخول إلى تربح</div>
              <div className="mt-1 text-xs font-bold text-white/70">أغلق شاشة المناسبة وتابع الموقع</div>
              <div className="mt-4 text-sm font-black">دخول ←</div>
            </button>
          </div>

          <p className="relative mt-5 text-center text-[11px] font-semibold text-white/60">
            تظهر هذه الشاشة مرة واحدة فقط خلال الحملة على هذا الجهاز.
          </p>
        </div>
      </div>
    </div>
  );
}
