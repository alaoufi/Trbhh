'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * ختم «متجر موثّق» (المركز السعودي للأعمال) يُحقن بموضعٍ ثابت من سكربت المزوّد.
 * - سطح المكتب: نثبّته عند مساحة الفوتر المحجوزة (لا يطفو فوق المحتوى).
 * - الجوال: نمسح المستند كلّه بحثاً عن أي عنصر ختم مثبّت (fixed) — أينما حقنه
 *   السكربت — ونثبّته أعلى شريط التنقّل السفلي فلا يغطّيه إطلاقاً.
 */
const MOBILE_BOTTOM = 'calc(90px + env(safe-area-inset-bottom, 0px))';

export function SealReposition() {
  const pathname = usePathname();
  useEffect(() => {
    const isMobile = () => window.innerWidth < 768;

    // كل عناصر الختم المحتملة أينما حقنها المزوّد (بالفئة/المعرّف أو نطاق المزوّد).
    const sealEls = (): HTMLElement[] => {
      const set = new Set<HTMLElement>();
      // العنصر الفعلي الذي يحقنه المزوّد ويجعله fixed هو iframe.sbc-seal-frame
      // (z-index هائل)، لذا نستهدفه صراحةً أينما كان في المستند.
      document.querySelectorAll<HTMLElement>(
        '.sbc-seal-frame, .sbc-verify-seal .sbc-seal-frame, [class*="sbc-seal"], [class*="sbc-verify"], iframe[src*="saudibusiness"], iframe[src*="eauthenticate"]',
      ).forEach((el) => set.add(el));
      return [...set];
    };

    // الجوال: ثبّت كل عنصر ختم مثبّت فوق الشريط السفلي.
    const pinMobile = () => {
      if (!isMobile()) return;
      for (const el of sealEls()) {
        // ثبّت العنصر نفسه إن كان fixed، وإلا فأقرب سلف fixed.
        let node: HTMLElement | null = el;
        for (let i = 0; i < 5 && node; i++, node = node.parentElement) {
          if (getComputedStyle(node).position === 'fixed') break;
        }
        const target = node && getComputedStyle(node).position === 'fixed' ? node : el;
        target.style.setProperty('bottom', MOBILE_BOTTOM, 'important');
        target.style.setProperty('top', 'auto', 'important');
        target.style.setProperty('left', '12px', 'important');
        target.style.setProperty('right', 'auto', 'important');
        target.style.setProperty('z-index', '30', 'important');
        target.style.setProperty('visibility', 'visible', 'important');
      }
    };

    const placeDesktop = () => {
      const slot = document.querySelector<HTMLElement>('[data-verify-seal-slot]');
      const root = slot?.querySelector<HTMLElement>('.sbc-verify-seal');
      if (!slot || !root) return;
      const mark = root.querySelector<HTMLElement>('a, img, iframe') || (root.firstElementChild as HTMLElement | null);
      let seal = root;
      let current = mark;
      for (let i = 0; i < 6 && current && current !== root; i++, current = current.parentElement) {
        if (getComputedStyle(current).position === 'fixed') { seal = current; break; }
      }
      const rect = slot.getBoundingClientRect();
      const visible = rect.top >= 64 && rect.bottom <= window.innerHeight;
      root.style.setProperty('visibility', visible ? 'visible' : 'hidden', 'important');
      seal.style.setProperty('visibility', visible ? 'visible' : 'hidden', 'important');
      seal.style.setProperty('position', 'fixed', 'important');
      seal.style.setProperty('top', `${Math.max(0, rect.top + 8)}px`, 'important');
      seal.style.setProperty('left', `${rect.left + 12}px`, 'important');
      seal.style.setProperty('bottom', 'auto', 'important');
      seal.style.setProperty('right', 'auto', 'important');
      seal.style.setProperty('z-index', '20', 'important');
      const height = seal.getBoundingClientRect().height;
      if (height > 64 && height < 160) slot.style.minHeight = `${height + 16}px`;
    };

    const place = () => {
      if (isMobile()) pinMobile();
      else placeDesktop();
    };

    place();
    // إعادات موقّتة لالتقاط حقن السكربت المتأخّر للشارة.
    const retries = [400, 1200, 2500, 5000].map((ms) => setTimeout(place, ms));
    const observer = new MutationObserver(place);
    observer.observe(document.body, { childList: true, subtree: true });
    const stop = setTimeout(() => observer.disconnect(), 15000);
    window.addEventListener('scroll', place, { passive: true });
    window.addEventListener('resize', place);
    return () => {
      observer.disconnect();
      clearTimeout(stop);
      retries.forEach(clearTimeout);
      window.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
    };
  }, [pathname]);
  return null;
}
