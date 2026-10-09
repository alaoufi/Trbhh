'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * نص قابل للترجمة الفورية: يعرض الترجمة المخزَّنة فوراً إن وُجدت، وإلا يجلبها تلقائياً
 * عند التحميل (بلا زر). إن تعذّرت الترجمة يعرض النص الأصلي قابلاً للنقر لإعادة الجلب.
 * النص الأصلي يبقى دائماً في title. لا أزرار ترجمة — كل شيء فوري أو بنقرة على الكلمة.
 */
const cache = new Map<string, string>(); // ذاكرة جلسة للمتصفح تمنع تكرار الطلب لنفس النص

export function CjText({ original, ar, className = '' }: { original: string; ar?: string | null; className?: string }) {
  const text = (original ?? '').trim();
  const initial = ar && ar.trim() && ar !== 'بانتظار الترجمة' ? ar : cache.get(text) ?? null;
  const [value, setValue] = useState<string | null>(initial);
  const [loading, setLoading] = useState(false);
  const tried = useRef(false);

  async function fetchAr() {
    if (!text || loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/cj/translate', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      const data = await res.json() as { ar?: string | null };
      if (data?.ar) { cache.set(text, data.ar); setValue(data.ar); }
    } catch { /* يبقى الأصل قابلاً للنقر لإعادة المحاولة */ }
    finally { setLoading(false); }
  }

  // ترجمة تلقائية عند التحميل لِما لا ترجمة مخزَّنة له (مرة واحدة لكل نص).
  useEffect(() => { if (!value && text && !tried.current) { tried.current = true; void fetchAr(); } }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  if (value) return <span className={className} title={text !== value ? text : undefined} dir="auto">{value}</span>;
  // لا ترجمة بعد: النص الأصلي قابل للنقر لجلب ترجمته (أو أثناء الجلب يظهر باهتاً).
  return (
    <button type="button" onClick={fetchAr} disabled={loading} title="اضغط لجلب الترجمة" dir="auto"
      className={`cursor-pointer text-start underline decoration-dotted underline-offset-2 ${loading ? 'opacity-50' : ''} ${className}`}>
      {text}{loading ? ' …' : ''}
    </button>
  );
}
