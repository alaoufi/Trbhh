/**
 * عنصر ختم التوثيق «متجر موثّق» — المركز السعودي للأعمال. يُصيَّر من الخادم (موجود في HTML
 * الأولي)، وسكربت seal.js يُحمَّل مبكراً (beforeInteractive في التخطيط) فيجده ويرسم الشارة فيه.
 */
export function VerifySeal({ className = '' }: { className?: string }) {
  return <div className={`sbc-verify-seal ${className}`} data-token="dklvcSt3ZUxBNGwrRlQ5TTN4SjBxdz09" />;
}
