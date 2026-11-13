import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/** مفاتيح إعدادات تحمل أسرار بوابات خارجية: تُخزَّن مشفّرة في القاعدة (AES-256-GCM)
 *  فلا تنكشف من نسخة احتياطية أو قراءة مباشرة للجدول. المفتاح مشتق من AUTH_SECRET. */
export const SECRET_SETTING_KEYS = new Set(['sms_password', 'wa_token', 'vapid_private', 'cj_deepl_api_key', 'cj_libretranslate_key']);
const PREFIX = 'enc:v1:';

function key(secret = process.env.AUTH_SECRET || ''): Buffer | null {
  return secret.length >= 32 ? createHash('sha256').update('trbhh:settings:v1:' + secret).digest() : null;
}

export const isSealed = (value: string | null | undefined): boolean => !!value && value.startsWith(PREFIX);

/** يشفّر القيمة. بلا AUTH_SECRET صالح تُعاد كما هي (لا نكسر الحفظ في بيئة غير مهيأة). */
export function sealSetting(k: string, plain: string, secret?: string): string {
  const kk = key(secret);
  if (!plain || !kk || isSealed(plain)) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', kk, iv);
  cipher.setAAD(Buffer.from('trbhh:setting:' + k));
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return PREFIX + [iv, cipher.getAuthTag(), data].map((x) => x.toString('base64url')).join('.');
}

/** يفكّ القيمة المشفّرة؛ القيمة غير المشفّرة (قديمة) تُعاد كما هي، والتالفة تُعاد فارغة. */
export function openSetting(k: string, stored: string | null, secret?: string): string | null {
  if (!isSealed(stored)) return stored;
  try {
    const kk = key(secret);
    const parts = stored!.slice(PREFIX.length).split('.');
    if (!kk || parts.length !== 3) return '';
    const [iv, tag, data] = parts.map((x) => Buffer.from(x, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', kk, iv, { authTagLength: 16 });
    decipher.setAAD(Buffer.from('trbhh:setting:' + k));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch { return ''; }
}
