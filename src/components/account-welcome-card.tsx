'use client';
import { ShareButtons } from '@/components/share-buttons';
import { WelcomePopup } from '@/components/welcome-popup';
import type { ShareCardData } from '@/components/share-card';

/** بوب أب ترحيب بالعضو عند دخوله حسابه + دعوة لمشاركة المنصة — يظهر مرة واحدة
 *  فقط لكل جلسة تصفح ويختفي تلقائياً خلال ثوانٍ، فلا يتكرر مزعجاً. النص
 *  (بعد استبدال {name}) ومدة الظهور قابلان للتعديل من «النصوص الظاهرة ← رسائل الترحيب». */
export function AccountWelcomeCard({ text, seconds, url, title, shareText, card }: { text: string; seconds: number; url: string; title: string; shareText: string; card: ShareCardData }) {
  return (
    <WelcomePopup storageKey="trbhh_account_welcomed" autoHideMs={seconds * 1000}>
      <p className="text-sm font-bold text-primary">{text}</p>
      <div className="mt-2 inline-block rounded-xl border border-primary/25 bg-white px-3 py-2">
        <ShareButtons url={url} title={title} text={shareText} compact card={card} />
      </div>
    </WelcomePopup>
  );
}
