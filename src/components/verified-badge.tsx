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
    // رابط ختم المركز الرسمي (يرسمه seal.js) — هو صفحة التحقّق الدقيقة لهذا الختم.
    const official = document.querySelector(
      '.sbc-verify-seal a[href*="saudibusiness.gov.sa"], a[href*="saudibusiness.gov.sa"]',
    ) as HTMLAnchorElement | null;
    if (official) {
      e.preventDefault();
      official.click(); // يفتح تحقّق المركز الرسمي كما لو نُقر الختم مباشرة
    }
    // وإلا: يُترك سلوك الرابط الافتراضي (بديل ثابت لموقع المركز) يعمل.
  };

  return (
    <a
      href={SBC_VERIFY_URL}
      target="_blank"
      rel="noopener noreferrer"
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
