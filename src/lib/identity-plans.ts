import 'server-only';
import { prisma } from './prisma';
import { getSetting, getSettingNum } from './settings';
import { ensureSchema } from '@/data/schema-sync';

/**
 * باقات الهويات الموحّدة: الحساب الرئيسي مجاني، والهويات الإضافية خدمة بمقابل عبر
 * ٣ باقات، كل باقة تمنح «عدد حسابات» لمدة (شهري/نصف سنوي/سنوي) بسعرها. الحسابات
 * المرتبطة (الموجودة) معفاة مدة (٦ أشهر افتراضياً) يُوضَّح ذلك أثناء الربط.
 */

export type IdentityDuration = 'month' | 'half' | 'year';
export const DURATION_DAYS: Record<IdentityDuration, number> = { month: 30, half: 182, year: 365 };
export const DURATION_LABEL: Record<IdentityDuration, string> = { month: 'شهري', half: 'نصف سنوي', year: 'سنوي' };
export type IdentityPlan = { idx: number; name: string; accounts: number; month: number; half: number; year: number };

const DEFAULT_NAMES = ['ذهبية', 'فضية', 'برونزية'];

export async function getIdentityPlans(): Promise<IdentityPlan[]> {
  const out: IdentityPlan[] = [];
  for (let i = 1; i <= 3; i++) {
    const [name, acc, m, h, y] = await Promise.all([
      getSetting(`idpkg${i}_name`, DEFAULT_NAMES[i - 1]).catch(() => DEFAULT_NAMES[i - 1]),
      getSettingNum(`idpkg${i}_acc`, 0).catch(() => 0),
      getSettingNum(`idpkg${i}_m`, 0).catch(() => 0),
      getSettingNum(`idpkg${i}_h`, 0).catch(() => 0),
      getSettingNum(`idpkg${i}_y`, 0).catch(() => 0),
    ]);
    out.push({ idx: i, name: (name || DEFAULT_NAMES[i - 1]).slice(0, 24), accounts: Math.max(0, acc), month: Math.max(0, m), half: Math.max(0, h), year: Math.max(0, y) });
  }
  return out;
}

/** الميزة مدفوعة فعلاً؟ (باقة واحدة على الأقل بعدد حسابات وسعر). قبلها كل شيء مجاني. */
export async function identityFeaturePaid(): Promise<boolean> {
  const plans = await getIdentityPlans();
  return plans.some((p) => p.accounts > 0 && (p.month > 0 || p.half > 0 || p.year > 0));
}

export async function getExemptDays(): Promise<number> {
  return getSettingNum('identity_exempt_days', 180).catch(() => 180);
}

export function planPrice(p: IdentityPlan, dur: IdentityDuration): number {
  return dur === 'month' ? p.month : dur === 'half' ? p.half : p.year;
}

export type MemberSub = {
  featurePaid: boolean;
  active: boolean;
  paid: boolean;
  slots: number;
  until: string | null;
  planName: string | null;
  exemptActive: boolean;
  exemptUntil: string | null;
};

/** حالة اشتراك العضو في باقات الهويات + الإعفاء. slots = عدد الهويات الإضافية المتاحة الآن. */
export async function getMemberIdentitySub(userId: number): Promise<MemberSub> {
  await ensureSchema();
  const featurePaid = await identityFeaturePaid();
  const u = await prisma.users.findUnique({ where: { id: BigInt(userId) }, select: { identity_paid_until: true, identity_accounts: true, identity_plan: true } }).catch(() => null);
  const now = Date.now();
  const paidEnd = u?.identity_paid_until ? u.identity_paid_until.getTime() : 0;
  const paid = paidEnd > now;
  // إعفاء: يُحتسب من تاريخ أول هوية إضافية (أقدمها) — للحسابات الموجودة سابقاً
  const exemptDays = await getExemptDays();
  const firstExtra = await prisma.profiles.findFirst({ where: { user_id: BigInt(userId), is_default: 0, type: 'personal' }, orderBy: { id: 'asc' }, select: { created_at: true } }).catch(() => null);
  const exemptEnd = exemptDays > 0 && firstExtra?.created_at ? firstExtra.created_at.getTime() + exemptDays * 86400_000 : 0;
  const exemptActive = exemptEnd > now;
  const active = !featurePaid || paid || exemptActive;
  const slots = !featurePaid ? 999 : paid ? (u?.identity_accounts || 0) : exemptActive ? 999 : 0;
  return {
    featurePaid, active, paid, slots,
    until: paid && u?.identity_paid_until ? u.identity_paid_until.toISOString() : null,
    planName: paid ? (u?.identity_plan || null) : null,
    exemptActive, exemptUntil: exemptActive ? new Date(exemptEnd).toISOString() : null,
  };
}

/** اشتراك/تجديد بباقة لمدّة — يخصم من المحفظة ويمنح عدد حسابات الباقة للمدّة. */
export async function subscribeIdentityPlan(userId: number, idx: number, dur: IdentityDuration): Promise<{ ok: boolean; error?: string; price?: number; balance?: number }> {
  await ensureSchema();
  const plans = await getIdentityPlans();
  const plan = plans.find((p) => p.idx === idx);
  if (!plan || plan.accounts <= 0) return { ok: false, error: 'notfound' };
  const price = planPrice(plan, dur);
  if (price <= 0) return { ok: false, error: 'noprice' };
  const { charge } = await import('./wallet');
  const paid = await charge(userId, price, 'subscription', `اشتراك باقة الهويات «${plan.name}» (${DURATION_LABEL[dur]})`);
  if (!paid.ok) return { ok: false, error: 'nocredit', balance: paid.balance, price };
  const u = await prisma.users.findUnique({ where: { id: BigInt(userId) }, select: { identity_paid_until: true } }).catch(() => null);
  const now = Date.now();
  const base = u?.identity_paid_until && u.identity_paid_until.getTime() > now ? u.identity_paid_until.getTime() : now;
  const until = new Date(base + DURATION_DAYS[dur] * 86400_000);
  await prisma.users.update({ where: { id: BigInt(userId) }, data: { identity_paid_until: until, identity_accounts: plan.accounts, identity_plan: plan.name } }).catch(() => {});
  return { ok: true, price };
}
