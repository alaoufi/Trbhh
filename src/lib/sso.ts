import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { redis } from './redis';
import { prisma } from './prisma';
import { toLocalSaudi } from './sms';
import { isUserBanned } from './moderation';
import { toInt } from './utils';

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

/* ─────────────────────────── إيجاد/إنشاء الحساب المحلي ─────────────────────────── */

/** إيجاد العضو بالجوال بأي صيغة مخزّنة (يطابق منطق الدخول الموحّد). */
export async function findUserByPhone(local: string, raw: string) {
  let user = await prisma.users.findFirst({
    where: { OR: [{ phoneNumber: local }, { userName: local }, { phoneNumber: raw }] },
  });
  if (user) return user;
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 8) {
    let sig = digits.startsWith('966') ? digits.slice(3) : digits;
    sig = sig.replace(/^0+/, '');
    const forms = [sig, `0${sig}`, `966${sig}`, `00966${sig}`, `+966${sig}`];
    const rows = await prisma
      .$queryRawUnsafe<{ id: bigint }[]>(
        `SELECT id FROM users
         WHERE REPLACE(REPLACE(REPLACE(IFNULL(phoneNumber,''),' ',''),'-','') , '+','') IN (?,?,?,?,?)
         ORDER BY id LIMIT 1`,
        forms[0], forms[1], forms[2], forms[3], forms[4],
      )
      .catch(() => [] as { id: bigint }[]);
    if (rows[0]) user = await prisma.users.findUnique({ where: { id: rows[0].id } });
  }
  return user;
}

export type ResolveResult =
  | { user: { id: bigint; name: string | null; userName: string | null; type: string } }
  | { blocked: 'admin' | 'merged' | 'banned' };

/**
 * يجد نسخة العضو المحلية أو ينشئها من مطالبات النظير، مع مزامنة بصمة كلمة المرور.
 * الإداري/المدموج/المحظور لا يُقبل (يُوجَّه للدخول المباشر). لا يفتح جلسة —
 * الاستدعاء المسؤول عن ذلك.
 */
export async function resolveLocalUser(claims: HandoffClaims): Promise<ResolveResult> {
  const local = toLocalSaudi(claims.phone) || claims.phone.trim();
  const existing = await findUserByPhone(local, claims.phone.trim());

  if (existing) {
    // أمان: الإداري لا يُفتح عن بُعد، والمدموج/المحظور يُوجَّه للدخول المباشر
    if (Number(existing.is_admin) === 1 || String(existing.type) === 'admin') return { blocked: 'admin' };
    if (existing.merged_into && Number(existing.merged_into) > 0) return { blocked: 'merged' };
    if (await isUserBanned(toInt(existing.id))) return { blocked: 'banned' };
    // مزامنة بصمة كلمة المرور: أي تغيير على الموقع الآخر يسري هنا للدخول المباشر
    if (claims.pwhash && claims.pwhash !== existing.password) {
      await prisma.users
        .update({ where: { id: existing.id }, data: { password: claims.pwhash } })
        .catch(() => {});
    }
    return { user: existing };
  }

  // إنشاء نسخة محلية للحساب (عضو عادي فقط — لا ترقية إدارية عبر SSO)
  const created = await prisma.users.create({
    data: {
      name: claims.name || 'عضو',
      userName: local,
      phoneNumber: local,
      password: claims.pwhash, // بصمة bcrypt كما هي — الدخول المباشر بنفس كلمة المرور يعمل
      type: 'user',
      ban: 'no',
      trusted: 0,
      allow_phone: 1,
      whatsapp: 1,
      step: 0,
      forget: 0,
      is_admin: 0,
    },
  });
  return { user: created };
}

/* ───────────────────────── الدخول المباشر الفيدرالي (خادم-لخادم) ───────────────────────── */

/** رمز خدمة قصير العمر (٦٠ث) يوثّق طلب `/sso/verify` بين النشرتين. */
export async function signServiceToken(): Promise<string> {
  return new SignJWT({ svc: 'verify' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('60s')
    .sign(secretKey());
}

/** تحقّق من رمز الخدمة الوارد على `/sso/verify`. */
export async function verifyServiceToken(token: string): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { clockTolerance: 5 });
    return payload.svc === 'verify';
  } catch {
    return false;
  }
}

/**
 * الدخول المباشر الفيدرالي: عند فشل الدخول محلياً، اسأل كل نظير عبر `/sso/verify`
 * إن كانت البيانات صحيحة عنده. يُعيد مطالبات الحساب لإنشائه محلياً، أو null.
 * يتحمّل تعطّل/بطء النظير بسلاسة (مهلة قصيرة) فيسقط لرسالة الدخول العادية.
 */
export async function federatedVerify(identifier: string, password: string): Promise<HandoffClaims | null> {
  if (!ssoEnabled()) return null;
  const bearer = await signServiceToken();
  for (const origin of ssoPeers()) {
    try {
      const res = await fetch(`${origin}/sso/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
        body: JSON.stringify({ identifier, password }),
        signal: AbortSignal.timeout(4000),
        cache: 'no-store',
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        ok?: boolean; admin?: boolean; phone?: string; name?: string; pwhash?: string | null;
      };
      // الإداري لا يُوحَّد أبداً عبر SSO — يدخل مباشرة على موقعه
      if (data.ok && !data.admin && data.phone) {
        return { phone: data.phone, name: data.name || 'عضو', pwhash: data.pwhash ?? null };
      }
    } catch {
      /* نظير غير متاح/بطيء — جرّب التالي ثم اسقط للرسالة العادية */
    }
  }
  return null;
}
