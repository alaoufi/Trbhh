'use client';
// حدود أخطاء جذرية: يعترض أي خطأ يحدث داخل التخطيط الجذري نفسه (root layout) —
// حالة نادرة لا يغطيها error.tsx العادي (يعمل داخل التخطيط، لا فوقه). يستبدل
// كل الصفحة فيحتاج <html><body> خاصين به، وأنماطاً سطرية (لا Tailwind متاحاً هنا).
import { useEffect } from 'react';
import { RefreshCw, Home } from 'lucide-react';
import { reportClientErrorAction } from './error-actions';
import { reloadOnChunkError, isBenignBrowserError } from '@/lib/chunk-error';

const NAVY = '#16294a';
const GOLD = '#f0b429';

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
      <body style={{ margin: 0, background: '#f1f5f9', fontFamily: 'system-ui, "Segoe UI", Tahoma, sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ width: '100%', maxWidth: 420, overflow: 'hidden', borderRadius: 24, border: '1px solid #e2e8f0', background: '#fff', boxShadow: '0 10px 40px rgba(15,23,42,0.12)' }}>
            <div style={{ height: 6, width: '100%', background: GOLD }} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '32px 24px', textAlign: 'center' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-header.png" alt="تربح" width={64} height={64} style={{ width: 64, height: 64, borderRadius: 16, objectFit: 'cover' }} />
              <div style={{ fontSize: 34 }}>⚠️</div>
              <div>
                <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: NAVY }}>حدث خلل مؤقت</h1>
                <p style={{ marginTop: 8, fontSize: 14, lineHeight: 1.8, color: '#475569' }}>
                  تعذّر عرض الموقع مؤقتاً. بياناتك محفوظة بأمان — جرّب تحديث الصفحة أو العودة للرئيسية.
                </p>
              </div>
              {error.digest && (
                <p style={{ margin: 0, borderRadius: 8, background: '#f8fafc', padding: '4px 12px', fontSize: 11, color: '#94a3b8', direction: 'ltr' }}>رمز الخطأ: {error.digest}</p>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                <button onClick={() => reset()} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 12, background: NAVY, color: '#fff', padding: '10px 20px', fontSize: 14, fontWeight: 700, border: 0, cursor: 'pointer' }}>
                  <RefreshCw size={16} /> إعادة المحاولة
                </button>
                {/* global-error يُصيَّر خارج سياق الموجّه — يجب أن يكون <a> لا <Link>. */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 12, border: `1px solid ${NAVY}`, color: NAVY, padding: '10px 20px', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
                  <Home size={16} /> الرئيسية
                </a>
              </div>
              <p style={{ margin: 0, paddingTop: 8, fontSize: 11, color: '#94a3b8' }}>منصة تربح · trbhh.com</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
