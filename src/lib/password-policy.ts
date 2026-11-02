/**
 * سياسة كلمة المرور بقرار المالك (2026-11-02): التسهيل وجلب العملاء.
 * 4 خانات على الأقل، وأي خليط يريده العضو (أحرف، أرقام، رموز)، بلا شروط تعقيد.
 * الإدارة تستطيع رفع الحد من إعدادات الأمان. Bcrypt يقبل 72 بايت كحد أقصى؛ لا نقص الكلمة بصمت.
 */
export const PASSWORD_MIN_LENGTH = 4;
export function passwordPolicyError(password: string, minimum = PASSWORD_MIN_LENGTH): string | null {
  const min = Math.max(PASSWORD_MIN_LENGTH, Math.min(64, Math.floor(minimum) || PASSWORD_MIN_LENGTH));
  if ([...password].length < min) return `كلمة المرور ${min} خانات على الأقل (أحرف أو أرقام أو رموز).`;
  if (new TextEncoder().encode(password).length > 72) return 'كلمة المرور طويلة جداً؛ اختصرها.';
  return null;
}
