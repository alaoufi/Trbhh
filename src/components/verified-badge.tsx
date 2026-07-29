/**
 * شارة «متجر موثّق» بتصميم المنصّة — عنصر ثابت داخل المحتوى (يظهر دائماً، لا يعتمد على
 * سكربت المركز المتذبذب). تعبّر عن حالة توثيق حقيقية (المنصّة موثّقة لدى المركز السعودي
 * للأعمال). ختم المركز الرسمي العائم يبقى مستقلاً في زاوية الصفحة كمصدر تحقّق رسمي.
 */
export function VerifiedBadge({ className = '' }: { className?: string }) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-gradient-to-l from-emerald-50 to-white px-4 py-1.5 shadow-sm ${className}`.trim()}
      title="متجر موثّق لدى المركز السعودي للأعمال"
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-600 text-white">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2l7 3v6c0 4.4-3 8.4-7 9-4-.6-7-4.6-7-9V5l7-3z" fill="currentColor" stroke="none" opacity="0.18" />
          <path d="M12 2l7 3v6c0 4.4-3 8.4-7 9-4-.6-7-4.6-7-9V5l7-3z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      </span>
      <span className="flex flex-col leading-tight">
        <b className="text-[13px] font-extrabold text-emerald-800">متجر موثّق</b>
        <span className="text-[10px] font-medium text-emerald-700">المركز السعودي للأعمال</span>
      </span>
    </div>
  );
}
