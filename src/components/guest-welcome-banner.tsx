'use client';
import Link from 'next/link';
import { WelcomePopup } from '@/components/welcome-popup';

/** ترحيب بالزائر غير المسجّل — بوب أب يظهر مرة واحدة فقط لكل جلسة تصفح
 *  ويختفي تلقائياً خلال ثوانٍ، فلا يتكرر مزعجاً في كل زيارة للرئيسية. */
export function GuestWelcomeBanner() {
  return (
    <WelcomePopup storageKey="trbhh_guest_welcomed">
      <p className="text-sm font-bold leading-6 text-primary">
        مرحباً ضيفنا العزيز ،، نرحب بك في مكانك — سجّل معنا ليصلك ما يهمّك.
      </p>
      <Link href="/register" className="btn-3d mt-2 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">سجّل الآن</Link>
    </WelcomePopup>
  );
}
