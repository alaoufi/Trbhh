import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';
import { auctionsEnabled, getAuctionConfig, getSetting, setSetting } from './settings';
import { toInt } from './utils';

const ensure = ensureSchema;
export { auctionsEnabled };

export type AuctionCard = {
  id: number; adId: number; title: string; image: string;
  startPrice: number; minStep: number; topBid: number; bidsCount: number;
  endsAt: string; closed: boolean; winnerId: number | null; winnerBid: number | null;
  sellerId: number; sellerName: string;
};

async function adInfo(adIds: bigint[]): Promise<Map<number, { title: string; image: string }>> {
  const out = new Map<number, { title: string; image: string }>();
  if (!adIds.length) return out;
  const { getAdsByIds } = await import('./account');
  const ads = await getAdsByIds(adIds.map((n) => toInt(n)));
  for (const a of ads) out.set(a.id, { title: a.title, image: a.image });
  return out;
}

async function toCards(rows: { id: bigint; ad_id: bigint; user_id: bigint; start_price: number; min_step: number; ends_at: Date; status: number; winner_id: bigint | null; winner_bid: number | null }[]): Promise<AuctionCard[]> {
  if (!rows.length) return [];
  const [ads, tops, sellers] = await Promise.all([
    adInfo(rows.map((r) => r.ad_id)),
    prisma.bids.groupBy({ by: ['auction_id'], where: { auction_id: { in: rows.map((r) => r.id) } }, _max: { amount: true }, _count: true }).catch(() => []),
    prisma.users.findMany({ where: { id: { in: rows.map((r) => r.user_id) } }, select: { id: true, name: true, userName: true } }).catch(() => []),
  ]);
  const topBy = new Map(tops.map((t) => [toInt(t.auction_id), { max: t._max.amount ?? 0, count: t._count }]));
  const sellerBy = new Map(sellers.map((s) => [toInt(s.id), s.name || s.userName || 'عضو']));
  return rows.map((r) => {
    const ad = ads.get(toInt(r.ad_id));
    const top = topBy.get(toInt(r.id));
    return {
      id: toInt(r.id), adId: toInt(r.ad_id),
      title: ad?.title ?? `إعلان #${toInt(r.ad_id)}`, image: ad?.image ?? '/placeholder-ad.svg',
      startPrice: r.start_price, minStep: r.min_step,
      topBid: top?.max ?? 0, bidsCount: top?.count ?? 0,
      endsAt: r.ends_at.toISOString(), closed: r.status === 1,
      winnerId: r.winner_id ? toInt(r.winner_id) : null, winnerBid: r.winner_bid,
      sellerId: toInt(r.user_id), sellerName: sellerBy.get(toInt(r.user_id)) ?? 'عضو',
    };
  });
}

/** المزادات المفتوحة (الأقرب انتهاءً أولاً) + آخر المزادات المغلقة. */
export async function listAuctions(): Promise<{ open: AuctionCard[]; closed: AuctionCard[] }> {
  await ensure();
  const [openRows, closedRows] = await Promise.all([
    prisma.auctions.findMany({ where: { status: 0 }, orderBy: { ends_at: 'asc' }, take: 60 }).catch(() => []),
    prisma.auctions.findMany({ where: { status: 1 }, orderBy: { ends_at: 'desc' }, take: 12 }).catch(() => []),
  ]);
  const [open, closed] = await Promise.all([toCards(openRows), toCards(closedRows)]);
  return { open, closed };
}

export type AuctionBid = { id: number; userId: number; name: string; amount: number; at: string | null };

export async function getAuctionDetail(id: number): Promise<{ card: AuctionCard; bids: AuctionBid[] } | null> {
  await ensure();
  const row = await prisma.auctions.findUnique({ where: { id: BigInt(id) } }).catch(() => null);
  if (!row) return null;
  const [card] = await toCards([row]);
  const bidRows = await prisma.bids.findMany({ where: { auction_id: row.id }, orderBy: { amount: 'desc' }, take: 50 }).catch(() => []);
  const users = await prisma.users.findMany({ where: { id: { in: bidRows.map((b) => b.user_id) } }, select: { id: true, name: true, userName: true } }).catch(() => []);
  const nameBy = new Map(users.map((u) => [toInt(u.id), u.name || u.userName || 'عضو']));
  const bids = bidRows.map((b) => ({ id: toInt(b.id), userId: toInt(b.user_id), name: nameBy.get(toInt(b.user_id)) ?? 'عضو', amount: b.amount, at: b.created_at ? b.created_at.toISOString() : null }));
  return { card, bids };
}

