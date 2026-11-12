/** Bcrypt accepts at most 72 UTF-8 bytes; never silently truncate a new password. */
// تسهيل على الأعضاء (قرار المالك): الحدّ الأدنى ٤ خانات فقط، وبلا أي قيود تعقيد —
// للعضو حرية الاختيار (أرقام فقط/أحرف/رموز)، ولا يُمنع تكرار الحرف أو اختيار شائع.
// الإدارة تستطيع رفع الحدّ من الإعدادات إن رغبت (passwordMinimum).
export const PASSWORD_MIN_LENGTH = 4;
export function passwordPolicyError(password: string, minimum = PASSWORD_MIN_LENGTH): string | null {
  const min = Math.max(PASSWORD_MIN_LENGTH, Math.min(64, Math.floor(minimum) || PASSWORD_MIN_LENGTH));
  if ([...password].length < min) return `كلمة المرور ${min} خانات على الأقل.`;
  if (new TextEncoder().encode(password).length > 72) return 'كلمة المرور طويلة جداً؛ اختصرها قليلاً.';
  return null;
}
