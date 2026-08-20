'use client';

const isChunkLoadError = (error: Error) =>
  error.name === 'ChunkLoadError' || /Loading chunk [\w.-]+ failed/i.test(error.message || '');

/**
 * Next.js gives every Server Action a build-specific identifier. A form left
 * open during deployment can therefore post an identifier the new server no
 * longer knows. This has the same recovery as a stale chunk: fetch the new
 * document once, rather than showing the visitor an unrelated generic error.
 */
export function isStaleServerActionError(error: Error): boolean {
  return /Failed to find Server Action/i.test(error?.message || '');
}

/**
 * أخطاء تحميل الحزمات (chunk) تظهر لزائر فتح الموقع في تبويب قديم بعد نشر إصدار
 * جديد — لم يعد ملف الحزمة الذي يطلبه المتصفح موجوداً على الخادم. لا يصلحها
 * `reset()` لأنه يعيد عرض React فقط دون تحميل قائمة الحزم الجديدة؛ الحل الوحيد
 * الفعّال هو تحديث كامل للصفحة.
 *
 * الحارس زمني لا لمرّة واحدة: الموقع ينشر تلقائياً بكثرة، فقد يصادف نفس الجلسة
 * أكثر من إصدار جديد أثناء تصفّح طويل — كل مرة يجب أن تُحدَّث الصفحة تلقائياً
 * (تشافٍ ذاتي) لا أن تُسجَّل كخطأ. نمنع فقط الحلقة الحقيقية: تحديثان خلال نافذة
 * قصيرة يعني أن التحديث لم يُصلح المشكلة (سبب آخر) — عندها نتوقّف ونترك الخطأ يُسجَّل.
 */
const RELOAD_COOLDOWN_MS = 15000;

export function reloadOnChunkError(error: Error): boolean {
  if (typeof window === 'undefined' || (!isChunkLoadError(error) && !isStaleServerActionError(error))) return false;
  const key = 'trbhh_asset_or_action_reload_at';
  let last = 0;
  try { last = parseInt(sessionStorage.getItem(key) || '0', 10) || 0; } catch { /* storage محجوب */ }
  const now = Date.now();
  if (last && now - last < RELOAD_COOLDOWN_MS) return false; // تحديث قريب لم يُصلحها → حلقة، توقّف وسجّل
  try { sessionStorage.setItem(key, String(now)); } catch { /* تجاهل */ }
  window.location.reload();
  return true;
}

/**
 * أخطاء ليست من كودنا بل من تدخّل المتصفح في شجرة DOM بعد ترسيخ React لها —
 * أشهرها ترجمة Chrome التلقائية (تستبدل العُقد النصية) وبعض الإضافات — فيفشل
 * React في `removeChild`/`insertBefore` لأن العقدة لم تعد ابنةً لأبيها. لا يمكننا
 * إصلاح ما يفعله المتصفح، وتسجيلها يُغرِق سجل الأخطاء بضجيج يخفي الأعطال الحقيقية.
 * نستثنيها من التسجيل فقط (تبقى شاشة إعادة المحاولة تتيح للعضو التعافي).
 */
export function isBenignBrowserError(error: Error): boolean {
  const msg = error?.message || '';
  return (
    /(removeChild|insertBefore|replaceChild).+(not a child|Node)/i.test(msg) ||
    /The node (to be removed|before which the new node is to be inserted) is not a child/i.test(msg) ||
    /ResizeObserver loop/i.test(msg)
  );
}
