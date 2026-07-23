import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';
import { getStoreSubPricing, subPlanPrice, SUB_PLAN_MONTHS, SUB_PLAN_LABELS, getStoreSubReminderConfig, getSetting, setSetting, SETTING_SUB_REMINDER_MSG, DEFAULT_SUB_REMINDER_MSG, SETTING_SHOW_REMINDER_MSG, DEFAULT_SHOW_REMINDER_MSG, SETTING_ADSHOW_REMINDER_MSG, DEFAULT_ADSHOW_REMINDER_MSG, getStorePlusPricing, plusPlanPrice, autoRenewEnabled, type SubPlan } from './settings';
import { charge } from './wallet';
import { storeIdOfUser } from './merchant';
import { toInt } from './utils';

const ensure = ensureSchema;

export type SubState = 'off' | 'none' | 'active' | 'grace' | 'suspended';
export type StoreSub = {
  state: SubState;
  until: Date | null;
  graceUntil: Date | null;
  daysLeft: number;      // days until expiry (active) — negative once expired
  graceDaysLeft: number; // days left in grace before suspension
  enabled: boolean;
  graceDays: number;
  trial: boolean;        // still within the free trial (never paid yet)
};

/** Compute a store's subscription state (enforcement respects the admin toggle). */
export async function getStoreSub(storeId: number): Promise<StoreSub> {
  await ensure();
  const pricing = await getStoreSubPricing();
  const row = await prisma.stores.findUnique({ where: { id: BigInt(storeId) }, select: { sub_until: true, on_trial: true } }).catch(() => null);
  const until = row?.sub_until ? new Date(row.sub_until) : null;
  const now = Date.now();
  const graceMs = pricing.graceDays * 86400000;
  const graceUntil = until ? new Date(until.getTime() + graceMs) : null;
  const daysLeft = until ? Math.ceil((until.getTime() - now) / 86400000) : 0;
  const graceDaysLeft = graceUntil ? Math.ceil((graceUntil.getTime() - now) / 86400000) : 0;

  let state: SubState;
  if (!pricing.enabled) state = 'off';
  else if (!until) state = 'none';
  else if (until.getTime() >= now) state = 'active';
  else if (graceUntil && graceUntil.getTime() >= now) state = 'grace';
  else state = 'suspended';

  // "على تجربة" = ما زال ضمن الفترة المجانية ولم يدفع بعد
  const trial = (row?.on_trial ?? 0) === 1 && (state === 'active' || state === 'grace');
  return { state, until, graceUntil, daysLeft, graceDaysLeft, enabled: pricing.enabled, graceDays: pricing.graceDays, trial };
}

/** Start a store's free trial (called on store creation). No-op if trialDays<=0. */
export async function startStoreTrial(userId: number): Promise<void> {
  await ensure();
  const { trialDays } = await getStoreSubPricing();
  if (trialDays <= 0) return;
  const until = new Date(Date.now() + trialDays * 86400000);
  await prisma.stores.updateMany({ where: { user_id: userId }, data: { sub_until: until, on_trial: 1 } }).catch(() => {});
}

/** Admin grants extra free days (extends the trial / comps time). Keeps the trial flag. */
export async function adminGrantStoreDays(storeId: number, days: number): Promise<void> {
  await ensure();
  const n = Math.max(1, Math.round(days) || 0);
  if (!n) return;
  const cur = await prisma.stores.findUnique({ where: { id: BigInt(storeId) }, select: { sub_until: true } }).catch(() => null);
  const base = cur?.sub_until && new Date(cur.sub_until).getTime() > Date.now() ? new Date(cur.sub_until) : new Date();
  const until = new Date(base.getTime() + n * 86400000);
  await prisma.stores.updateMany({ where: { id: BigInt(storeId) }, data: { sub_until: until } }).catch(() => {});
}

