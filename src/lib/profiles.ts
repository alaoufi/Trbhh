import 'server-only';
import { cookies } from 'next/headers';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';
import { toInt } from './utils';
import { mediaUrl, PLACEHOLDER } from './media';
import { normTheme, themeHex } from './identity-themes';

/**
 * نظام هويات النشر المتعددة تحت دخول واحد.
 * كل «هوية» (profile) تتبع مستخدماً (user_id): شخصية أو متجر، ببياناتها المستقلة
 * (اسم ظاهر/جوال/واتساب/بريد/معرّف/صورة). الهوية الفعّالة تُحفظ في كوكي.
 */

const ensure = ensureSchema;
export const ACTIVE_PROFILE_COOKIE = 'trbhh_profile';
export const PROFILES_INTRO_COOKIE = 'trbhh_profiles_intro';

export type Profile = {
  id: number;
  userId: number;
  type: 'personal' | 'store';
  storeId: number | null;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  handle: string | null;
  avatar: number;
  avatarUrl: string;
  color: string | null;
  theme: string;
  isDefault: boolean;
  createdAt: string | null;
  paidUntil: string | null;
};

type Row = {
  id: bigint; user_id: bigint; type: string; store_id: bigint | null;
  name: string | null; phone: string | null; whatsapp: string | null;
  email: string | null; handle: string | null; avatar: number; color: string | null; is_default: number;
  theme?: string | null; created_at?: Date | null; paid_until?: Date | null;
};

async function avatarUrls(uploadIds: number[]): Promise<Map<number, string>> {
  const ids = [...new Set(uploadIds.filter((n) => n > 0))];
  if (!ids.length) return new Map();
  const ups = await prisma.uploads.findMany({ where: { id: { in: ids.map((n) => BigInt(n)) } }, select: { id: true, file_name: true } }).catch(() => []);
  return new Map(ups.map((u) => [toInt(u.id), u.file_name ? mediaUrl(u.file_name) : PLACEHOLDER]));
}

function toProfile(r: Row, avatarMap: Map<number, string>): Profile {
  return {
    id: toInt(r.id),
    userId: toInt(r.user_id),
    type: r.type === 'store' ? 'store' : 'personal',
    storeId: r.store_id ? toInt(r.store_id) : null,
    name: (r.name || 'حسابي').trim(),
    phone: r.phone || null,
    whatsapp: r.whatsapp || null,
    email: r.email || null,
    handle: r.handle || null,
    avatar: r.avatar || 0,
    avatarUrl: r.avatar ? (avatarMap.get(r.avatar) || PLACEHOLDER) : PLACEHOLDER,
    color: normColor(r.color) || (r.theme ? themeHex(r.theme) : null),
    theme: normTheme(r.theme),
    isDefault: r.is_default === 1,
    createdAt: r.created_at ? r.created_at.toISOString() : null,
    paidUntil: r.paid_until ? r.paid_until.toISOString() : null,
  };
}

/** لون سداسي صالح (#rgb أو #rrggbb) وإلا null. */
function normColor(v: string | null | undefined): string | null {
  const s = (v || '').trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s) ? s : null;
}

/** الهوية الشخصية الافتراضية للمستخدم — تُنشأ من بياناته الحالية إن لم توجد. */
export async function ensureDefaultProfile(userId: number): Promise<Profile> {
  await ensure();
  const existing = await prisma.profiles.findFirst({ where: { user_id: BigInt(userId), is_default: 1 } }).catch(() => null);
  if (existing) return toProfile(existing as Row, await avatarUrls([existing.avatar || 0]));
  const u = await prisma.users.findUnique({
    where: { id: BigInt(userId) },
    select: { name: true, userName: true, phoneNumber: true, phone_whatsapp: true, email: true },
  }).catch(() => null);
  const created = await prisma.profiles.create({
    data: {
      user_id: BigInt(userId), type: 'personal', is_default: 1,
      name: (u?.name || u?.userName || 'حسابي').slice(0, 120),
      phone: u?.phoneNumber || null, whatsapp: u?.phone_whatsapp || null, email: u?.email || null,
    },
  });
  return toProfile(created as Row, new Map());
}

/** يضمن وجود صف هوية «متجر» لكل متجر يملكه المستخدم (idempotent). */
async function syncStoreProfiles(userId: number): Promise<void> {
  const stores = await prisma.stores.findMany({
    where: { user_id: userId },
    select: { id: true, store_name: true, logo: true, store_phone: true, store_email: true },
  }).catch(() => []);
  for (const s of stores) {
    const exists = await prisma.profiles.findFirst({ where: { store_id: s.id } }).catch(() => null);
    if (exists) continue;
    await prisma.profiles.create({
      data: {
        user_id: BigInt(userId), type: 'store', store_id: s.id, is_default: 0,
        name: (s.store_name || 'متجري').slice(0, 120),
        phone: s.store_phone || null, email: s.store_email || null, avatar: s.logo || 0,
      },
    }).catch(() => {});
  }
}

