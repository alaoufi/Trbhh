'use client';

const isChunkLoadError = (error: Error) =>
  error.name === 'ChunkLoadError' || /Loading chunk [\w.-]+ failed/i.test(error.message || '');

/**
 * أخطاء تحميل الحزمات (chunk) تظهر لزائر فتح الموقع في تبويب قديم بعد نشر إصدار
 * جديد — لم يعد ملف الحزمة الذي يطلبه المتصفح موجوداً على الخادم. لا يصلحها
 * `reset()` لأنه يعيد عرض React فقط دون تحميل قائمة الحزم الجديدة؛ الحل الوحيد
 * الفعّال هو تحديث كامل للصفحة. الحارس عبر sessionStorage يمنع حلقة تحديث لا
 * نهائية إن تكرر الفشل لسبب آخر.
 */
export function reloadOnChunkError(error: Error): boolean {
  if (typeof window === 'undefined' || !isChunkLoadError(error)) return false;
  const key = 'trbhh_chunk_reload';
  if (sessionStorage.getItem(key)) return false;
  sessionStorage.setItem(key, '1');
  window.location.reload();
  return true;
}