/** Is the store hidden from public display due to an expired subscription? Owner/admin still see it. */
export async function isStoreSubBlocked(storeId: number): Promise<boolean> {
  const s = await getStoreSub(storeId);
  return s.state === 'suspended';
}

/** Subscribe/renew the caller's store to a plan, charging their wallet. Extends from the
 *  later of now / current expiry (so renewing early never loses remaining days). */
export async function subscribeStore(userId: number, plan: SubPlan): Promise<{ ok: boolean; error?: string; until?: Date }> {
  await ensure();
  const storeId = await storeIdOfUser(userId);
  if (!storeId) return { ok: false, error: 'لا يوجد متجر.' };
  const pricing = await getStoreSubPricing();
  const months = SUB_PLAN_MONTHS[plan];
  const price = subPlanPrice(pricing, plan);
  const paid = await charge(userId, price, 'subscription', `اشتراك متجر (${SUB_PLAN_LABELS[plan]})`);
  if (!paid.ok) return { ok: false, error: 'الرصيد غير كافٍ. اشحن رصيدك ثم أعد المحاولة.' };
  const cur = await prisma.stores.findUnique({ where: { id: BigInt(storeId) }, select: { sub_until: true } }).catch(() => null);
  const base = cur?.sub_until && new Date(cur.sub_until).getTime() > Date.now() ? new Date(cur.sub_until) : new Date();
  const until = new Date(base);
  until.setMonth(until.getMonth() + months);
  // أول دفعة تُنهي وضع التجربة المجانية — وتُحفظ الخطة ليتجدد بها تلقائياً إن فعّل التاجر ذلك
  await prisma.stores.updateMany({ where: { id: BigInt(storeId) }, data: { sub_until: until, on_trial: 0, sub_plan: plan } }).catch(() => {});
  return { ok: true, until };
}

/** التاجر يفعّل/يوقف التجديد التلقائي لاشتراكه (يتجدد بآخر خطة مدفوعة). */
export async function setAutoRenew(userId: number, on: boolean): Promise<void> {
  await ensure();
  await prisma.stores.updateMany({ where: { user_id: userId }, data: { auto_renew: on ? 1 : 0 } }).catch(() => {});
}

/**
 * التجديد التلقائي الكسول (مفتاح autorenew_on): يمسح المتاجر المفعّلة له التي
 * ينتهي اشتراكها خلال يوم أو انتهى (وما زالت في المهلة)، ويجدد بآخر خطة مدفوعة
 * خصماً من رصيد المالك مع رسالة نجاح/تعذّر. يعمل عند تحميل الصفحات (خانق ٦ ساعات)،
 * ورسائل التعذّر لا تتكرر بنفس اليوم (منع التكرار المطابق في sendChat).
 */
