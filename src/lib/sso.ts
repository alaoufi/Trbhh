import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { redis } from './redis';

/**
 * الدخول الموحّد بين نشرتَي المنصّة (تربح ⇄ عقار).
 *
 * لا قاعدة بيانات مشتركة — كل نشرة تبقى بقاعدتها. بدلاً من ذلك نُسلّم بين
 * الموقعين «رمز تسليم» موقّعاً قصير العمر (٩٠ث، أحادي الاستخدام) يحمل هوية
 * العضو وبصمة كلمة مروره (bcrypt، لا كلمة المرور الخام). الموقع المستقبِل
 * يتحقّق من الرمز، ثم ينشئ نسخة محلية للحساب إن لم توجد (مع مزامنة البصمة)
 * ويفتح جلسة محلية. النتيجة: حساب واحد يعمل على الموقعين.
 *
 * السرّ `SSO_SECRET` مشترك بين النشرتين ومنفصل عن `AUTH_SECRET` (كل نشرة
 * تحتفظ بمفتاح جلساتها الخاص — أأمن). الميزة خاملة تماماً حتى يُضبط السرّ
 * وقائمة النظراء `SSO_PEERS`، فلا تغيّر أي سلوك قائم قبل التفعيل.
 */

const SSO_SECRET = process.env.SSO_SECRET || '';
const TTL_SECONDS = 90;

/** أصول النظراء المسموح التسليم إليها/منها (مفصولة بفواصل في `SSO_PEERS`). */
export function ssoPeers(): string[] {
  return (process.env.SSO_PEERS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/** هل الدخول الموحّد مُفعّل على هذه النشرة؟ (سرّ قوي + نظير واحد على الأقل) */
export function ssoEnabled(): boolean {
  return SSO_SECRET.length >= 16 && ssoPeers().length > 0;
}

/** هل الأصل المُعطى ضمن النظراء المسموح بهم؟ */
export function isAllowedPeer(origin: string): boolean {
  const norm = origin.trim().replace(/\/+$/, '');
  return ssoPeers().includes(norm);
}

export type HandoffClaims = {
  /** رقم الجوال بالصيغة المخزّنة على الموقع المُرسِل (يُعاد تقييسه عند الاستقبال). */
  phone: string;
  name: string;
  /** بصمة bcrypt لكلمة المرور — لمزامنة الدخول المباشر لاحقاً (لا كلمة مرور خام). */
  pwhash: string | null;
};

const secretKey = () => new TextEncoder().encode(SSO_SECRET);

/** وقّع رمز تسليم قصير العمر أحادي الاستخدام. */
export async function signHandoff(claims: HandoffClaims): Promise<string> {
  const jti =
    (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new SignJWT({ phone: claims.phone, name: claims.name, pwhash: claims.pwhash ?? null })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setJti(jti)
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(secretKey());
}

/**
 * تحقّق من رمز التسليم واستهلكه (أحادي الاستخدام عبر Redis عند توفّره).
 * يُعيد المطالبات عند الصحّة، أو null عند الفشل/انتهاء الصلاحية/إعادة الاستخدام.
 */
export async function verifyHandoff(token: string): Promise<HandoffClaims | null> {
  if (!token || !ssoEnabled()) return null;
  let payload: Record<string, unknown>;
  let jti: string | undefined;
  try {
    const res = await jwtVerify(token, secretKey(), { clockTolerance: 5 });
    payload = res.payload as Record<string, unknown>;
    jti = res.payload.jti;
  } catch {
    return null;
  }
  // منع إعادة الاستخدام: أول استهلاك ينجح فقط. بلا Redis نكتفي بعمر الرمز القصير.
  if (jti && redis) {
    try {
      const ok = await redis.set(`sso:jti:${jti}`, '1', 'EX', TTL_SECONDS + 10, 'NX');
      if (ok !== 'OK') return null; // مُستهلَك سلفاً
    } catch {
      /* تجاهل — نسقط لحماية عمر الرمز فقط */
    }
  }
  const phone = typeof payload.phone === 'string' ? payload.phone : '';
  const name = typeof payload.name === 'string' ? payload.name : '';
  if (!phone) return null;
  return { phone, name, pwhash: typeof payload.pwhash === 'string' ? payload.pwhash : null };
}
