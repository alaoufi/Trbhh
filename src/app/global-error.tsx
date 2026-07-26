'use client';
// حدود أخطاء جذرية: يعترض أي خطأ يحدث داخل التخطيط الجذري نفسه (root layout) —
// حالة نادرة لا يغطيها error.tsx العادي (يعمل داخل التخطيط، لا فوقه). يستبدل
// كل الصفحة فيحتاج <html><body> خاصين به.
import { useEffect } from 'react';
import { RefreshCw, Home } from 'lucide-react';
import { reportClientErrorAction } from './error-actions';
import { reloadOnChunkError, isBenignBrowserError } from '@/lib/chunk-error';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Global app error:', error);
    if (reloadOnChunkError(error)) return; // إصدار جديد من الموقع — تحديث كامل يحلّها تلقائياً
    if (isBenignBrowserError(error)) return; // تدخّل المتصفح (ترجمة/إضافة) لا كودنا — لا نُغرق السجل به
    reportClientErrorAction({
      message: error.message || 'خطأ غير معروف',
      digest: error.digest,
      stack: error.stack,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
    }).catch(() => {});
  }, [error]);

  return (
    <html dir="rtl" lang="ar">
      <body>
        <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '0 24px', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: '#3287da' }}>حدث خطأ غير متوقع</h1>
            <p style={{ marginTop: 4, fontSize: 14, color: '#666' }}>تعذّر عرض الموقع مؤقتاً. حاول تحديث الصفحة.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => reset()} style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, background: '#3287da', color: '#fff', padding: '8px 16px', fontSize: 14, fontWeight: 700, border: 0, cursor: 'pointer' }}>
              <RefreshCw size={16} /> إعادة المحاولة
            </button>
            {/* global-error يُصيَّر خارج سياق الموجّه (يستبدل html/body كاملاً عند خطأ
                جذري) — يجب أن يكون <a> لا <Link> (لا يتوفّر سياق التنقّل هنا). */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, border: '1px solid #3287da', color: '#3287da', padding: '8px 16px', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
              <Home size={16} /> الرئيسية
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