export async function runAutoRenewals(): Promise<void> {
  try {
    if (!(await autoRenewEnabled())) return;
    await ensure();
    const pricing = await getStoreSubPricing();
    if (!pricing.enabled) return;
    const last = await getSetting('autorenew_lastrun', '');
    if (last && Date.now() - Date.parse(last) < 6 * 60 * 60 * 1000) return;
    await setSetting('autorenew_lastrun', new Date().toISOString());

    const now = new Date();
    const soon = new Date(now.getTime() + 86400000); // يجدد قبل الانتهاء بيوم
    const graceMs = pricing.graceDays * 86400000;
    const oldest = new Date(now.getTime() - graceMs); // لا يجدد ما تجاوز المهلة (يُترك قراره للمالك)
    const rows = await prisma.stores
      .findMany({ where: { auto_renew: 1, status: 1, on_trial: 0, sub_plan: { not: null }, sub_until: { gt: oldest, lte: soon } }, select: { id: true, user_id: true, sub_until: true, sub_plan: true, store_name: true }, take: 100 })
      .catch(() => []);
    if (!rows.length) return;
    const [{ getPrimaryAdminId }, { sendChat }] = await Promise.all([import('./admin-inbox'), import('./chat')]);
    const adminId = await getPrimaryAdminId().catch(() => 0);
    for (const r of rows) {
      const plan = (r.sub_plan === 'monthly' || r.sub_plan === 'sixmo' || r.sub_plan === 'yearly' ? r.sub_plan : null) as SubPlan | null;
      const ownerId = Number(r.user_id);
      if (!plan || !ownerId) continue;
      const price = subPlanPrice(pricing, plan);
      if (price <= 0) continue;
      const paid = await charge(ownerId, price, 'subscription', `تجديد تلقائي لاشتراك المتجر (${SUB_PLAN_LABELS[plan]})`);
      const name = r.store_name || 'متجرك';
      if (paid.ok) {
        const base = r.sub_until && r.sub_until.getTime() > now.getTime() ? new Date(r.sub_until) : new Date();
        const until = new Date(base);
        until.setMonth(until.getMonth() + SUB_PLAN_MONTHS[plan]);
        await prisma.stores.updateMany({ where: { id: r.id }, data: { sub_until: until } }).catch(() => {});
        if (adminId && adminId !== ownerId) await sendChat(adminId, ownerId, `✅ تم التجديد التلقائي لاشتراك «${name}» (${SUB_PLAN_LABELS[plan]}) وخُصم ${price} ر.س من رصيدك. الاشتراك ساري حتى ${until.toISOString().slice(0, 10)}.`).catch(() => {});
      } else if (adminId && adminId !== ownerId) {
        await sendChat(adminId, ownerId, `⚠️ تعذّر التجديد التلقائي لاشتراك «${name}» — رصيدك غير كافٍ (المطلوب ${price} ر.س). اشحن رصيدك من «محفظتي» وسيُعاد التجديد تلقائياً.`).catch(() => {});
      }
    }
  } catch { /* لا يعطّل شيئاً */ }
}

/* ===================== باقة متجر Plus ===================== */

/** شراء باقة Plus: اشتراك + عرض المتجر في تربح + شارة ⭐ — دفعة واحدة من الرصيد. */
export async function buyStorePlus(userId: number, plan: SubPlan): Promise<{ ok: boolean; error?: string }> {
  await ensure();
  const storeId = await storeIdOfUser(userId);
  if (!storeId) return { ok: false, error: 'لا يوجد متجر.' };
  const pricing = await getStorePlusPricing();
  if (!pricing.enabled) return { ok: false, error: 'الباقة غير متاحة حالياً.' };
  const price = plusPlanPrice(pricing, plan);
  if (price <= 0) return { ok: false, error: 'الباقة غير مسعّرة لهذه المدة.' };
  const paid = await charge(userId, price, 'store_plus', `باقة متجر Plus (${SUB_PLAN_LABELS[plan]})`);
  if (!paid.ok) return { ok: false, error: 'الرصيد غير كافٍ.' };
  const months = SUB_PLAN_MONTHS[plan];
  const now = Date.now();
  const st = await prisma.stores.findUnique({ where: { id: BigInt(storeId) }, select: { sub_until: true, show_until: true, plus_until: true } }).catch(() => null);
  const ext = (cur: Date | null | undefined) => {
    const base = cur && cur.getTime() > now ? new Date(cur) : new Date();
    const d = new Date(base);
    d.setMonth(d.getMonth() + months);
    return d;
  };
  await prisma.stores.updateMany({
    where: { id: BigInt(storeId) },
    data: { sub_until: ext(st?.sub_until), on_trial: 0, sub_plan: plan, show_on_platform: 1, show_until: ext(st?.show_until), plus_until: ext(st?.plus_until) },
  }).catch(() => {});
  return { ok: true };
}

/** هل المتجر على باقة Plus سارية؟ (لشارة ⭐). */
export async function isStorePlus(storeId: number): Promise<boolean> {
  await ensure();
  const r = await prisma.stores.findUnique({ where: { id: BigInt(storeId) }, select: { plus_until: true } }).catch(() => null);
  return !!(r?.plus_until && r.plus_until > new Date());
}

