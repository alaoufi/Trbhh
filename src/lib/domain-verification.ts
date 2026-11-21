/**
 * رمز إثبات ملكية النطاق (المركز السعودي للأعمال، طريقة Meta Tag).
 * يقبل الرمز وحده أو الوسم كاملاً كما تعطيه المنصة، ويعيد الرمز فقط.
 * حروف وأرقام ورموز آمنة فقط، فلا يدخل نص الإدارة وسوماً في رأس الصفحة.
 */
export function cleanDomainVerification(input: string): string {
  let v = (input || '').trim();
  const tag = v.match(/content\s*=\s*["']([^"']*)["']/i);
  if (tag) v = tag[1].trim();
  return /^[A-Za-z0-9._=+\/:-]{1,200}$/.test(v) ? v : '';
}
