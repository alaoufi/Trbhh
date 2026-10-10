import 'server-only';

/**
 * ذاكرة حيّة قصيرة مشتركة لنتائج CJ (قراءة فقط) — تُقلّل تكرار نداء CJ المحدود (طلب/ثانية)
 * عبر مسارات العرض والتحقّق للاختيار. لا تُخزَّن إلا النتائج الناجحة. المسارات المالية الفعلية
 * (تسعير السلة وإنشاء الطلب) تبقى حيّة بلا هذه الذاكرة فتتحدّث الأرقام قبل الشراء فعلاً.
 */
const store = new Map<string, { at: number; value: unknown }>();
const MAX_ENTRIES = 5000;

export function readLiveCache<T>(key: string, ttlMs: number): T | null {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  if (hit) store.delete(key);
  return null;
}

export function writeLiveCache(key: string, value: unknown): void {
  store.set(key, { at: Date.now(), value });
  if (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
}

/** للاختبارات فقط: تفريغ الذاكرة بين الحالات لعزلها. */
export function clearLiveCache(): void { store.clear(); }
