'use client';
import { useEffect } from 'react';

/**
 * يضبط موضع ختم التوثيق «متجر موثّق» (الذي يرسمه سكربت المركز السعودي للأعمال).
 *
 * السكربت الرسمي يُنشئ عنصره الخاص المثبّت في زاوية الشاشة (لا يرسم داخل عنصرنا). نلتقط
 * الشارة بعد ظهورها — نعرفها عبر رابط/صورة تشير إلى نطاق المركز — ثم:
 *  • إن وُجد «موضع» داخل المحتوى (#sbc-seal-slot، في الصفحة الرئيسية) ننقلها إليه ونجعلها
 *    عنصراً عادياً في تدفّق الصفحة (لا عائماً) — فتظهر ضمن المحتوى حيث نريد.
 *  • وإلا (بقية الصفحات) نُثبّتها أسفل الهيدر جهة اليسار بدل زاوية الشاشة.
 * نعيد التطبيق دورياً لفترة قصيرة لأن السكربت غير متزامن وقد يُعيد فرض تنسيقه.
 */
export function SealReposition() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const findSeal = (): HTMLElement | null => {
      const mark = document.querySelector(
        'a[href*="saudibusiness.gov.sa"], img[src*="saudibusiness.gov.sa"], iframe[src*="saudibusiness.gov.sa"], .sbc-verify-seal > *',
      ) as HTMLElement | null;
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
      const slot = document.getElementById('sbc-seal-slot');
      if (slot) {
        // داخل المحتوى: عنصر عادي في التدفّق (لا عائم)
        if (seal.parentElement !== slot) slot.appendChild(seal);
        seal.style.setProperty('position', 'static', 'important');
        for (const k of ['top', 'left', 'right', 'bottom']) seal.style.setProperty(k, 'auto', 'important');
        seal.style.setProperty('margin', '4px auto', 'important');
        seal.style.setProperty('z-index', 'auto', 'important');
      } else {
        // بقية الصفحات: شارة مثبّتة أسفل الهيدر جهة اليسار
        seal.style.setProperty('position', 'fixed', 'important');
        seal.style.setProperty('top', '70px', 'important');
        seal.style.setProperty('left', '8px', 'important');
        seal.style.setProperty('right', 'auto', 'important');
        seal.style.setProperty('bottom', 'auto', 'important');
        seal.style.setProperty('z-index', '35', 'important');
      }
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
