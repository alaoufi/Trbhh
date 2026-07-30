'use client';
/**
 * شارة «متجر موثّق» بتصميم المنصّة — عنصر ثابت داخل المحتوى (يظهر دائماً، لا يعتمد على
 * سكربت المركز المتذبذب). تعبّر عن حالة توثيق حقيقية (المنصّة موثّقة لدى المركز السعودي
 * للأعمال). ختم المركز الرسمي العائم يبقى مستقلاً في زاوية الصفحة كمصدر تحقّق رسمي.
 *
 * الشارة رابط: عند النقر تفتح **تحقّق المركز الرسمي** نفسه (رابط ختم المركز الذي يرسمه
 * seal.js إلى نطاق saudibusiness.gov.sa) إن وُجد، وإلا تفتح موقع المركز الرسمي كبديل ثابت —
 * فتعمل دائماً حتى قبل تحميل سكربت المركز.
 */
const SBC_VERIFY_URL = 'https://eauthenticate.saudibusiness.gov.sa/';

export function VerifiedBadge({ className = '' }: { className?: string }) {
  const openOfficialVerification = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (typeof document === 'undefined') return; // حارس: يُصيَّر على الخادم أولاً
    // نلتقط ختم المركز الرسمي نفسه (الذي يرسمه seal.js) — عبر صورة شعار المركز أو رابطه —
    // مع استثناء شارتنا (data-verified-badge). الهدف: أن ينفّذ النقر هنا ما ينفّذه النقر على
    // الختم الرسمي تماماً، مهما كانت طريقة فتحه (href مباشر أو onclick/window.open).
    const marker = document.querySelector<HTMLElement>(
      '.sbc-verify-seal a:not([data-verified-badge]), .sbc-verify-seal img, img[src*="saudibusiness"], a[href*="saudibusiness"]:not([data-verified-badge]), iframe[src*="saudibusiness"]',
    );
    if (!marker) return; // لم يُرسَم الختم بعد → يُترك الرابط الافتراضي يعمل
    const anchor = (marker.tagName === 'A' ? marker : marker.closest('a')) as HTMLAnchorElement | null;
    const raw = anchor?.getAttribute('href') || '';
    if (anchor && raw && !/^\s*javascript:/i.test(raw)) {
      // رابط صريح على الختم الرسمي → نفتح نفسه (الرابط الصحيح المنقول من رقم ١)
      e.preventDefault();
      window.open(anchor.href, '_blank', 'noopener,noreferrer');
      return;
    }
    // يفتح عبر onclick/window.open → نطلق نقرة حقيقية على الختم الرسمي فيُنفّذ سلوكه الصحيح
    e.preventDefault();
    (anchor || marker).click();
  };

  return (
    <a
      href={SBC_VERIFY_URL}
      target="_blank"
      rel="noopener noreferrer"
      data-verified-badge="1"
      onClick={openOfficialVerification}
      className={`group inline-flex cursor-pointer items-center gap-2 rounded-full border border-emerald-300 bg-gradient-to-l from-emerald-50 to-white px-4 py-1.5 shadow-sm transition hover:border-emerald-400 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${className}`.trim()}
      title="متجر موثّق لدى المركز السعودي للأعمال — اضغط لعرض معلومات التوثيق الرسمية"
      aria-label="متجر موثّق لدى المركز السعودي للأعمال — عرض معلومات التوثيق الرسمية"
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-600 text-white">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2l7 3v6c0 4.4-3 8.4-7 9-4-.6-7-4.6-7-9V5l7-3z" fill="currentColor" stroke="none" opacity="0.18" />
          <path d="M12 2l7 3v6c0 4.4-3 8.4-7 9-4-.6-7-4.6-7-9V5l7-3z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      </span>
      <span className="flex flex-col leading-tight">
        <b className="text-[13px] font-extrabold text-emerald-800 group-hover:text-emerald-900">متجر موثّق</b>
        <span className="text-[10px] font-medium text-emerald-700">المركز السعودي للأعمال</span>
      </span>
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-emerald-500 opacity-70 group-hover:opacity-100" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 17L17 7M17 7H8M17 7v9" />
      </svg>
    </a>
  );
}
