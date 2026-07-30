'use client';
import { useEffect } from 'react';

/**
 * يضع ختم التوثيق الرسمي «متجر موثّق» (الذي يرسمه سكربت المركز السعودي للأعمال) في مكانه
 * المطلوب: بجانب مبدّل الحساب أعلى الصفحة (داخل #sbc-seal-slot).
 *
 * السكربت الرسمي يُنشئ عنصره الخاص المثبّت في زاوية الشاشة. نلتقطه بعد ظهوره — نعرفه عبر
 * رابط/صورة تشير إلى نطاق المركز — ثم ننقله إلى الموضع (#sbc-seal-slot) ونجعله عنصراً
 * عادياً في تدفّق الشريط (لا عائماً). نعيد التطبيق دورياً لفترة قصيرة لأن السكربت غير متزامن
 * وقد يُعيد فرض تنسيقه. (ختم واحد فقط على الصفحة — لا نسخة مكرّرة.)
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
      const slot = document.getElementById('sbc-seal-slot');
      if (slot) {
        // انقل الختم إلى الموضع بجانب مبدّل الحساب واجعله عنصراً عادياً (لا عائماً)
        if (seal.parentElement !== slot) slot.appendChild(seal);
        seal.style.setProperty('position', 'static', 'important');
        seal.style.setProperty('top', 'auto', 'important');
        seal.style.setProperty('bottom', 'auto', 'important');
        seal.style.setProperty('left', 'auto', 'important');
        seal.style.setProperty('right', 'auto', 'important');
        seal.style.setProperty('margin', '0', 'important');
        seal.style.setProperty('z-index', 'auto', 'important');
        return true;
      }
      // احتياطي (لو غاب الموضع): تثبيت أسفل يسار مرفوعاً فوق الشريط السفلي
      seal.style.setProperty('position', 'fixed', 'important');
      seal.style.setProperty('bottom', '78px', 'important');
      seal.style.setProperty('left', '8px', 'important');
      seal.style.setProperty('top', 'auto', 'important');
      seal.style.setProperty('right', 'auto', 'important');
      seal.style.setProperty('z-index', '35', 'important');
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
