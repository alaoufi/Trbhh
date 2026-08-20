import 'server-only';
import { SITE } from '@/lib/constants';
import { createOnlineTopup, attachProviderRef, getTopupById, creditOnlineTopupAtomically, findTopupByProviderRef, applyTopupBonuses, rejectOnlineTopup } from '@/lib/wallet';
import { classifyPaymentRejection } from './rejection';
import { getPaymentConfig, getProviderCreds, isOnlinePayReady, getActiveMethods } from './config';
import { providerMeta } from './registry';
import type { PayProvider, PayProviderId } from './types';
import { moyasar } from './providers/moyasar';
import { tap } from './providers/tap';
import { paytabs } from './providers/paytabs';
import { alrajhiArb, decodeArbCallback, extractArbFailureCode } from './providers/alrajhi-arb';

export { PROVIDER_META, providerMeta, readyProviders } from './registry';
export { getPaymentConfig, getProviderCreds, isOnlinePayReady, isProviderConfigured, savePaymentSettings, saveProviderCreds, getEnabledMethods, getActiveMethods, setEnabledMethods, getTopupMethodAvailability, saveTopupMethodSettings, alrajhiConfigReport, CONTROLLABLE_METHODS, METHOD_LABEL_AR } from './config';
export type { PaymentConfig } from './config';

/** سجلّ مُحوِّلات المزوّدين الجاهزين (لها كود مكتمل). */
const ADAPTERS: Partial<Record<PayProviderId, PayProvider>> = { moyasar, tap, paytabs, alrajhi_arb: alrajhiArb };

export function getAdapter(id: string): PayProvider | null {
  return ADAPTERS[id as PayProviderId] ?? null;
}

function baseUrl(): string {
  return `https://${SITE.domain}`;
}

export type StartResult = { ok: boolean; redirectUrl?: string; error?: string };

/**
 * يبدأ عملية شحن رصيد إلكتروني: يتحقّق من التهيئة والحدود، ينشئ طلب شحن معلّقاً، ثم عملية دفع
 * لدى المزوّد الفعّال، ويعيد رابط صفحة الدفع لتوجيه العميل إليه.
 */
export async function startTopupPayment(
  userId: number,
  amountSar: number,
  customer?: { name?: string; email?: string; phone?: string; ip?: string },
): Promise<StartResult> {
  if (!(await isOnlinePayReady())) return { ok: false, error: 'الدفع الإلكتروني غير مُفعَّل حالياً' };
  const cfg = await getPaymentConfig();
  const amt = Math.round(amountSar || 0);
  if (!Number.isFinite(amt) || amt < cfg.min) return { ok: false, error: `أقل مبلغ للشحن ${cfg.min} ر.س` };
  if (amt > cfg.max) return { ok: false, error: `أعلى مبلغ للشحن ${cfg.max} ر.س` };

  const adapter = getAdapter(cfg.provider);
  if (!adapter) return { ok: false, error: 'مزوّد الدفع غير متاح' };
  const creds = await getProviderCreds(cfg.provider);
  const methods = await getActiveMethods(cfg.provider); // الوسائل التي اختارها الأدمن ويدعمها المزوّد
  if (methods.length === 0) return { ok: false, error: 'لا توجد وسيلة دفع مُفعّلة' };

  const topupId = await createOnlineTopup(userId, amt, cfg.provider);
  if (!topupId) return { ok: false, error: 'تعذّر إنشاء طلب الشحن' };

  const res = await adapter.createPayment(
    {
      amountSar: amt,
      topupId,
      description: `شحن رصيد تربح — ${amt} ر.س (#${topupId})`,
      callbackUrl: `${baseUrl()}/api/pay/callback/${cfg.provider}?t=${topupId}`,
      webhookUrl: `${baseUrl()}/api/pay/webhook/${cfg.provider}`,
      methods,
      customerName: customer?.name,
      customerEmail: customer?.email,
      customerPhone: customer?.phone,
      customerIp: customer?.ip,
    },
    creds,
    cfg.mode,
  );

  if (!res.ok || !res.redirectUrl) return { ok: false, error: res.error || 'تعذّر بدء الدفع' };
  if (res.providerRef) await attachProviderRef(topupId, res.providerRef);
  return { ok: true, redirectUrl: res.redirectUrl };
}

/**
 * يؤكّد طلب شحن بمعرّفه: يسحب حالة العملية من المزوّد (المصدر الموثوق)، ويعتمد الشحن إن اكتمل
 * الدفع وتطابق المبلغ. آمنٌ للتكرار (عودة المتصفح + الويبهوك). يعيد paid/credited.
 */