/** Admin sets a store's subscription expiry directly (grant/extend/clear). */
export async function adminSetStoreSub(storeId: number, until: Date | null): Promise<void> {
  await ensure();
  await prisma.stores.updateMany({ where: { id: BigInt(storeId) }, data: { sub_until: until } }).catch(() => {});
}

/**
 * Notify store owners whose subscription is approaching expiry, BEFORE it expires.
 * Admin sets "how many days before" and "how many times" in settings; the message
 * text is edited in the Texts tab ({days}/{date} tokens). No background scheduler
 * exists, so this runs LAZILY (called on store/admin page loads) and self-throttles
 * to one sweep per 30 minutes. Dedupe per store per subscription period, ≤ once/day.
 */
export async function sendDueSubReminders(): Promise<void> {
  await ensure();
  const pricing = await getStoreSubPricing();
  if (!pricing.enabled) return;
  const { days, count } = await getStoreSubReminderConfig();
  if (days <= 0 || count <= 0) return;

  // خانق عام: مسح واحد كل ٣٠ دقيقة كحدّ أقصى (لا جدولة خلفية في التطبيق)
  const last = await getSetting('sub_remind_lastrun', '');
  if (last && Date.now() - Date.parse(last) < 30 * 60 * 1000) return;
  await setSetting('sub_remind_lastrun', new Date().toISOString());

  const now = new Date();
  const horizon = new Date(now.getTime() + days * 86400000);
  const rows = await prisma.stores
    .findMany({ where: { sub_until: { gt: now, lte: horizon }, status: 1 }, select: { id: true, user_id: true, sub_until: true, store_name: true } })
    .catch(() => [] as { id: bigint; user_id: number; sub_until: Date | null; store_name: string | null }[]);
  if (!rows.length) return;

  const { getPrimaryAdminId } = await import('./admin-inbox');
  const { sendChat } = await import('./chat');
  const adminId = await getPrimaryAdminId().catch(() => 0);
  if (!adminId) return;
  const rawMsg = await getSetting(SETTING_SUB_REMINDER_MSG, DEFAULT_SUB_REMINDER_MSG);
  if (!rawMsg.trim()) return;
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const today = ymd(now);

  for (const r of rows) {
    if (!r.sub_until) continue;
    const storeId = Number(r.id);
    const ownerId = Number(r.user_id);
    if (!ownerId) continue;
    const daysLeft = Math.max(0, Math.ceil((r.sub_until.getTime() - now.getTime()) / 86400000));
    const mark = await prisma.store_sub_reminders.findUnique({ where: { store_id: storeId } }).catch(() => null);
    const samePeriod = !!(mark?.sub_until && r.sub_until && mark.sub_until.getTime() === r.sub_until.getTime());
    const sent = samePeriod ? mark!.sent : 0;
    if (sent >= count) continue;                                   // بلغ الحد الأقصى للتنبيهات
    if (samePeriod && mark?.last_sent && ymd(mark.last_sent) === today) continue; // مرة واحدة يومياً

    const body = rawMsg
      .replace(/\{days\}/g, String(daysLeft))
      .replace(/\{date\}/g, ymd(r.sub_until))
      .replace(/\{name\}/g, r.store_name || 'متجرك');
    await sendChat(adminId, ownerId, body).catch(() => {});
    await prisma.store_sub_reminders
      .upsert({
        where: { store_id: storeId },
        create: { store_id: storeId, sub_until: r.sub_until, sent: 1, last_sent: now },
        update: { sub_until: r.sub_until, sent: sent + 1, last_sent: now },
      })
      .catch(() => {});
  }
}

/**
 * Notify store owners whose «عرض المتجر في تربح» is approaching expiry — نفس
 * منهجية sendDueSubReminders تماماً (سياسة الأيام/المرّات مشتركة من إعدادات
 * الاشتراك، نص الرسالة مستقل، تشغيل كسول ذاتي الخنق، دفعتر تكرار مستقل).
 */
