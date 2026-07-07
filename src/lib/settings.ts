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

/** Ad service pricing (SAR) by duration + duplicate tiers. */
export const SETTING_ADS_PAID_ENABLED = 'ads_paid_enabled';
export const SETTING_AD_2W = 'price_ad_2w';
export const SETTING_AD_1M = 'price_ad_1m';
export const SETTING_AD_3M = 'price_ad_3m';
export const SETTING_DUP_T3 = 'price_dup_3';
export const SETTING_DUP_T5 = 'price_dup_5';

export type AdDuration = 'w2' | 'm1' | 'm3';
export const AD_DURATION_DAYS: Record<AdDuration, number> = { w2: 14, m1: 30, m3: 90 };
export const AD_DURATION_LABELS: Record<AdDuration, string> = { w2: 'أسبوعان', m1: 'شهر', m3: 'ثلاثة أشهر' };

export type AdPricing = { enabled: boolean; w2: number; m1: number; m3: number; dup3: number; dup5: number };
export async function getAdPricing(): Promise<AdPricing> {
  const nn = (n: number) => Math.max(0, Math.round(n) || 0);
  const [en, w2, m1, m3, d3, d5] = await Promise.all([
    getSettingBool(SETTING_ADS_PAID_ENABLED, false),
    getSettingNum(SETTING_AD_2W, 0),
    getSettingNum(SETTING_AD_1M, 0),
    getSettingNum(SETTING_AD_3M, 0),
    getSettingNum(SETTING_DUP_T3, 0),
    getSettingNum(SETTING_DUP_T5, 0),
  ]);
  return { enabled: en, w2: nn(w2), m1: nn(m1), m3: nn(m3), dup3: nn(d3), dup5: nn(d5) };
}
export function adDurationPrice(p: AdPricing, d: AdDuration): number {
  return d === 'w2' ? p.w2 : d === 'm1' ? p.m1 : p.m3;
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
