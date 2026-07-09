'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Gift, X, ChevronLeft } from 'lucide-react';

/**
 * بانر «الرصيد الترحيبي» للزوار غير المسجّلين — يظهر فقط عندما تحدد الإدارة
 * مبلغاً ترحيبياً أكبر من صفر (الإيرادات ← التسعيرات ← النمو والمكافآت).
 * قابل للإغلاق ويُتذكّر الإغلاق على نفس الجهاز.
 */
export function WelcomeBanner({ amount }: { amount: number }) {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try { setHidden(localStorage.getItem('trbhh_welcome_hide') === '1'); } catch { setHidden(false); }
  }, []);
  if (hidden || amount <= 0) return null;
  return (
    <div
      className="relative flex items-center justify-between gap-3 overflow-hidden rounded-2xl p-4 text-white shadow-lg ring-1 ring-white/20"
      style={{ backgroundImage: 'linear-gradient(110deg,#047857,#059669,#0d9488,#047857)' }}
    >
      <Link href="/login?mode=register" className="flex min-w-0 flex-1 items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/25 shadow-inner ring-1 ring-white/30"><Gift className="h-6 w-6" /></span>
        <span className="min-w-0">
          <span className="block text-base font-extrabold drop-shadow">سجّل الآن واحصل على {amount} ر.س رصيداً ترحيبياً 🎁</span>
          <span className="block text-xs font-medium text-white/95 drop-shadow">يُضاف لمحفظتك فور التسجيل — استخدمه في الخدمات المدفوعة.</span>
        </span>
        <ChevronLeft className="h-5 w-5 shrink-0 drop-shadow" />
      </Link>
      <button
        type="button"
        aria-label="إخفاء"
        onClick={() => { try { localStorage.setItem('trbhh_welcome_hide', '1'); } catch { /* ignore */ } setHidden(true); }}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/20 hover:bg-white/35"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
