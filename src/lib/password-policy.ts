/** Bcrypt accepts at most 72 UTF-8 bytes; never silently truncate a new password. */
export const PASSWORD_MIN_LENGTH = 6;
export function passwordPolicyError(password: string, minimum = PASSWORD_MIN_LENGTH): string | null {
  const min = Math.max(PASSWORD_MIN_LENGTH, Math.min(64, Math.floor(minimum) || PASSWORD_MIN_LENGTH));
  if ([...password].length < min) return `كلمة المرور ${min} حرفاً على الأقل؛ استخدم عبارة طويلة يسهل عليك تذكرها.`;
  if (new TextEncoder().encode(password).length > 72) return 'كلمة المرور تتجاوز 72 بايت؛ اختصر العبارة دون النزول عن الحد الأدنى.';
  return null;
}
