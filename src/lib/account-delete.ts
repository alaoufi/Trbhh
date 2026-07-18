import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';
import { deleteStore, storeIdOfUser } from './merchant';
import { logMod } from './moderation';
import { hashPassword } from './auth';
import { toInt } from './utils';
import { scanContent } from './content-guard';

/**
 * Account deletion (Google Play data-safety requirement).
 *
 * deleteAccountNow(): removes the member's content (ads + photos/media/views,
 * classifieds, chats, comments, reviews, favorites, follows, interests, …)
 * and ANONYMIZES the users row instead of hard-deleting it — the legacy DB
 * has no foreign keys, so a vanished id would leave dangling references, and
 * an anonymized+locked row also prevents the phone from being re-registered
 * as an impersonation of the deleted member. Moderation records (reports,
 * mod_log) are retained for legal/safety accountability.
 */
export async function deleteAccountNow(userId: number): Promise<void> {
  await ensureSchema();
  const uid = BigInt(userId);

  // 1) merchant store (store-scoped cascade already exists)
  const storeId = await storeIdOfUser(userId).catch(() => 0);
  if (storeId > 0) await deleteStore(storeId).catch(() => {});

  // 2) ads + everything hanging off them
  const ads = await prisma.ads.findMany({ where: { user_id: uid }, select: { id: true } }).catch(() => []);
  const adIds = ads.map((a) => a.id);
  for (let i = 0; i < adIds.length; i += 200) {
    const slice = adIds.slice(i, i + 200);
    await prisma.photos.deleteMany({ where: { other_id: { in: slice } } }).catch(() => {});
    await prisma.ads_views.deleteMany({ where: { ads_id: { in: slice } } }).catch(() => {});
    await prisma.ad_media.deleteMany({ where: { ad_id: { in: slice } } }).catch(() => {});
    await prisma.comments.deleteMany({ where: { ads_id: { in: slice } } }).catch(() => {});
    await prisma.favorites.deleteMany({ where: { ads_id: { in: slice } } }).catch(() => {});
    await prisma.ads.deleteMany({ where: { id: { in: slice } } }).catch(() => {});
  }

  // 3) classifieds
  const cl = await prisma.classified_ads.findMany({ where: { user_id: uid }, select: { id: true } }).catch(() => []);
  if (cl.length) {
    await prisma.classified_views.deleteMany({ where: { ad_id: { in: cl.map((c) => c.id) } } }).catch(() => {});
    await prisma.classified_ads.deleteMany({ where: { user_id: uid } }).catch(() => {});
  }

  // 4) conversations & social traces
  await prisma.chats.deleteMany({ where: { OR: [{ sender_id: userId }, { reciver_id: userId }] } }).catch(() => {});
  await prisma.chat_typing.deleteMany({ where: { OR: [{ user_id: userId }, { peer_id: userId }] } }).catch(() => {});
  await prisma.comments.deleteMany({ where: { sender_id: uid } }).catch(() => {});
  await prisma.reviews.deleteMany({ where: { OR: [{ sender_id: uid }, { reciver_id: uid }] } }).catch(() => {});
  await prisma.favorites.deleteMany({ where: { user_id: uid } }).catch(() => {});
  await prisma.store_follows.deleteMany({ where: { user_id: userId } }).catch(() => {});
  await prisma.store_reviews.deleteMany({ where: { user_id: userId } }).catch(() => {});

  // 5) preferences & counters
  await prisma.member_interests.deleteMany({ where: { user_id: uid } }).catch(() => {});
  await prisma.user_area.deleteMany({ where: { user_id: uid } }).catch(() => {});
  await prisma.member_seen.deleteMany({ where: { user_id: uid } }).catch(() => {});
  await prisma.dup_attempts.deleteMany({ where: { user_id: uid } }).catch(() => {});
  await prisma.user_strikes.deleteMany({ where: { user_id: uid } }).catch(() => {});
  await prisma.admin_perms.deleteMany({ where: { user_id: uid } }).catch(() => {});
  await prisma.admin_roles.deleteMany({ where: { user_id: uid } }).catch(() => {});

  // 6) anonymize + lock the users row (identity scrubbed, login impossible)
  await prisma.users.update({
    where: { id: uid },
    data: {
      name: 'حساب محذوف',
      userName: `deleted_${userId}`,
      phoneNumber: `deleted_${userId}`,
      email: null,
      password: await hashPassword(`deleted-${userId}-${Math.random().toString(36).slice(2)}`),
      photo_path: null,
      phone_whatsapp: null,
      trusted: 0,
      ban: 'checked',
      ban_until: null,
      token: null,
      remember_token: null,
    },
  }).catch(() => {});

  // action: 'account_deleted' — الحساب مموَّه ومقفل نهائياً (لا حظر إشرافي يحتاج
  // مراجعة/فكاً)؛ لو استُخدم 'banned' هنا لظهر خطأً في صندوق «حظر آلي بانتظار
  // المراجعة» يطلب فكّ حظر حساب محذوف مموَّه لا هوية حقيقية له بعد الآن.
  await logMod(userId, { kind: 'account', action: 'account_deleted', snippet: 'account deleted at owner request' }).catch(() => {});
}

/* ---- logged-out deletion requests (processed by the admin) ---- */

export async function requestAccountDeletion(phone: string, name: string, note: string): Promise<boolean> {
  await ensureSchema();
  const p = phone.trim().slice(0, 24);
  if (p.replace(/\D/g, '').length < 8) return false;
  // one open request per phone
  const open = await prisma.deletion_requests.count({ where: { phone: p, status: 0 } }).catch(() => 0);
  if (open > 0) return true;
  // طلب من زائر غير مسجَّل دخوله — لا حساب لمعاقبته، فقط لا تُحفظ ملاحظة ممنوعة
  const cleanNote = note.trim().slice(0, 500);
  const safeNote = cleanNote && !(await scanContent(cleanNote).catch(() => null)) ? cleanNote : null;
  await prisma.deletion_requests.create({ data: { phone: p, name: name.trim().slice(0, 120) || null, note: safeNote } }).catch(() => {});
  return true;
}

export async function listDeletionRequests() {
  await ensureSchema();
  const rows = await prisma.deletion_requests.findMany({ where: { status: 0 }, orderBy: { id: 'desc' }, take: 50 }).catch(() => []);
  return rows.map((r) => ({ id: r.id, phone: r.phone, name: r.name, note: r.note, at: r.created_at ? r.created_at.toISOString() : null }));
}

export async function closeDeletionRequest(id: number) {
  await ensureSchema();
  await prisma.deletion_requests.updateMany({ where: { id }, data: { status: 1 } }).catch(() => {});
}

/** Find the member a deletion request refers to (matches any phone format). */
export async function findUserByPhone(phone: string): Promise<number> {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return 0;
  const sig = (digits.startsWith('966') ? digits.slice(3) : digits).replace(/^0+/, '');
  const u = await prisma.users.findFirst({ where: { phoneNumber: { contains: sig.slice(-9) } }, select: { id: true } }).catch(() => null);
  return u ? toInt(u.id) : 0;
}
