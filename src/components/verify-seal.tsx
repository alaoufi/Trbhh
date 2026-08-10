/**
 * عنصر ختم التوثيق «متجر موثّق» — المركز السعودي للأعمال.
 *
 * هذا ختمٌ عائم يُثبِّته سكربت المركز الرسمي في زاوية الصفحة (data-position="bottom-left")،
 * وليس عنصراً يُدرَج داخل الهيدر. لذلك يُصيَّر **نسخةً واحدة فقط** على مستوى التخطيط العام
 * (src/app/layout.tsx) — تكراره يربك السكربت. seal.js يُحمَّل async بعد رسم الصفحة فيجد
 * العنصر (المُصيَّر من الخادم) ويرسم الشارة فيه. يجب مطابقة كود التضمين الرسمي حرفياً:
 * الكلاس واسم الرمز والموضع كما تعطيها لوحة المركز — أي اختلاف يمنع الرسم.
 */
export function VerifySeal({ className = '' }: { className?: string }) {
  return (
    <div
      className={`sbc-verify-seal ${className}`.trim()}
      data-token="dklvcSt3ZUxBNGwrRlQ5TTN4SjBxdz09"
      data-position="bottom-left"
    />
  );
}
