'use client';
import { useEffect } from 'react';

/**
 * تسجيل عامل الخدمة (Service Worker) بشكل لا يعلق على نسخة قديمة.
 *
 * المشكلة التي حدثت: Chrome يُحدّد تحقّقه من سكربت عامل الخدمة بسقف ٢٤ ساعة، فبقي
 * بعض المستخدمين على عامل قديم يخدم HTML مخزّناً بينما تحدّث Edge. الحل جداريّاً:
 *   • ربط رابط التسجيل برقم النسخة المنشورة (`/sw.js?v=<commit>`) — كل نشر يغيّر
 *     الرابط فيُعامله المتصفح كعامل خدمة جديد ويُثبّته فوراً، لا بعد ٢٤ ساعة.
 *   • إعادة تحميل الصفحة مرّة واحدة عند تسلّم عامل جديد التحكّم (تحديث فعلي لا أول
 *     تثبيت) كي يحصل العميل العالق على HTML حديث تلقائياً دون تدخّل المستخدم.
 */
export function PwaRegister({ version }: { version?: string }) {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const v = version && /^[a-f0-9]{7,40}$/.test(version) ? version : '10';
    // تحديث فعلي (كان هناك متحكّم سابق) → أعد التحميل مرّة واحدة عند تبدّل المتحكّم.
    // أول تثبيت (لا متحكّم) لا يُعيد التحميل كي لا تُرمّش أول زيارة.
    if (navigator.serviceWorker.controller) {
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    }
    const onLoad = () => navigator.serviceWorker.register(`/sw.js?v=${v}`).catch(() => {});
    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad);
    return () => window.removeEventListener('load', onLoad);
  }, [version]);
  return null;
}
