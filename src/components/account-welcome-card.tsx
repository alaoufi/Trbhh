'use client';
import { useEffect, useState } from 'react';
import { ShareButtons } from '@/components/share-buttons';
import type { ShareCardData } from '@/components/share-card';

/** بطاقة ترحيب بالعضو عند دخوله حسابه + دعوة لمشاركة المنصة — تظهر مرة واحدة
 *  فقط لكل جلسة تصفح حتى لا تتكرر مزعجة في كل زيارة لصفحة الحساب. */
export function AccountWelcomeCard({ name, url, title, text, card }: { name: string; url: string; title: string; text: string; card: ShareCardData }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem('trbhh_account_welcomed')) return;
      sessionStorage.setItem('trbhh_account_welcomed', '1');
      setShow(true);
    } catch {
      setShow(true); // تعذّر الوصول لتخزين الجلسة (وضع خاص مثلاً) — نعرضها احتياطاً
    }
  }, []);
  if (!show) return null;
  return (
    <div className="card-3d flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-l from-primary/10 to-primary/5 p-4">
      <p className="text-sm font-bold text-primary/80">نرحب بك مجدداً يا {name}، ونسعد بوجودك ومشاركتك.</p>
      <div className="shrink-0 rounded-xl border border-primary/25 bg-white px-3 py-2">
        <ShareButtons url={url} title={title} text={text} compact card={card} />
      </div>
    </div>
  );
}
