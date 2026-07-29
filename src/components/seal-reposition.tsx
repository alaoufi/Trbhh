'use client';
import { useEffect } from 'react';

/**
 * يعيد ضبط موضع ختم التوثيق العائم «متجر موثّق» (الذي يرسمه سكربت المركز السعودي للأعمال).
 *
 * السكربت الرسمي يُنشئ عنصره الخاص المثبّت في زاوية الشاشة (لا يرسم داخل عنصرنا)، فتنسيق
 * CSS على .sbc-verify-seal لا يصله. لذلك نلتقط الشارة بعد ظهورها — نعرفها عبر رابط/صورة
 * تشير إلى نطاق المركز — ثم ننقلها أسفل الهيدر عند مستوى شريط الهويات جهة اليسار (المكان
 * الفارغ)، بعيداً عن الشعار وزر القائمة. السكربت غير متزامن (async) وقد يتأخّر، فنراقب
 * إضافات DOM ونعيد المحاولة دورياً لفترة قصيرة ثم نتوقّف.
 */
export function SealReposition() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    let done = false;
    const place = (): boolean => {
      const mark = document.querySelector(
        'a[href*="saudibusiness.gov.sa"], img[src*="saudibusiness.gov.sa"], iframe[src*="saudibusiness.gov.sa"], .sbc-verify-seal > *',
      ) as HTMLElement | null;
      if (!mark) return false;
      // اصعد إلى الحاوية المثبّتة (position:fixed) التي وضعها السكربت، وإلا استعمل العنصر نفسه
      let el: HTMLElement | null = mark;
      let fixed: HTMLElement | null = null;
      for (let i = 0; i < 6 && el && el !== document.body; i++) {
        if (getComputedStyle(el).position === 'fixed') { fixed = el; break; }
        el = el.parentElement;
      }
      const target = fixed || mark;
      target.style.setProperty('position', 'fixed', 'important');
      target.style.setProperty('top', '70px', 'important');
      target.style.setProperty('left', '8px', 'important');
      target.style.setProperty('right', 'auto', 'important');
      target.style.setProperty('bottom', 'auto', 'important');
      target.style.setProperty('z-index', '35', 'important');
      done = true;
      return true;
    };
    if (place()) return;
    const obs = new MutationObserver(() => { if (place()) obs.disconnect(); });
    obs.observe(document.body, { childList: true, subtree: true });
    let n = 0;
    const iv = setInterval(() => {
      if (done || place() || ++n > 40) { clearInterval(iv); obs.disconnect(); }
    }, 250);
    return () => { obs.disconnect(); clearInterval(iv); };
  }, []);
  return null;
}