export async function sendDueStoreShowReminders(): Promise<void> {
  await ensure();
  const { days, count } = await getStoreSubReminderConfig();
  if (days <= 0 || count <= 0) return;

  const last = await getSetting('show_remind_lastrun', '');
  if (last && Date.now() - Date.parse(last) < 30 * 60 * 1000) return;
  await setSetting('show_remind_lastrun', new Date().toISOString());

  const now = new Date();
  const horizon = new Date(now.getTime() + days * 86400000);
  const rows = await prisma.stores
    .findMany({ where: { show_until: { gt: now, lte: horizon }, status: 1 }, select: { id: true, user_id: true, show_until: true, store_name: true } })
    .catch(() => [] as { id: bigint; user_id: number; show_until: Date | null; store_name: string | null }[]);
  if (!rows.length) return;

  const { getPrimaryAdminId } = await import('./admin-inbox');
  const { sendChat } = await import('./chat');
  const adminId = await getPrimaryAdminId().catch(() => 0);
  if (!adminId) return;
  const rawMsg = await getSetting(SETTING_SHOW_REMINDER_MSG, DEFAULT_SHOW_REMINDER_MSG);
  if (!rawMsg.trim()) return;
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const today = ymd(now);

  for (const r of rows) {
    if (!r.show_until) continue;
    const storeId = Number(r.id);
    const ownerId = Number(r.user_id);
    if (!ownerId) continue;
    const daysLeft = Math.max(0, Math.ceil((r.show_until.getTime() - now.getTime()) / 86400000));
    const mark = await prisma.store_show_reminders.findUnique({ where: { store_id: storeId } }).catch(() => null);
    const samePeriod = !!(mark?.show_until && r.show_until && mark.show_until.getTime() === r.show_until.getTime());
    const sent = samePeriod ? mark!.sent : 0;
    if (sent >= count) continue;
    if (samePeriod && mark?.last_sent && ymd(mark.last_sent) === today) continue;

    const body = rawMsg
      .replace(/\{days\}/g, String(daysLeft))
      .replace(/\{date\}/g, ymd(r.show_until))
      .replace(/\{name\}/g, r.store_name || 'متجرك');
    await sendChat(adminId, ownerId, body).catch(() => {});
    await prisma.store_show_reminders
      .upsert({
        where: { store_id: storeId },
        create: { store_id: storeId, show_until: r.show_until, sent: 1, last_sent: now },
        update: { show_until: r.show_until, sent: sent + 1, last_sent: now },
      })
      .catch(() => {});
  }
}

/**
 * نفس الفكرة لكل إعلان معروض مدفوعاً في تربح («عرض إعلان في تربح» — ads.trbhh_until)،
 * بدفتر تكرار مستقل بمعرّف الإعلان (لا المتجر) لأن كل إعلان له مدّته الخاصة.
 */
