import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';

/**
 * تقرير نزاهة الهويات (قراءة فقط): يكشف أي ازدواجية أو اختلاط/تداخل سابق بين الحسابات
 * والمتاجر والهويات — دون أي تعديل على البيانات. الغاية أن ترى الإدارة الواقع الفعلي
 * قبل أي إصلاح. كل فحص محميّ بـ try/catch فلا يُعطّل بقيّة التقرير.
 */

export type IntegrityFinding = {
  key: string;
  label: string;
  count: number;
  samples: string[]; // أمثلة مختصرة للفحص اليدوي
  severity: 'high' | 'medium' | 'low';
  hint: string; // ماذا يعني وكيف يُصلَح
};

type RawCount = { c: bigint | number };

const n = (v: bigint | number | null | undefined) => Number(v ?? 0);

/** ازدواجية الهوية الوطنية: حسابات مختلفة بنفس رقم الهوية = نفس الشخص بأكثر من حساب. */
async function dupNationalId(): Promise<IntegrityFinding> {
  let count = 0; const samples: string[] = [];
  try {
    const rows = await prisma.$queryRawUnsafe<{ national_identity: number; c: bigint }[]>(
      `SELECT national_identity, COUNT(*) c FROM users
       WHERE national_identity IS NOT NULL AND national_identity > 0
       GROUP BY national_identity HAVING COUNT(*) > 1 ORDER BY c DESC LIMIT 50`,
    );
    count = rows.length;
    for (const r of rows.slice(0, 8)) samples.push(`هوية ${r.national_identity} → ${n(r.c)} حسابات`);
  } catch { /* ignore */ }
  return { key: 'dup_national', label: 'ازدواجية الهوية الوطنية', count, samples, severity: 'high',
    hint: 'رقم هوية وطنية واحد على أكثر من حساب. الأصل حساب واحد للشخص — تُوحَّد بالربط المستقل (لا الدمج) أو يُحذف المكرّر الفارغ.' };
}

/** ازدواجية الجوال بعد التطبيع (آخر ٩ أرقام). */
async function dupPhone(): Promise<IntegrityFinding> {
  let count = 0; const samples: string[] = [];
  try {
    const rows = await prisma.$queryRawUnsafe<{ sig: string; c: bigint }[]>(
      `SELECT RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(phoneNumber,''),' ',''),'-',''),'+',''),'') , 9) sig, COUNT(*) c
       FROM users WHERE phoneNumber IS NOT NULL AND CHAR_LENGTH(REPLACE(phoneNumber,' ','')) >= 8
       GROUP BY sig HAVING COUNT(*) > 1 ORDER BY c DESC LIMIT 50`,
    );
    count = rows.length;
    for (const r of rows.slice(0, 8)) samples.push(`جوال …${r.sig} → ${n(r.c)} حسابات`);
  } catch { /* ignore */ }
  return { key: 'dup_phone', label: 'ازدواجية رقم الجوال', count, samples, severity: 'high',
    hint: 'نفس الجوال على أكثر من حساب. مسموح دخول موحّد لهذه الحسابات (ربط مستقل) لكن لا يجوز تكرار الهوية — راجِعها.' };
}

/** ازدواجية اسم الدخول (userName). */
async function dupUserName(): Promise<IntegrityFinding> {
  let count = 0; const samples: string[] = [];
  try {
    const rows = await prisma.$queryRawUnsafe<{ userName: string; c: bigint }[]>(
      `SELECT userName, COUNT(*) c FROM users
       WHERE userName IS NOT NULL AND userName <> '' GROUP BY userName HAVING COUNT(*) > 1 ORDER BY c DESC LIMIT 50`,
    );
    count = rows.length;
    for (const r of rows.slice(0, 8)) samples.push(`«${r.userName}» → ${n(r.c)} حسابات`);
  } catch { /* ignore */ }
  return { key: 'dup_username', label: 'ازدواجية اسم الدخول', count, samples, severity: 'medium',
    hint: 'اسم دخول واحد على أكثر من حساب — يجب أن يكون فريداً. سيُطبَّق منع التكرار على الجدد؛ راجِع القدامى.' };
}

/** ازدواجية البريد الإلكتروني. */
async function dupEmail(): Promise<IntegrityFinding> {
  let count = 0; const samples: string[] = [];
  try {
    const rows = await prisma.$queryRawUnsafe<{ email: string; c: bigint }[]>(
      `SELECT email, COUNT(*) c FROM users
       WHERE email IS NOT NULL AND email <> '' GROUP BY email HAVING COUNT(*) > 1 ORDER BY c DESC LIMIT 50`,
    );
    count = rows.length;
    for (const r of rows.slice(0, 8)) samples.push(`${r.email} → ${n(r.c)} حسابات`);
  } catch { /* ignore */ }
  return { key: 'dup_email', label: 'ازدواجية البريد', count, samples, severity: 'low',
    hint: 'بريد واحد على أكثر من حساب. غالباً حسابات لنفس المالك — تُربط لا تُدمج.' };
}

