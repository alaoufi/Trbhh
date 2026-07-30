'use client';
import { useEffect } from 'react';

/**
 * يضع ختم التوثيق الرسمي «متجر موثّق» (الذي يرسمه سكربت المركز السعودي للأعمال) أعلى يسار
 * الصفحة، عند مستوى مبدّل الحساب.
 *
 * مهم: نُبقي الختم **عائماً (position:fixed)** كما صمّمه المركز — فنافذته المنبثقة (تفاصيل
 * التحقّق) تفتح وتُغلق طبيعياً. نغيّر إحداثياته فقط (إلى الأعلى يسار) دون نقله داخل تدفّق
 * الصفحة أو تغيير نوع تموضعه — لأن ذلك كان يكسر نافذته فتفتح داخل الصفحة بلا إغلاق.
 * نعيد التطبيق دورياً لفترة قصيرة لأن السكربت غير متزامن وقد يُعيد فرض تنسيقه.
 */
export function SealReposition() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const findSeal = (): HTMLElement | null => {
      const mark = document.querySelector<HTMLElement>(
        'a[href*="saudibusiness.gov.sa"], img[src*="saudibusiness.gov.sa"], iframe[src*="saudibusiness.gov.sa"], .sbc-verify-seal > *',
      );
      if (!mark) return null;
      // اصعد إلى الحاوية المثبّتة (position:fixed) التي وضعها السكربت، وإلا استعمل العنصر نفسه
      let el: HTMLElement | null = mark;
      for (let i = 0; i < 6 && el && el !== document.body; i++) {
        if (getComputedStyle(el).position === 'fixed') return el;
        el = el.parentElement;
      }
      return mark;
    };
    const place = (): boolean => {
      const seal = findSeal();
      if (!seal) return false;
      // يبقى عائماً (fixed) لتعمل نافذته وتُغلق — نضبط موضعه أعلى يسار عند مستوى شريط الهوية.
      seal.style.setProperty('position', 'fixed', 'important');
      seal.style.setProperty('top', '96px', 'important');
      seal.style.setProperty('left', '8px', 'important');
      seal.style.setProperty('bottom', 'auto', 'important');
      seal.style.setProperty('right', 'auto', 'important');
      seal.style.setProperty('z-index', '45', 'important');
      return true;
    };
    place();
    const obs = new MutationObserver(() => place());
    obs.observe(document.body, { childList: true, subtree: true });
    // إعادة تطبيق دورية لفترة قصيرة (السكربت غير متزامن وقد يُعيد فرض تنسيقه)
    let n = 0;
    const iv = setInterval(() => { place(); if (++n > 48) { clearInterval(iv); obs.disconnect(); } }, 250);
    return () => { obs.disconnect(); clearInterval(iv); };
  }, []);
  return null;
}
