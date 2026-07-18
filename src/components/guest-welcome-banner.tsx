'use client';
import Link from 'next/link';
import { WelcomePopup } from '@/components/welcome-popup';

/** ترحيب بالزائر غير المسجّل — بوب أب يظهر مرة واحدة فقط لكل جلسة تصفح
 *  ويختفي تلقائياً خلال ثوانٍ، فلا يتكرر مزعجاً في كل زيارة للرئيسية.
 *  النص ومدة الظهور قابلان للتعديل من «النصوص الظاهرة ← رسائل الترحيب». */
export function GuestWelcomeBanner({ text, seconds }: { text: string; seconds: number }) {
  return (
    <WelcomePopup storageKey="trbhh_guest_welcomed" autoHideMs={seconds * 1000}>
      <p className="text-sm font-bold leading-6 text-primary">{text}</p>
      <Link href="/register" className="btn-3d mt-2 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">سجّل الآن</Link>
    </WelcomePopup>
  );
}