export async function confirmTopupById(topupId: number): Promise<{ paid: boolean; credited: boolean; reason?: string }> {
  const row = await getTopupById(topupId);
  if (!row) return { paid: false, credited: false, reason: 'not_found' };
  if (row.status === 1) return { paid: true, credited: true }; // اعتُمد سابقاً
  if (row.source !== 'online' || !row.provider) return { paid: false, credited: false, reason: 'not_online' };
  const adapter = getAdapter(row.provider);
  if (!adapter) return { paid: false, credited: false, reason: 'no_adapter' };

  const providerRef = await providerRefOf(topupId);
  if (!providerRef) return { paid: false, credited: false, reason: 'no_ref' };

  const creds = await getProviderCreds(row.provider);
  const cfg = await getPaymentConfig();
  const v = await adapter.verifyByRef(providerRef, creds, cfg.mode, row.amount, String(topupId));
  if (!v.paid) {
    const rejected = classifyPaymentRejection(v.status);
    if (rejected.final) await rejectOnlineTopup(topupId, rejected.message);
    return { paid: false, credited: false, reason: rejected.code };
  }
  if (row.provider === 'alrajhi_arb' && v.merchantTrackId !== String(topupId)) {
    return { paid: false, credited: false, reason: 'track_mismatch' };
  }
  // مطابقة المبلغ حماية من التلاعب
  if (v.amountSar > 0 && Math.abs(v.amountSar - row.amount) > 0) {
    return { paid: true, credited: false, reason: 'amount_mismatch' };
  }
  const r = await creditOnlineTopupAtomically(topupId, v.method || null);
  if (r.ok && !r.already && r.userId && r.amount) await applyTopupBonuses(r.userId, r.amount, 0).catch(() => {});
  return { paid: true, credited: r.ok };
}

/** يؤكّد شحناً من إشعار ويبهوك: يجد الطلب بمعرّف عملية المزوّد ثم يؤكّده. */
export async function confirmFromWebhook(provider: string, body: unknown, query: URLSearchParams): Promise<{ handled: boolean }> {
  const adapter = getAdapter(provider);
  const meta = providerMeta(provider);
  if (!adapter || !meta) return { handled: false };
  const ref = adapter.extractRefFromWebhook(body, query);
  if (!ref) return { handled: false };
  const topupId = await findTopupByProviderRef(provider, ref);
  if (!topupId) return { handled: false };
  await confirmTopupById(topupId);
  return { handled: true };
}

/**
 * ARB requires a positive acknowledgement before it settles a Bank Hosted payment.
 * We only acknowledge an encrypted notification when it binds to the pending top-up
 * through its encrypted final transaction ID and our Track ID. Credit still happens only
 * after the later server-to-server inquiry.
 */
export type AlrajhiCallbackValidation =
  | { valid: false; reason: 'missing_topup_id' | 'topup_not_found' | 'not_alrajhi_topup' | 'missing_provider_ref' | 'invalid_encrypted_payload' | 'transaction_id_missing' | 'track_id_mismatch'; gatewayCode?: string }
  | { valid: true; reason: 'valid'; providerRef: string };

/**
 * Safe diagnostic used only for the bank acknowledgement path.  It never logs
 * the encrypted payload, payment reference, or customer data.
 */
export async function inspectAlrajhiCallback(topupId: number, body: unknown): Promise<AlrajhiCallbackValidation> {
  if (!topupId) return { valid: false, reason: 'missing_topup_id' };
  const row = await getTopupById(topupId);
  if (!row) return { valid: false, reason: 'topup_not_found' };
  if (row.source !== 'online' || row.provider !== 'alrajhi_arb') return { valid: false, reason: 'not_alrajhi_topup' };
  const creds = await getProviderCreds('alrajhi_arb');
  const data = decodeArbCallback(body, creds.terminal_resource_key || '');
  if (!data) return { valid: false, reason: 'invalid_encrypted_payload' };
  const providerRef = String(data.transId || '');
  if (!providerRef) return { valid: false, reason: 'transaction_id_missing', gatewayCode: extractArbFailureCode(data) || undefined };
  if (String(data.trackId || '') !== String(topupId)) return { valid: false, reason: 'track_id_mismatch' };
  return { valid: true, reason: 'valid', providerRef };
}

export async function validateAlrajhiCallback(topupId: number, body: unknown): Promise<boolean> {
  return (await inspectAlrajhiCallback(topupId, body)).valid;
}

/** يقرأ معرّف عملية المزوّد المخزّن على طلب الشحن. */
async function providerRefOf(topupId: number): Promise<string | null> {
  const { prisma } = await import('@/lib/prisma');
  const r = await prisma.wallet_topups.findUnique({ where: { id: BigInt(topupId) }, select: { provider_ref: true } }).catch(() => null);
  return r?.provider_ref ?? null;
}