export async function sendDueAdShowReminders(): Promise<void> {
  await ensure();
  const { days, count } = await getStoreSubReminderConfig();
  if (days <= 0 || count <= 0) return;

  const last = await getSetting('adshow_remind_lastrun', '');
  if (last && Date.now() - Date.parse(last) < 30 * 60 * 1000) return;
  await setSetting('adshow_remind_lastrun', new Date().toISOString());

  const now = new Date();
  const horizon = new Date(now.getTime() + days * 86400000);
  const rows = await prisma.ads
    .findMany({ where: { trbhh_until: { gt: now, lte: horizon }, status: 1 }, select: { id: true, user_id: true, trbhh_until: true, title: true } })
    .catch(() => [] as { id: bigint; user_id: bigint; trbhh_until: Date | null; title: string }[]);
  if (!rows.length) return;

  const { getPrimaryAdminId } = await import('./admin-inbox');
  const { sendChat } = await import('./chat');
  const adminId = await getPrimaryAdminId().catch(() => 0);
  if (!adminId) return;
  const rawMsg = await getSetting(SETTING_ADSHOW_REMINDER_MSG, DEFAULT_ADSHOW_REMINDER_MSG);
  if (!rawMsg.trim()) return;
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const today = ymd(now);

  for (const r of rows) {
    if (!r.trbhh_until) continue;
    const adId = toInt(r.id);
    const ownerId = toInt(r.user_id);
    if (!ownerId) continue;
    const daysLeft = Math.max(0, Math.ceil((r.trbhh_until.getTime() - now.getTime()) / 86400000));
    const mark = await prisma.ad_show_reminders.findUnique({ where: { ad_id: adId } }).catch(() => null);
    const samePeriod = !!(mark?.trbhh_until && r.trbhh_until && mark.trbhh_until.getTime() === r.trbhh_until.getTime());
    const sent = samePeriod ? mark!.sent : 0;
    if (sent >= count) continue;
    if (samePeriod && mark?.last_sent && ymd(mark.last_sent) === today) continue;

    const body = rawMsg
      .replace(/\{days\}/g, String(daysLeft))
      .replace(/\{date\}/g, ymd(r.trbhh_until))
      .replace(/\{name\}/g, r.title || 'إعلانك');
    await sendChat(adminId, ownerId, body).catch(() => {});
    await prisma.ad_show_reminders
      .upsert({
        where: { ad_id: adId },
        create: { ad_id: adId, trbhh_until: r.trbhh_until, sent: 1, last_sent: now },
        update: { trbhh_until: r.trbhh_until, sent: sent + 1, last_sent: now },
      })
      .catch(() => {});
  }
}

/* ===================== التقرير الشهري للمتاجر ===================== */

/** تقرير شهري تلقائي لكل متجر نشط (مفتاح store_report_on): زيارات الشهر الماضي
 *  وتواصلاته وعدد المنتجات — رسالة من الإدارة أول دخول إداري بعد بداية الشهر. */
export async function sendMonthlyStoreReports(): Promise<void> {
  try {
    const { getSettingBool, getSetting, setSetting } = await import('./settings');
    if (!(await getSettingBool('store_report_on', false))) return;
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const last = await getSetting('store_report_lastmonth', '');
    if (last === monthKey) return; // أُرسل هذا الشهر
    await setSetting('store_report_lastmonth', monthKey); // احجز مبكراً ضد التوازي
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    const label = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
    const stores = await prisma.stores.findMany({ where: { status: 1 }, select: { id: true, user_id: true, store_name: true }, take: 300 }).catch(() => []);
    if (!stores.length) return;
    const [{ getPrimaryAdminId }, { sendChat }] = await Promise.all([import('./admin-inbox'), import('./chat')]);
    const adminId = await getPrimaryAdminId().catch(() => 0);
    if (!adminId) return;
    for (const st of stores) {
      const sid = st.id;
      const uid = toInt(st.user_id);
      if (!uid || uid === adminId) continue;
      const [visits, contacts, products] = await Promise.all([
        prisma.store_visits.count({ where: { store_id: BigInt(toInt(sid)), created_at: { gte: start, lt: end } } }).catch(() => 0),
        prisma.store_contacts.count({ where: { store_id: BigInt(toInt(sid)), created_at: { gte: start, lt: end } } }).catch(() => 0),
        prisma.store_products.count({ where: { store_id: toInt(sid) } }).catch(() => 0),
      ]);
      if (visits === 0 && contacts === 0) continue; // لا يُزعج متجراً بلا نشاط
      const body = `📊 تقرير متجرك «${st.store_name || ''}» لشهر ${label}:\n👀 الزيارات: ${visits}\n📞 التواصل (واتساب/اتصال): ${contacts}\n🛍️ منتجاتك المعروضة: ${products}\nواصل تحديث منتجاتك ليستمر النمو — تربح`;
      await sendChat(adminId, uid, body).catch(() => {});
    }
  } catch { /* لا يعطّل شيئاً */ }
}
