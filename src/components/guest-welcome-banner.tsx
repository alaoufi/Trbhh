'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

/** ترحيب بالزائر غير المسجّل — يظهر مرة واحدة فقط لكل جلسة تصفح حتى لا يتكرر
 *  مزعجاً في كل زيارة للرئيسية؛ يعود للظهور في جلسة تصفح جديدة. */
export function GuestWelcomeBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem('trbhh_guest_welcomed')) return;
      sessionStorage.setItem('trbhh_guest_welcomed', '1');
      setShow(true);
    } catch {
      setShow(true); // تعذّر الوصول لتخزين الجلسة (وضع خاص مثلاً) — نعرضها احتياطاً
    }
  }, []);
  if (!show) return null;
  return (
    <div className="card-3d flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-l from-primary/10 to-primary/5 p-4">
      <p className="text-sm font-bold leading-6 text-primary">
        مرحباً ضيفنا العزيز ،، نرحب بك في مكانك — سجّل معنا ليصلك ما يهمّك.
      </p>
      <Link href="/register" className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">سجّل الآن</Link>
    </div>
  );
}
