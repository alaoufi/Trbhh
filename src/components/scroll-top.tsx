'use client';
import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

/** Floating "back to top" arrow — appears after scrolling down. */
export function ScrollTop({ targetId }: { targetId?: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 300);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function up() {
    const el = targetId ? document.getElementById(targetId) : null;
    if (el) el.scrollIntoView({ behavior: 'smooth' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (!show) return null;
  return (
    <button
      type="button"
      onClick={up}
      aria-label="العودة للأعلى"
      className="fixed bottom-24 left-4 z-50 grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-primary to-[#1b4f8a] text-white shadow-xl ring-2 ring-white/40 transition hover:scale-105 md:bottom-6"
    >
      <ArrowUp className="h-6 w-6" />
    </button>
  );
}