/** اختلاط: حساب واحد يملك أكثر من متجر بأرقام هوية وطنية مختلفة (مالكون مختلفون على حساب واحد). */
async function multiOwnerStores(): Promise<IntegrityFinding> {
  let count = 0; const samples: string[] = [];
  try {
    const rows = await prisma.$queryRawUnsafe<{ user_id: number; stores: bigint; ids: bigint }[]>(
      `SELECT user_id, COUNT(*) stores, COUNT(DISTINCT NULLIF(national_id,'')) ids
       FROM stores GROUP BY user_id HAVING COUNT(*) > 1 AND COUNT(DISTINCT NULLIF(national_id,'')) > 1
       ORDER BY stores DESC LIMIT 50`,
    );
    count = rows.length;
    for (const r of rows.slice(0, 8)) samples.push(`حساب #${r.user_id}: ${n(r.stores)} متاجر بـ${n(r.ids)} هويات مختلفة`);
  } catch { /* ignore */ }
  return { key: 'multi_owner_stores', label: 'متاجر لمالكين مختلفين على حساب واحد', count, samples, severity: 'high',
    hint: 'متاجر بأرقام هوية مختلفة على حساب بشري واحد — اختلاط: كلها معرّضة لحظر واحد. الأصل فصلها لحسابات مستقلة مرتبطة.' };
}

/** حسابات مدموجة (صُهرت في حساب آخر عبر آلية الدمج المعطَّلة الآن). */
async function mergedAccounts(): Promise<IntegrityFinding> {
  let count = 0; const samples: string[] = [];
  try {
    const rows = await prisma.users.findMany({
      where: { merged_into: { not: null } }, select: { id: true, merged_into: true }, take: 50,
    }).catch(() => [] as { id: bigint; merged_into: bigint | null }[]);
    count = rows.length;
    for (const r of rows.slice(0, 8)) samples.push(`حساب #${Number(r.id)} مدموج في #${Number(r.merged_into)}`);
  } catch { /* ignore */ }
  return { key: 'merged_accounts', label: 'حسابات مدموجة (تداخل سابق)', count, samples, severity: 'high',
    hint: 'حسابات صُهرت في غيرها (نُقلت متاجرها/إعلاناتها). الدمج مُعطَّل الآن؛ هذه بقايا تداخل قديم قد ترغب بفكّها لاستقلالية تامة.' };
}

/** إعلانات هويتها لا تخصّ صاحبها: profile.user_id ≠ ads.user_id. */
async function misattributedAds(): Promise<IntegrityFinding> {
  let count = 0; const samples: string[] = [];
  try {
    const cnt = await prisma.$queryRawUnsafe<RawCount[]>(
      `SELECT COUNT(*) c FROM ads a JOIN profiles p ON p.id = a.profile_id
       WHERE a.profile_id IS NOT NULL AND p.user_id <> a.user_id`,
    );
    count = n(cnt[0]?.c);
    if (count > 0) {
      const rows = await prisma.$queryRawUnsafe<{ id: bigint; user_id: bigint; owner: bigint }[]>(
        `SELECT a.id, a.user_id, p.user_id owner FROM ads a JOIN profiles p ON p.id = a.profile_id
         WHERE a.profile_id IS NOT NULL AND p.user_id <> a.user_id LIMIT 8`,
      );
      for (const r of rows) samples.push(`إعلان #${Number(r.id)}: مالكه #${Number(r.user_id)} لكن هويته لحساب #${Number(r.owner)}`);
    }
  } catch { /* ignore */ }
  return { key: 'misattributed_ads', label: 'إعلانات بهوية نشرٍ لحساب آخر', count, samples, severity: 'medium',
    hint: 'إعلان يُملَك بحساب لكن هويته المعروضة تعود لحساب مختلف — أثر تداخل. الإصلاح: إعادة الهوية لصاحبها أو تصفير profile_id.' };
}

/** تصادم المعرّفات: معرّف هوية شخصية يساوي معرّف متجر أو اسم دخول متجر. */
async function handleCollisions(): Promise<IntegrityFinding> {
  let count = 0; const samples: string[] = [];
  try {
    const dupProfileHandles = await prisma.$queryRawUnsafe<{ handle: string; c: bigint }[]>(
      `SELECT handle, COUNT(*) c FROM profiles WHERE handle IS NOT NULL AND handle <> ''
       GROUP BY handle HAVING COUNT(*) > 1 LIMIT 25`,
    );
    for (const r of dupProfileHandles) { count++; samples.push(`معرّف هوية «${r.handle}» مكرّر ×${n(r.c)}`); }
    const cross = await prisma.$queryRawUnsafe<{ handle: string }[]>(
      `SELECT p.handle FROM profiles p
       WHERE p.handle IS NOT NULL AND p.handle <> ''
       AND (EXISTS (SELECT 1 FROM stores s WHERE s.handle = p.handle)
            OR EXISTS (SELECT 1 FROM stores s2 WHERE s2.store_username = p.handle)) LIMIT 25`,
    );
    for (const r of cross) { count++; if (samples.length < 8) samples.push(`معرّف هوية «${r.handle}» يصادم معرّف/اسم متجر`); }
  } catch { /* ignore */ }
  return { key: 'handle_collisions', label: 'تصادم معرّفات الهويات والمتاجر', count, samples, severity: 'medium',
    hint: 'معرّف هوية يساوي معرّف/اسم متجر — ازدواجية معرّف. مُنع على الجدد؛ أعِد تسمية المكرّر القديم.' };
}

/** التقرير الكامل (قراءة فقط). */
export async function getIntegrityReport(): Promise<IntegrityFinding[]> {
  await ensureSchema();
  const findings = await Promise.all([
    dupNationalId(), dupPhone(), dupUserName(), dupEmail(),
    multiOwnerStores(), mergedAccounts(), misattributedAds(), handleCollisions(),
  ]);
  return findings;
}