/** كل هويات المستخدم (الشخصية + المتاجر) للمبدّل — تُنشئ الافتراضية وتزامن المتاجر. */
export async function getUserProfiles(userId: number): Promise<Profile[]> {
  await ensure();
  await ensureDefaultProfile(userId);
  await syncStoreProfiles(userId);
  const rows = await prisma.profiles.findMany({ where: { user_id: BigInt(userId) }, orderBy: [{ is_default: 'desc' }, { id: 'asc' }] }).catch(() => []);
  const avatarMap = await avatarUrls(rows.map((r) => r.avatar || 0));
  return rows.map((r) => toProfile(r as Row, avatarMap));
}

/** الهوية الفعّالة الحالية (من الكوكي، وإلا الافتراضية). */
export async function getActiveProfile(userId: number): Promise<Profile> {
  await ensure();
  const raw = (await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value || '';
  const wanted = Number(raw);
  if (wanted > 0) {
    const p = await prisma.profiles.findFirst({ where: { id: BigInt(wanted), user_id: BigInt(userId) } }).catch(() => null);
    if (p) return toProfile(p as Row, await avatarUrls([p.avatar || 0]));
  }
  return ensureDefaultProfile(userId);
}

/** بيانات هوية النشر لعرضها على الإعلان (بلا مزامنة) — أو null إن لم توجد. */
export async function getProfileDisplay(profileId: number): Promise<Profile | null> {
  if (!profileId || profileId <= 0) return null;
  await ensure();
  const p = await prisma.profiles.findUnique({ where: { id: BigInt(profileId) } }).catch(() => null);
  if (!p) return null;
  return toProfile(p as Row, await avatarUrls([p.avatar || 0]));
}

/** خريطة عرض هويات دفعة واحدة (للتعليقات/التقييمات) — تُرجع الهويات الشخصية غير الافتراضية فقط
 *  (الافتراضية تبقى ببيانات الحساب الحيّة تفادياً لتقادم الاسم). */
export async function getProfilesDisplayMap(profileIds: number[]): Promise<Map<number, { name: string; avatarUrl: string; color: string | null; handle: string | null }>> {
  const ids = [...new Set(profileIds.filter((n) => n > 0))];
  if (!ids.length) return new Map();
  await ensure();
  const rows = await prisma.profiles.findMany({ where: { id: { in: ids.map((n) => BigInt(n)) } } }).catch(() => []);
  const avatarMap = await avatarUrls(rows.map((r) => r.avatar || 0));
  const out = new Map<number, { name: string; avatarUrl: string; color: string | null; handle: string | null }>();
  for (const r of rows) {
    const p = toProfile(r as Row, avatarMap);
    if (p.type === 'personal' && !p.isDefault) out.set(p.id, { name: p.name, avatarUrl: p.avatar ? p.avatarUrl : '', color: p.color, handle: p.handle });
  }
  return out;
}

/** تعبئة جوال/واتساب/بريد هوية شخصية من أول إعلان يُنشر بها إن كانت فارغة (مرة واحدة). */
export async function backfillProfileContact(profileId: number, phone: string, whatsapp: string): Promise<void> {
  if (!profileId || (!phone && !whatsapp)) return;
  const p = await prisma.profiles.findUnique({ where: { id: BigInt(profileId) }, select: { phone: true, whatsapp: true } }).catch(() => null);
  if (!p) return;
  const data: { phone?: string; whatsapp?: string } = {};
  if (!p.phone && phone) data.phone = phone.slice(0, 24);
  if (!p.whatsapp && whatsapp) data.whatsapp = whatsapp.slice(0, 24);
  if (Object.keys(data).length) await prisma.profiles.update({ where: { id: BigInt(profileId) }, data }).catch(() => {});
}

/** عدّ هويات المستخدم (بلا مزامنة ثقيلة) — للهيدر. */
export async function countUserProfiles(userId: number): Promise<number> {
  await ensure();
  return prisma.profiles.count({ where: { user_id: BigInt(userId) } }).catch(() => 0);
}

export async function setActiveProfileCookie(profileId: number): Promise<void> {
  (await cookies()).set(ACTIVE_PROFILE_COOKIE, String(profileId), {
    httpOnly: false, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365,
  });
}

/** يطبّق قالب الهوية على الموقع (كوكي theme) — يُمسح للقالب الافتراضي. */
export async function setThemeCookie(theme: string | null | undefined): Promise<void> {
  const t = normTheme(theme);
  const c = await cookies();
  if (t) c.set('theme', t, { httpOnly: false, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
  else c.set('theme', '', { httpOnly: false, sameSite: 'lax', path: '/', maxAge: 0 });
}

/** قالب هوية العضو الافتراضية (لتطبيقه عند التبديل لحساب مرتبط). */
export async function defaultProfileTheme(userId: number): Promise<string> {
  await ensure();
  const p = await prisma.profiles.findFirst({ where: { user_id: BigInt(userId), is_default: 1 }, select: { theme: true } }).catch(() => null);
  return normTheme(p?.theme);
}

/** التحقق أن الهوية تخصّ المستخدم، وأنها شخصية (المتجر يُدار من إعداداته). */
async function ownedPersonalProfile(userId: number, profileId: number) {
  return prisma.profiles.findFirst({ where: { id: BigInt(profileId), user_id: BigInt(userId), type: 'personal' } }).catch(() => null);
}

type ProfileInput = { name: string; phone: string; whatsapp: string; email: string; handle: string; color?: string; theme?: string; avatar?: number };

export async function createPersonalProfile(userId: number, data: ProfileInput): Promise<{ ok: boolean; error?: string }> {
  await ensure();
  const name = data.name.trim().slice(0, 120);
  if (!name) return { ok: false, error: 'name' };
  const handle = normalizeHandle(data.handle);
  if (handle && !(await handleFree(handle, 0))) return { ok: false, error: 'handle' };
  await prisma.profiles.create({
    data: {
      user_id: BigInt(userId), type: 'personal', is_default: 0, name,
      phone: data.phone.trim().slice(0, 24) || null,
      whatsapp: data.whatsapp.trim().slice(0, 24) || null,
      email: data.email.trim().slice(0, 120) || null,
      handle: handle || null, avatar: data.avatar || 0, color: normColor(data.color), theme: normTheme(data.theme) || null,
    },
  });
  return { ok: true };
}

export async function updatePersonalProfile(userId: number, profileId: number, data: ProfileInput): Promise<{ ok: boolean; error?: string }> {
  await ensure();
  const p = await ownedPersonalProfile(userId, profileId);
  if (!p) return { ok: false, error: 'notfound' };
  const name = data.name.trim().slice(0, 120);
  if (!name) return { ok: false, error: 'name' };
  const handle = normalizeHandle(data.handle);
  if (handle && !(await handleFree(handle, profileId))) return { ok: false, error: 'handle' };
  await prisma.profiles.update({
    where: { id: BigInt(profileId) },
    data: {
      name, phone: data.phone.trim().slice(0, 24) || null,
      whatsapp: data.whatsapp.trim().slice(0, 24) || null,
      email: data.email.trim().slice(0, 120) || null,
      handle: handle || null, color: normColor(data.color), theme: normTheme(data.theme) || null,
      ...(data.avatar ? { avatar: data.avatar } : {}),
    },
  });
  return { ok: true };
}

/** حفظ قالب هوية شخصية فقط (بلا بقية الحقول) — للتطبيق الفوري عند اختيار اللون بلا زر حفظ. */
export async function setProfileTheme(userId: number, profileId: number, theme: string): Promise<boolean> {
  await ensure();
  const p = await ownedPersonalProfile(userId, profileId);
  if (!p) return false;
  await prisma.profiles.update({ where: { id: BigInt(profileId) }, data: { theme: normTheme(theme) || null } }).catch(() => {});
  return true;
}

/** حذف هوية شخصية غير افتراضية — إعلاناتها تبقى (تُنسب لاحقاً بهويتها المحفوظة). */
export async function deletePersonalProfile(userId: number, profileId: number): Promise<boolean> {
  await ensure();
  const p = await ownedPersonalProfile(userId, profileId);
  if (!p || p.is_default === 1) return false;
  await prisma.profiles.delete({ where: { id: BigInt(profileId) } }).catch(() => {});
  return true;
}

function normalizeHandle(v: string): string {
  return (v || '').trim().replace(/^@+/, '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 32);
}

async function handleFree(handle: string, exceptProfileId: number): Promise<boolean> {
  const inProfiles = await prisma.profiles.findFirst({ where: { handle, ...(exceptProfileId ? { id: { not: BigInt(exceptProfileId) } } : {}) }, select: { id: true } }).catch(() => null);
  if (inProfiles) return false;
  // فضاء معرّفات موحّد: لا يتصادم معرّف الهوية مع معرّف متجر ولا مع اسم دخول متجر (منع الازدواجية)
  const inStores = await prisma.stores.findFirst({ where: { OR: [{ handle }, { store_username: handle }] }, select: { id: true } }).catch(() => null);
  return !inStores;
}


