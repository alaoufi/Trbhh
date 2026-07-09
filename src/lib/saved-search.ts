import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';
import { getSettingBool } from './settings';
import { toInt } from './utils';

const ensure = ensureSchema;

/* مفاتيح التفعيل — من لوحة التحكم ← الإعدادات. */
export const SETTING_SEARCH_SUGGEST_ON = 'search_suggest_on';
export const SETTING_SAVED_SEARCH_ON = 'saved_search_on';
export const SETTING_MATCH_NOTIFY_ON = 'match_notify_on';

export const matchNotifyEnabled = () => getSettingBool(SETTING_MATCH_NOTIFY_ON, false);

export const searchSuggestEnabled = () => getSettingBool(SETTING_SEARCH_SUGGEST_ON, true);
export const savedSearchEnabled = () => getSettingBool(SETTING_SAVED_SEARCH_ON, true);

/** تطبيع عربي خفيف للمطابقة: توحيد الألف/الهاء/الياء وإزالة التشكيل. */
export function normalizeAr(s: string): string {
  return (s || '')
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase()
    .trim();
}

export type SavedSearch = { id: number; query: string; at: string | null };

export async function listSavedSearches(userId: number): Promise<SavedSearch[]> {
  await ensure();
  const rows = await prisma.saved_searches.findMany({ where: { user_id: BigInt(userId) }, orderBy: { id: 'desc' }, take: 10 }).catch(() => []);
  return rows.map((r) => ({ id: toInt(r.id), query: r.query, at: r.created_at ? r.created_at.toISOString() : null }));
}

/** حفظ بحث (حتى ١٠ لكل عضو، بلا تكرار). */
export async function saveSearch(userId: number, query: string): Promise<boolean> {
  await ensure();
  const q = query.trim().slice(0, 120);
  if (q.length < 2) return false;
  const existing = await prisma.saved_searches.findMany({ where: { user_id: BigInt(userId) }, take: 10 }).catch(() => []);
  if (existing.length >= 10) return false;
  if (existing.some((r) => normalizeAr(r.query) === normalizeAr(q))) return true;
  await prisma.saved_searches.create({ data: { user_id: BigInt(userId), query: q } }).catch(() => {});
  return true;
}

export async function deleteSavedSearch(userId: number, id: number): Promise<void> {
  await ensure();
  await prisma.saved_searches.deleteMany({ where: { id: BigInt(id), user_id: BigInt(userId) } }).catch(() => {});
}

/** عند نشر إعلان جديد: نبّه أصحاب البحوث المحفوظة المطابقة (رسالة إدارية + تنبيه فوري).
 *  كتم لكل بحث: مرة كل ساعة كحد أقصى، وحتى ٣٠ تنبيهاً لكل إعلان. */
export async function notifySavedSearches(adId: number, title: string, detail: string, authorId: number): Promise<void> {
  try {
    if (!(await savedSearchEnabled())) return;
    await ensure();
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const rows = await prisma.saved_searches.findMany({
      where: { user_id: { not: BigInt(authorId) }, OR: [{ notified_at: null }, { notified_at: { lt: hourAgo } }] },
      take: 500,
    }).catch(() => []);
    if (!rows.length) return;
    const hay = normalizeAr(`${title} ${detail}`);
    const matched = rows.filter((r) => {
      const tokens = normalizeAr(r.query).split(/\s+/).filter((t) => t.length >= 2);
      return tokens.length > 0 && tokens.every((t) => hay.includes(t));
    }).slice(0, 30);
    if (!matched.length) return;
    const [{ getPrimaryAdminId }, { sendChat }, { SITE }] = await Promise.all([
      import('./admin-inbox'), import('./chat'), import('./constants'),
    ]);
    const adminId = await getPrimaryAdminId().catch(() => 0);
    if (!adminId) return;
    const link = `https://${SITE.domain}/ads/${adId}`;
    const now = new Date();
    for (const r of matched) {
      const uid = toInt(r.user_id);
      if (uid === adminId) continue;
      await sendChat(adminId, uid, `🔔 إعلان جديد يطابق بحثك المحفوظ «${r.query}»:\n${title.slice(0, 80)}\n${link}`).catch(() => {});
      await prisma.saved_searches.update({ where: { id: r.id }, data: { notified_at: now } }).catch(() => {});
    }
  } catch { /* لا يعطّل نشر الإعلان */ }
}

/** «مطلوب يبحث عنك»: عند نشر طلب، نبّه أصحاب العروض النشطة في نفس القسم والمدينة (والعكس).
 *  حدود ضد الإزعاج: نفس القسم + نفس المدينة، حتى ١٥ عضواً لكل إعلان، ويستثني صاحب الإعلان. */
export async function notifyOppositeType(adId: number, title: string, categoryId: number, cityId: number, type: 'offer' | 'request', authorId: number): Promise<void> {
  try {
    if (!(await matchNotifyEnabled())) return;
    if (!categoryId) return;
    await ensure();
    const opposite = type === 'request' ? 'offer' : 'request';
    const rows = await prisma.ads.findMany({
      where: {
        status: 1, state: 'active', store_only: 0, adsType: opposite,
        category_id: BigInt(categoryId),
        ...(cityId ? { city_id: BigInt(cityId) } : {}),
        user_id: { not: BigInt(authorId) },
      },
      select: { user_id: true },
      orderBy: { id: 'desc' },
      take: 60,
    }).catch(() => []);
    const owners = [...new Set(rows.map((r) => toInt(r.user_id)))].slice(0, 15);
    if (!owners.length) return;
    const [{ getPrimaryAdminId }, { sendChat }, { SITE }] = await Promise.all([
      import('./admin-inbox'), import('./chat'), import('./constants'),
    ]);
    const adminId = await getPrimaryAdminId().catch(() => 0);
    if (!adminId) return;
    const link = `https://${SITE.domain}/ads/${adId}`;
    const kindTxt = type === 'request' ? 'طلب جديد قد يبحث عن ما تعرضه' : 'عرض جديد قد يناسب طلبك';
    for (const uid of owners) {
      if (uid === adminId) continue;
      await sendChat(adminId, uid, `🤝 ${kindTxt} في قسمك:\n${title.slice(0, 80)}\n${link}`).catch(() => {});
    }
  } catch { /* لا يعطّل النشر */ }
}