/** فتح مزاد على إعلان العضو (رسم الفتح من التحكم يُخصم من الرصيد). */
export async function createAuction(userId: number, adId: number, startPrice: number, minStep: number, days: number): Promise<{ ok: boolean; id?: number; error?: string }> {
  await ensure();
  if (!(await auctionsEnabled())) return { ok: false, error: 'المزادات غير مفعّلة حالياً.' };
  const cfg = await getAuctionConfig();
  const d = Math.min(cfg.maxDays, Math.max(1, Math.round(days) || 0));
  const sp = Math.max(0, Math.round(startPrice) || 0);
  const step = Math.max(1, Math.round(minStep) || 1);
  const ad = await prisma.ads.findUnique({ where: { id: BigInt(adId) }, select: { user_id: true, status: true, store_only: true, title: true } }).catch(() => null);
  if (!ad || toInt(ad.user_id) !== userId || ad.status !== 1) return { ok: false, error: 'الإعلان غير صالح للمزاد.' };
  if (ad.store_only === 1) return { ok: false, error: 'المزاد متاح لإعلانات تربح فقط (لا منتجات المتاجر).' };
  const existing = await prisma.auctions.count({ where: { ad_id: BigInt(adId), status: 0 } }).catch(() => 1);
  if (existing > 0) return { ok: false, error: 'يوجد مزاد مفتوح على هذا الإعلان بالفعل.' };
  if (cfg.fee > 0) {
    const { charge } = await import('./wallet');
    const paid = await charge(userId, cfg.fee, 'auction', `فتح مزاد — ${String(ad.title || '').slice(0, 40)}`);
    if (!paid.ok) return { ok: false, error: 'needcredit' };
  }
  const row = await prisma.auctions.create({ data: { ad_id: BigInt(adId), user_id: BigInt(userId), start_price: sp, min_step: step, ends_at: new Date(Date.now() + d * 86400000) } }).catch(() => null);
  if (!row) return { ok: false, error: 'تعذّر فتح المزاد.' };
  return { ok: true, id: toInt(row.id) };
}

/** مزايدة: أعلى من (أعلى مزايدة + أدنى زيادة) أو سعر البداية — ولا يزايد صاحب المزاد. */
export async function placeBid(userId: number, auctionId: number, amount: number): Promise<{ ok: boolean; min?: number; error?: string }> {
  await ensure();
  if (!(await auctionsEnabled())) return { ok: false, error: 'المزادات غير مفعّلة حالياً.' };
  const a = await prisma.auctions.findUnique({ where: { id: BigInt(auctionId) } }).catch(() => null);
  if (!a || a.status !== 0 || a.ends_at <= new Date()) return { ok: false, error: 'المزاد غير متاح أو انتهى.' };
  if (toInt(a.user_id) === userId) return { ok: false, error: 'لا يمكنك المزايدة على مزادك.' };
  const top = await prisma.bids.aggregate({ where: { auction_id: a.id }, _max: { amount: true } }).catch(() => null);
  const topAmount = top?._max.amount ?? 0;
  const min = topAmount > 0 ? topAmount + a.min_step : Math.max(a.start_price, 1);
  const amt = Math.round(amount) || 0;
  if (amt < min) return { ok: false, min, error: 'low' };
  await prisma.bids.create({ data: { auction_id: a.id, user_id: BigInt(userId), amount: amt } }).catch(() => {});
  return { ok: true };
}

/**
 * إغلاق المزادات المستحقة كسولاً (خانق ٥ دقائق): يحدد الفائز (أعلى مزايدة)
 * ويرسل رسالة للفائز والبائع ليتواصلا ويتما الصفقة — لا خصم تلقائي من الفائز.
 */
export async function closeDueAuctions(): Promise<void> {
  try {
    await ensure();
    const last = await getSetting('auction_close_lastrun', '');
    if (last && Date.now() - Date.parse(last) < 5 * 60 * 1000) return;
    await setSetting('auction_close_lastrun', new Date().toISOString());
    const due = await prisma.auctions.findMany({ where: { status: 0, ends_at: { lte: new Date() } }, take: 50 }).catch(() => []);
    if (!due.length) return;
    const [{ getPrimaryAdminId }, { sendChat }] = await Promise.all([import('./admin-inbox'), import('./chat')]);
    const adminId = await getPrimaryAdminId().catch(() => 0);
    for (const a of due) {
      const top = await prisma.bids.findFirst({ where: { auction_id: a.id }, orderBy: { amount: 'desc' } }).catch(() => null);
      await prisma.auctions.update({ where: { id: a.id }, data: { status: 1, winner_id: top ? top.user_id : null, winner_bid: top ? top.amount : null } }).catch(() => {});
      if (!adminId) continue;
      const ad = await prisma.ads.findUnique({ where: { id: a.ad_id }, select: { title: true } }).catch(() => null);
      const title = String(ad?.title || `إعلان #${toInt(a.ad_id)}`).slice(0, 60);
      const sellerId = toInt(a.user_id);
      if (top) {
        const winnerId = toInt(top.user_id);
        const winner = await prisma.users.findUnique({ where: { id: top.user_id }, select: { name: true, userName: true } }).catch(() => null);
        const wName = winner?.name || winner?.userName || 'الفائز';
        if (adminId !== winnerId) await sendChat(adminId, winnerId, `🏆 مبروك! فزت بمزاد «${title}» بمبلغ ${top.amount} ر.س. تواصل مع البائع من صفحة الإعلان لإتمام الصفقة: /ads/${toInt(a.ad_id)}`).catch(() => {});
        if (adminId !== sellerId) await sendChat(adminId, sellerId, `🔨 انتهى مزادك على «${title}» — الفائز: ${wName} بمبلغ ${top.amount} ر.س. سيتواصل معك لإتمام الصفقة.`).catch(() => {});
      } else if (adminId !== sellerId) {
        await sendChat(adminId, sellerId, `🔨 انتهى مزادك على «${title}» دون مزايدات. يمكنك فتح مزاد جديد بسعر بداية أقل.`).catch(() => {});
      }
    }
  } catch { /* لا يعطّل شيئاً */ }
}
