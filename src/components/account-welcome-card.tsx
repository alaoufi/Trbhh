'use client';
import { ShareButtons } from '@/components/share-buttons';
import { WelcomePopup } from '@/components/welcome-popup';
import type { ShareCardData } from '@/components/share-card';

/** بوب أب ترحيب بالعضو عند دخوله حسابه + دعوة لمشاركة المنصة — يظهر مرة واحدة
 *  فقط لكل جلسة تصفح ويختفي تلقائياً خلال ثوانٍ، فلا يتكرر مزعجاً. */
export function AccountWelcomeCard({ name, url, title, text, card }: { name: string; url: string; title: string; text: string; card: ShareCardData }) {
  return (
    <WelcomePopup storageKey="trbhh_account_welcomed">
      <p className="text-sm font-bold text-primary">نرحب بك مجدداً يا {name}، ونسعد بوجودك ومشاركتك.</p>
      <div className="mt-2 inline-block rounded-xl border border-primary/25 bg-white px-3 py-2">
        <ShareButtons url={url} title={title} text={text} compact card={card} />
      </div>
    </WelcomePopup>
  );
}
