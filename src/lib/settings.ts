import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';

const ensure = ensureSchema;

export async function getSetting(k: string, fallback = ''): Promise<string> {
  await ensure();
  const row = await prisma.site_settings.findUnique({ where: { k } }).catch(() => null);
  return row?.v ?? fallback;
}

export async function getSettingNum(k: string, fallback = 0): Promise<number> {
  const v = await getSetting(k, String(fallback));
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export async function setSetting(k: string, v: string) {
  await ensure();
  await prisma.site_settings.upsert({ where: { k }, create: { k, v }, update: { v } });
}

export async function getSettingBool(k: string, fallback = true): Promise<boolean> {
  const v = await getSetting(k, fallback ? '1' : '0');
  return v !== '0' && v !== '' && v.toLowerCase() !== 'false';
}

/* Member self-service windows (hours). 0 = unlimited (always allowed). */
export const SETTING_AD_EDIT_HOURS = 'ad_edit_hours';
export const SETTING_AD_DELETE_HOURS = 'ad_delete_hours';

/* Grace period (minutes) a member may delete their own chat message.
   0 = unlimited (always allowed) — the default, so deletion just works;
   set a positive number from the admin to restrict it to a grace period. */
export const SETTING_MSG_DELETE_MINUTES = 'msg_delete_minutes';
export async function getMsgDeleteMinutes(): Promise<number> {
  return getSettingNum(SETTING_MSG_DELETE_MINUTES, 0);
}

/* Quick-reply message templates (نصوص جاهزة) shown above the chat compose box so
   the sender can pick a ready phrase. Stored one-per-line; blank => hidden.
   Trbhh (platform) owns two sets — messaging an ad owner, and messaging the
   administration. Stores keep their OWN templates in store settings (merchant.ts). */
export const SETTING_MSG_TPL_AD = 'msg_tpl_ad';
export const SETTING_MSG_TPL_ADMIN = 'msg_tpl_admin';
export const DEFAULT_MSG_TPL_AD = 'السلام عليكم، هل يمكنني الحصول على مزيد من المعلومات حول هذا الإعلان؟';
export const DEFAULT_MSG_TPL_ADMIN = 'السلام عليكم، لديّ استفسار حول ...';

/** Parse a newline-separated templates blob into a clean list (≤12, ≤300 chars each). */
export function parseTemplates(raw: string | null | undefined): string[] {
  return (raw || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.slice(0, 300))
    .slice(0, 12);
}

/**
 * Fill a message template's variables: `{link}` (URL) and `{name}` (ad/product/
 * store/recipient name — whatever fits the context).
 * - `{name}`: replaced when provided, else the token is dropped.
 * - `{link}`: replaced when provided; if absent from the text and `appendLink` is
 *   true, the URL is appended on a new line (so WhatsApp inquiries always carry
 *   the ad/product link). When no link is provided the token is dropped.
 */
export function fillTemplate(tpl: string, vars: { link?: string | null; name?: string | null; appendLink?: boolean } = {}): string {
  let t = (tpl || '').trim();
  t = vars.name ? t.replace(/\{name\}/g, vars.name) : t.replace(/\s*\{name\}\s*/g, ' ');
  if (vars.link) {
    if (t.includes('{link}')) t = t.replace(/\{link\}/g, vars.link);
    else if (vars.appendLink) t = `${t}\n${vars.link}`;
  } else {
    t = t.replace(/\s*\{link\}\s*/g, ' ');
  }
  return t.trim();
}

/** Templates shown when a member messages an ad owner (unset => a sensible default). */
export async function getAdMsgTemplates(): Promise<string[]> {
  const v = await getSetting(SETTING_MSG_TPL_AD, '__default__');
  return v === '__default__' ? [DEFAULT_MSG_TPL_AD] : parseTemplates(v);
}
/** Templates shown when a member messages the administration (unset => a default). */
export async function getAdminMsgTemplates(): Promise<string[]> {
  const v = await getSetting(SETTING_MSG_TPL_ADMIN, '__default__');
  return v === '__default__' ? [DEFAULT_MSG_TPL_ADMIN] : parseTemplates(v);
}

/* Visitor-facing safety notice shown on the ad detail page (editable). */
export const SETTING_AD_NOTICE = 'ad_notice';
export const DEFAULT_AD_NOTICE = 'التعامل والدفع يتم خارج المنصة مباشرة بين الطرفين. المنصة وسيلة عرض وربط فقط.';
export async function getAdNotice(): Promise<string> {
  return getSetting(SETTING_AD_NOTICE, DEFAULT_AD_NOTICE);
}

/* Site-wide + home-page editable texts (تبويب النصوص → عام / الرئيسية). */
export const SETTING_TICKER = 'ticker_note';
export const DEFAULT_TICKER = 'منصة تربح وسيلة عرض وربط فقط، والتعامل والدفع يتمّ خارج المنصة مباشرة بين الطرفين';
export const SETTING_HOME_CLS_TITLE = 'home_cls_title';
export const DEFAULT_HOME_CLS_TITLE = 'الإعلانات المبوّبة';
export const SETTING_HOME_CLS_SUB = 'home_cls_sub';
export const DEFAULT_HOME_CLS_SUB = 'تصفّح البطاقات أو صمّم إعلانك بالمصمم الذكي';
export async function getTickerNote(): Promise<string> {
  return getSetting(SETTING_TICKER, DEFAULT_TICKER);
}
export async function getHomeClassifiedText(): Promise<{ title: string; sub: string }> {
  const [title, sub] = await Promise.all([
    getSetting(SETTING_HOME_CLS_TITLE, DEFAULT_HOME_CLS_TITLE),
    getSetting(SETTING_HOME_CLS_SUB, DEFAULT_HOME_CLS_SUB),
  ]);
  return { title, sub };
}

/* عناوين أقسام الصفحة الرئيسية (قابلة للتعديل). */
export const SETTING_HOME_H_STORES = 'home_h_stores';
export const SETTING_HOME_H_PRODUCTS = 'home_h_products';
export const SETTING_HOME_H_FEATURED = 'home_h_featured';
export const SETTING_HOME_H_LATEST = 'home_h_latest';
export const SETTING_HOME_H_MOSTVIEWED = 'home_h_mostviewed';
export const HOME_HEADING_DEFAULTS = { stores: 'متاجر تربح', products: 'منتجات المتاجر', featured: 'إعلانات مميّزة', latest: 'أحدث الإعلانات', mostViewed: 'الأكثر مشاهدة' };
export async function getHomeHeadings(): Promise<{ stores: string; products: string; featured: string; latest: string; mostViewed: string }> {
  const [stores, products, featured, latest, mostViewed] = await Promise.all([
    getSetting(SETTING_HOME_H_STORES, HOME_HEADING_DEFAULTS.stores),
    getSetting(SETTING_HOME_H_PRODUCTS, HOME_HEADING_DEFAULTS.products),
    getSetting(SETTING_HOME_H_FEATURED, HOME_HEADING_DEFAULTS.featured),
    getSetting(SETTING_HOME_H_LATEST, HOME_HEADING_DEFAULTS.latest),
    getSetting(SETTING_HOME_H_MOSTVIEWED, HOME_HEADING_DEFAULTS.mostViewed),
  ]);
  return { stores, products, featured, latest, mostViewed };
}

/* رسائل «لا يوجد» الظاهرة للزوّار (قابلة للتعديل). */
export const SETTING_EMPTY_ADS = 'empty_ads';
export const SETTING_EMPTY_CHATS = 'empty_chats';
export const SETTING_EMPTY_STORES = 'empty_stores';
export const SETTING_EMPTY_REVIEWS = 'empty_reviews';
export const SETTING_EMPTY_CLASSIFIED = 'empty_classified';
export const EMPTY_DEFAULTS = { ads: 'لا توجد إعلانات لعرضها حالياً.', chats: 'لا توجد محادثات بعد.', stores: 'لا توجد متاجر معتمدة بعد.', reviews: 'لا توجد تقييمات بعد.', classified: 'لا توجد إعلانات مبوّبة بعد.' };
export async function getEmptyText(key: keyof typeof EMPTY_DEFAULTS): Promise<string> {
  const map = { ads: SETTING_EMPTY_ADS, chats: SETTING_EMPTY_CHATS, stores: SETTING_EMPTY_STORES, reviews: SETTING_EMPTY_REVIEWS, classified: SETTING_EMPTY_CLASSIFIED };
  return getSetting(map[key], EMPTY_DEFAULTS[key]);
}
export async function getEmptyTexts(): Promise<typeof EMPTY_DEFAULTS> {
  const [ads, chats, stores, reviews, classified] = await Promise.all([
    getSetting(SETTING_EMPTY_ADS, EMPTY_DEFAULTS.ads),
    getSetting(SETTING_EMPTY_CHATS, EMPTY_DEFAULTS.chats),
    getSetting(SETTING_EMPTY_STORES, EMPTY_DEFAULTS.stores),
    getSetting(SETTING_EMPTY_REVIEWS, EMPTY_DEFAULTS.reviews),
    getSetting(SETTING_EMPTY_CLASSIFIED, EMPTY_DEFAULTS.classified),
  ]);
  return { ads, chats, stores, reviews, classified };
}

/* Which stat cards show on the home page (CSV of keys; unset => all). */
export const SETTING_SHOW_STATS = 'show_home_stats'; // legacy on/off (kept for compat)
export const SETTING_HOME_STATS = 'home_stats';
export const HOME_STAT_KEYS = ['ads', 'users', 'views', 'cats'] as const;
export type HomeStatKey = typeof HOME_STAT_KEYS[number];
export const HOME_STAT_LABELS: Record<HomeStatKey, string> = {
  ads: 'إعلان نشط', users: 'عضو مسجّل', views: 'مشاهدة', cats: 'قسم',
};
/** Set of enabled home-stat keys. Unset setting => all shown by default. */
export async function getHomeStats(): Promise<Set<string>> {
  const v = await getSetting(SETTING_HOME_STATS, '__all__');
  if (v === '__all__') return new Set(HOME_STAT_KEYS);
  return new Set(v.split(',').map((s) => s.trim()).filter(Boolean));
}

/* Require admin approval before a new regular ad is published (1/0). */
export const SETTING_ADS_APPROVAL = 'ads_require_approval';

/* How many days a classified ad stays published (0 = unlimited). */
export const SETTING_CLASSIFIED_DAYS = 'classified_days';
export async function getClassifiedLifetimeDays(): Promise<number> {
  return getSettingNum(SETTING_CLASSIFIED_DAYS, 0);
}

/* Who can see classified ad stats (views/clicks): 'all' | 'owner' | 'admin'. */
export const SETTING_CLASSIFIED_STATS = 'classified_stats_vis';
export type StatsAudience = 'all' | 'owner' | 'admin';
export async function getClassifiedStatsAudience(): Promise<StatsAudience> {
  const v = await getSetting(SETTING_CLASSIFIED_STATS, 'owner');
  return (v === 'all' || v === 'admin' ? v : 'owner');
}

export type MemberWindows = { editHours: number; deleteHours: number };
export async function getMemberWindows(): Promise<MemberWindows> {
  const [editHours, deleteHours] = await Promise.all([
    getSettingNum(SETTING_AD_EDIT_HOURS, 0),
    getSettingNum(SETTING_AD_DELETE_HOURS, 0),
  ]);
  return { editHours, deleteHours };
}

/** Hours elapsed since a timestamp (Infinity when unknown → treat as outside any window). */
export function hoursSince(dt: Date | string | null | undefined): number {
  if (!dt) return Infinity;
  const t = new Date(dt).getTime();
  if (!Number.isFinite(t)) return Infinity;
  return (Date.now() - t) / 3600000;
}

/** Whether a member may still edit/delete their item given the configured window. */
export function withinWindow(createdAt: Date | string | null | undefined, windowHours: number): boolean {
  if (!windowHours || windowHours <= 0) return true; // unlimited
  return hoursSince(createdAt) <= windowHours;
}

/** How long the classified entry splash plays before auto-entering (seconds). */
export const SETTING_CLASSIFIED_SECONDS = 'classified_splash_seconds';
export async function getClassifiedSplashSeconds(): Promise<number> {
  const n = await getSettingNum(SETTING_CLASSIFIED_SECONDS, 5);
  return Math.min(60, Math.max(2, n || 5));
}

/** Duplicate-detection thresholds (percent) — separate for title and details,
 *  editable by the admin. Comparison is ONLY on title + details (no images). */
export const SETTING_DUP_TITLE_PCT = 'dup_title_percent';
export const SETTING_DUP_DETAIL_PCT = 'dup_detail_percent';
export const SETTING_DUP_IMAGE_PCT = 'dup_image_percent';
export async function getDupThresholds(): Promise<{ title: number; detail: number; image: number }> {
  const clamp = (n: number) => Math.min(100, Math.max(50, Math.round(n) || 90));
  const [t, d, im] = await Promise.all([
    getSettingNum(SETTING_DUP_TITLE_PCT, 90),
    getSettingNum(SETTING_DUP_DETAIL_PCT, 90),
    getSettingNum(SETTING_DUP_IMAGE_PCT, 95),
  ]);
  return { title: clamp(t), detail: clamp(d), image: clamp(im) };
}

/** Classified-ad duplicate prevention — a toggle plus three thresholds (percent):
 *  content (title+body text), image (perceptual), and background (theme+pattern+accent design). */
export const SETTING_CDUP_ON = 'cdup_enabled';
export const SETTING_CDUP_CONTENT_PCT = 'cdup_content_percent';
export const SETTING_CDUP_IMAGE_PCT = 'cdup_image_percent';
export const SETTING_CDUP_BG_PCT = 'cdup_bg_percent';
export async function getClassifiedDupConfig(): Promise<{ enabled: boolean; content: number; image: number; background: number }> {
  const clamp = (n: number, d: number) => Math.min(100, Math.max(50, Math.round(n) || d));
  const [on, c, im, bg] = await Promise.all([
    getSettingBool(SETTING_CDUP_ON, false),
    getSettingNum(SETTING_CDUP_CONTENT_PCT, 90),
    getSettingNum(SETTING_CDUP_IMAGE_PCT, 95),
    getSettingNum(SETTING_CDUP_BG_PCT, 100),
  ]);
  return { enabled: on, content: clamp(c, 90), image: clamp(im, 95), background: clamp(bg, 100) };
}

/** Wallet pricing (SAR). 0 = free/off. `duplicate` is the fee to publish a
 *  duplicate ad (regular or classified) — paying it bypasses duplicate blocking. */
export const SETTING_PRICE_FEATURED = 'price_featured';
export const SETTING_PRICE_CLASSIFIED = 'price_classified';
export const SETTING_PRICE_DUP = 'price_duplicate';
export async function getPricing(): Promise<{ featured: number; classified: number; duplicate: number }> {
  const nn = (n: number) => Math.max(0, Math.round(n) || 0);
  const [f, c, d] = await Promise.all([
    getSettingNum(SETTING_PRICE_FEATURED, 0),
    getSettingNum(SETTING_PRICE_CLASSIFIED, 0),
    getSettingNum(SETTING_PRICE_DUP, 0),
  ]);
  return { featured: nn(f), classified: nn(c), duplicate: nn(d) };
}

/* ================= Revenue: store subscriptions + ad service pricing ================= */

/** Store subscription plans (SAR) + grace period (days) + enforcement toggle. */
export const SETTING_SUB_ENABLED = 'sub_store_enabled';
export const SETTING_SUB_MONTHLY = 'sub_store_monthly';
export const SETTING_SUB_6MO = 'sub_store_6mo';
export const SETTING_SUB_YEARLY = 'sub_store_yearly';
export const SETTING_SUB_GRACE_DAYS = 'sub_grace_days';

export type SubPlan = 'monthly' | 'sixmo' | 'yearly';
export const SUB_PLAN_MONTHS: Record<SubPlan, number> = { monthly: 1, sixmo: 6, yearly: 12 };
export const SUB_PLAN_LABELS: Record<SubPlan, string> = { monthly: 'شهري', sixmo: '6 أشهر', yearly: 'سنوي' };

export type StoreSubPricing = { enabled: boolean; monthly: number; sixmo: number; yearly: number; graceDays: number };
export async function getStoreSubPricing(): Promise<StoreSubPricing> {
  const nn = (n: number) => Math.max(0, Math.round(n) || 0);
  const [en, m, s, y, g] = await Promise.all([
    getSettingBool(SETTING_SUB_ENABLED, false),
    getSettingNum(SETTING_SUB_MONTHLY, 0),
    getSettingNum(SETTING_SUB_6MO, 0),
    getSettingNum(SETTING_SUB_YEARLY, 0),
    getSettingNum(SETTING_SUB_GRACE_DAYS, 10),
  ]);
  return { enabled: en, monthly: nn(m), sixmo: nn(s), yearly: nn(y), graceDays: Math.max(0, Math.round(g) || 10) };
}
export function subPlanPrice(p: StoreSubPricing, plan: SubPlan): number {
  return plan === 'monthly' ? p.monthly : plan === 'sixmo' ? p.sixmo : p.yearly;
}

/* تنبيهات قرب انتهاء الاشتراك: قبل كم يوم يبدأ التنبيه، وكم مرة (مرة واحدة يومياً
   كحدّ أقصى). 0 = تعطيل. نص الرسالة يُعدَّل من تبويب «النصوص» ويدعم {days} و{date}. */
export const SETTING_SUB_REMIND_DAYS = 'sub_remind_days';
export const SETTING_SUB_REMIND_COUNT = 'sub_remind_count';
export const SETTING_SUB_REMINDER_MSG = 'sub_reminder_msg';
export const DEFAULT_SUB_REMINDER_MSG = 'تنبيه من تربح: يقترب انتهاء اشتراك متجرك خلال {days} يوم (بتاريخ {date}). جدّد الاشتراك من لوحة متجرك لتفادي إخفاء المتجر. — الإدارة';
export async function getStoreSubReminderConfig(): Promise<{ days: number; count: number }> {
  const [d, c] = await Promise.all([
    getSettingNum(SETTING_SUB_REMIND_DAYS, 7),
    getSettingNum(SETTING_SUB_REMIND_COUNT, 3),
  ]);
  return { days: Math.max(0, Math.round(d) || 0), count: Math.max(0, Math.round(c) || 0) };
}

/** Ad service pricing (SAR) by duration + duplicate tiers. */
/** Durations are a shared CHOICE (not priced by themselves). Each paid service has a price per duration. */
export type Dur = 'w2' | 'm1' | 'y1';
export const DURATIONS: { key: Dur; label: string; days: number }[] = [
  { key: 'w2', label: 'أسبوعان', days: 14 },
  { key: 'm1', label: 'شهر', days: 30 },
  { key: 'y1', label: 'سنة', days: 365 },
];
export const DUR_DAYS: Record<Dur, number> = { w2: 14, m1: 30, y1: 365 };
export const DUR_LABEL: Record<Dur, string> = { w2: 'أسبوعان', m1: 'شهر', y1: 'سنة' };
export function isDur(v: string): v is Dur { return v === 'w2' || v === 'm1' || v === 'y1'; }

/** Paid services, each priced per duration. dup3/dup5 grant 3/5 duplicate-publish allowances. */
export type PaidService = 'featured' | 'classified' | 'dup3' | 'dup5';
export const SERVICE_LABELS: Record<PaidService, string> = {
  featured: 'تمييز الإعلان',
  classified: 'إعلان مبوّب',
  dup3: 'باقة مكرّر 3',
  dup5: 'باقة مكرّر 5',
};
export const DUP_PACK_COUNT: Record<'dup3' | 'dup5', number> = { dup3: 3, dup5: 5 };
export const servicePriceKey = (s: PaidService, d: Dur) => `price_${s}_${d}`;

export type ServicePricing = Record<PaidService, Record<Dur, number>>;
export async function getServicePricing(): Promise<ServicePricing> {
  const services: PaidService[] = ['featured', 'classified', 'dup3', 'dup5'];
  const out = { featured: {}, classified: {}, dup3: {}, dup5: {} } as ServicePricing;
  await Promise.all(
    services.flatMap((s) =>
      DURATIONS.map(async ({ key }) => {
        const v = await getSettingNum(servicePriceKey(s, key), 0);
        out[s][key] = Math.max(0, Math.round(v) || 0);
      }),
    ),
  );
  return out;
}
/** Is any duration priced for a service (i.e. the service is sold)? */
export function serviceHasPrice(p: Record<Dur, number>): boolean {
  return DURATIONS.some(({ key }) => p[key] > 0);
}

/* ---- native app shells (Android TWA / iOS wrapper): versions & stores ---- */
export const APP_KEYS = {
  androidPackage: 'app_android_package',
  androidSha256: 'app_android_sha256',
  androidStoreUrl: 'app_android_store_url',
  androidMinCode: 'app_android_min_code',
  iosStoreUrl: 'app_ios_store_url',
  iosMinBuild: 'app_ios_min_build',
} as const;

export type AppConfig = {
  android: { package: string; sha256: string; storeUrl: string; minCode: number };
  ios: { storeUrl: string; minBuild: number };
};

/** App-shell config for the force-update gate and assetlinks. */
export async function getAppConfig(): Promise<AppConfig> {
  const [pkg, sha, aStore, aMin, iStore, iMin] = await Promise.all([
    getSetting(APP_KEYS.androidPackage, 'com.trbhh.app'),
    // الافتراضي: بصمة مفتاح الرفع المولّد في apps/android-twa — بعد النشر أضف
    // بجانبها بصمة Google من Play Console ← App integrity (مفصولة بفاصلة).
    getSetting(
      APP_KEYS.androidSha256,
      '4F:4B:B5:CA:0C:1E:59:BF:B2:7D:5C:86:CD:17:51:08:33:37:98:CD:08:B4:8C:EC:C7:86:66:F2:FB:09:7A:70',
    ),
    getSetting(APP_KEYS.androidStoreUrl, ''),
    getSettingNum(APP_KEYS.androidMinCode, 2),
    getSetting(APP_KEYS.iosStoreUrl, ''),
    getSettingNum(APP_KEYS.iosMinBuild, 2),
  ]);
  return {
    android: {
      package: pkg,
      sha256: sha,
      storeUrl: aStore || `https://play.google.com/store/apps/details?id=${pkg}`,
      minCode: aMin,
    },
    ios: { storeUrl: iStore, minBuild: iMin },
  };
}
