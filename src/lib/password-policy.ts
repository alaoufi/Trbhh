/** Bcrypt accepts at most 72 UTF-8 bytes; never silently truncate a new password. */
export const PASSWORD_MIN_LENGTH = 12;
export function passwordPolicyError(password: string, minimum = PASSWORD_MIN_LENGTH): string | null {
  const min = Math.max(PASSWORD_MIN_LENGTH, Math.min(64, Math.floor(minimum) || PASSWORD_MIN_LENGTH));
  if ([...password].length < min) return `كلمة المرور ${min} حرفاً على الأقل؛ استخدم عبارة طويلة يسهل عليك تذكرها.`;
  if (new TextEncoder().encode(password).length > 72) return 'كلمة المرور تتجاوز 72 بايت؛ اختصر العبارة دون النزول عن الحد الأدنى.';
  if (/^\p{N}+$/u.test(password) || /^(.)\1+$/u.test(password) || /^(password|qwerty|123456|كلمة المرور)+[\d!@#$]*$/i.test(password)) return 'اختر عبارة مرور غير شائعة، وليست أرقاماً فقط أو حرفاً مكرراً.';
  return null;
}
