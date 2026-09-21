'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/** Keep the provider's fixed popup behavior, but anchor its badge to reserved footer space. */
export function SealReposition() {
  const pathname = usePathname();
  useEffect(() => {
    const place = () => {
      const slot = document.querySelector<HTMLElement>('[data-verify-seal-slot]');
      const root = slot?.querySelector<HTMLElement>('.sbc-verify-seal');
      if (!slot || !root) return;
      const mark = root.querySelector<HTMLElement>('a, img, iframe') || root.firstElementChild as HTMLElement | null;
      let seal = root;
      let current = mark;
      for (let i = 0; i < 6 && current && current !== root; i++, current = current.parentElement) {
        if (getComputedStyle(current).position === 'fixed') { seal = current; break; }
      }
      // The outer wrapper is hidden until its reserved slot is on screen, preventing flashes over controls.
      const rect = slot.getBoundingClientRect();
      const visible = rect.top >= 64 && rect.bottom <= window.innerHeight - (window.innerWidth < 768 ? 80 : 0);
      root.style.setProperty('visibility', visible ? 'visible' : 'hidden', 'important');
      seal.style.setProperty('visibility', visible ? 'visible' : 'hidden', 'important');
      seal.style.setProperty('position', 'fixed', 'important');
      seal.style.setProperty('top', `${Math.max(0, rect.top + 8)}px`, 'important');
      seal.style.setProperty('left', `${rect.left + 12}px`, 'important');
      seal.style.setProperty('bottom', 'auto', 'important');
      seal.style.setProperty('right', 'auto', 'important');
      seal.style.setProperty('z-index', '20', 'important');
      const height = seal.getBoundingClientRect().height;
      // على الجوال: ارفع الختم فوق شريط التنقّل السفلي حتى لا يغطّيه
      // (ارتفاع الشريط + safe-area + هامش ≈ ٨٤px).
      if (window.innerWidth < 768) {
        const navClear = 84;
        const maxTop = window.innerHeight - navClear - height;
        const top = Math.max(64, Math.min(rect.top + 8, maxTop));
        seal.style.setProperty('top', `${top}px`, 'important');
      }
      if (height > 64 && height < 160) slot.style.minHeight = `${height + 16}px`;
    };
    place();
    const observer = new MutationObserver(place);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = setTimeout(() => observer.disconnect(), 12000);
    window.addEventListener('scroll', place, { passive: true });
    window.addEventListener('resize', place);
    return () => { observer.disconnect(); clearTimeout(timer); window.removeEventListener('scroll', place); window.removeEventListener('resize', place); };
  }, [pathname]);
  return null;
}
