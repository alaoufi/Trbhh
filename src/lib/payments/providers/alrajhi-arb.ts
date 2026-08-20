import 'server-only';
import { createCipheriv, createDecipheriv } from 'node:crypto';
import type { CreatePaymentInput, CreatePaymentResult, PayMethod, PayProvider, ProviderCreds, VerifyResult } from '../types';

const IV = Buffer.from('PGKEYENCDECIVSPC', 'utf8');
// ARB documents a separate endpoint for Bank Hosted (the selected integration)
// and Merchant Hosted. We must never send a Bank Hosted request to tranportal.htm.
const DEFAULT_GATEWAY_URL = 'https://securepayments.alrajhibank.com.sa/pg/payment/hosted.htm';
const DEFAULT_HOSTED_URL = 'https://securepayments.alrajhibank.com.sa/pg/paymentpage.htm';

function keyFor(resourceKey: string): Buffer {
  const key = Buffer.from(resourceKey, 'utf8');
  if (key.length !== 32) throw new Error('Terminal Resource Key must be exactly 32 bytes');
  return key;
}

export function encryptArbTrandata(plain: string, resourceKey: string): string {
  const cipher = createCipheriv('aes-256-cbc', keyFor(resourceKey), IV);
  // ARB's official JavaScript sample URL-encodes first, then returns uppercase hex.
  return Buffer.concat([cipher.update(encodeURIComponent(plain), 'utf8'), cipher.final()]).toString('hex').toUpperCase();
}

export function decryptArbTrandata(encrypted: string, resourceKey: string): string {
  const decipher = createDecipheriv('aes-256-cbc', keyFor(resourceKey), IV);
  return decodeURIComponent(Buffer.concat([decipher.update(Buffer.from(encrypted, 'hex')), decipher.final()]).toString('utf8'));
}

type ArbResponse = { status?: string | number; result?: string; error?: string; errorText?: string; trandata?: string };

function firstResponse(payload: unknown): ArbResponse {
  return (Array.isArray(payload) ? payload[0] : payload) as ArbResponse || {};
}

function firstData(payload: unknown): Record<string, unknown> {
  return (Array.isArray(payload) ? payload[0] : payload) as Record<string, unknown> || {};
}

export function parseArbInitialResponse(payload: unknown): { paymentId: string; redirectUrl: string } | null {
  const response = firstResponse(payload);
  if (String(response.status) !== '1' || !response.result) return null;
  const separator = response.result.indexOf(':https://');
  if (separator <= 0) return null;
  const paymentId = response.result.slice(0, separator);
  const pageUrl = response.result.slice(separator + 1);
  return { paymentId, redirectUrl: `${pageUrl}?PaymentID=${encodeURIComponent(paymentId)}` };
}

/** Decrypt the bank notification and reject mismatched outer/inner payment IDs. */
export function decodeArbCallback(payload: unknown, resourceKey: string): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') return null;
  const body = payload as Record<string, unknown>;
  const outerPaymentId = String(body.paymentId || body.PaymentID || '');
  const encrypted = typeof body.trandata === 'string' ? body.trandata : '';
  if (!outerPaymentId || !encrypted) return null;
  try {
    const data = firstData(JSON.parse(decryptArbTrandata(encrypted, resourceKey)));
    if (String(data.paymentId || '') !== outerPaymentId) return null;
    return data;
  } catch { return null; }
}

function numberString(amount: number): string { return amount.toFixed(2); }
function gatewayUrl(creds: ProviderCreds): string { return creds.gateway_url || DEFAULT_GATEWAY_URL; }
function tranportalGatewayUrl(creds: ProviderCreds): string { return creds.tranportal_gateway_url || ''; }
function hostedUrl(creds: ProviderCreds): string { return creds.hosted_payment_url || DEFAULT_HOSTED_URL; }

/**
 * Build the initial Bank Hosted request exactly as ARB expects it.
 * Optional UDF fields are intentionally omitted: ARB rejects values that do
 * not match its per-terminal validation rules (IPAY0100028).
 */
export function buildArbPurchaseTrandata(
  input: Pick<CreatePaymentInput, 'amountSar' | 'topupId' | 'callbackUrl'>,
  creds: Pick<ProviderCreds, 'tranportal_id' | 'tranportal_password'>,
): string {
  return JSON.stringify([{
    amt: numberString(input.amountSar),
    action: '1',
    password: creds.tranportal_password,
    id: creds.tranportal_id,
    currencyCode: '682',
    trackId: String(input.topupId),
    responseURL: input.callbackUrl,
    errorURL: input.callbackUrl,
    langid: 'ar',
  }]);
}

/**
 * Build the ARB supporting-transactions inquiry by bank PaymentID.
 * `trackId` remains Trbhh's original merchant identifier; ARB uses `udf5`
 * to select the lookup key held in `transId`.
 */
export function buildArbInquiryTrandata(
  input: { amountSar: number; paymentId: string; trackId: string },
  creds: Pick<ProviderCreds, 'tranportal_id' | 'tranportal_password'>,
): string {
  return JSON.stringify([{
    id: creds.tranportal_id,
    password: creds.tranportal_password,
    action: '8',
    amt: numberString(input.amountSar),
    currencyCode: '682',
    trackId: input.trackId,
    udf5: 'PaymentID',
    transId: input.paymentId,
  }]);
}

async function gatewayRequest(url: string, payload: unknown, customerIp?: string): Promise<{ ok: boolean; data: unknown; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' };
    if (customerIp) headers['x-forwarded-for'] = customerIp;
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload), signal: controller.signal, cache: 'no-store' });
    const text = await response.text();
    let data: unknown = null;
    try { data = JSON.parse(text); } catch { return { ok: false, data: null, error: 'استجابة مصرف الراجحي ليست JSON صالحاً' }; }
    return { ok: response.ok, data, error: response.ok ? undefined : `HTTP ${response.status}` };
  } catch { return { ok: false, data: null, error: 'تعذر الاتصال الآمن ببوابة الراجحي' }; }
  finally { clearTimeout(timeout); }
}

function paymentMethod(cardType: unknown): PayMethod | null {
  const card = String(cardType || '').toLowerCase();
  if (card.includes('mada')) return 'mada';
  if (card.includes('visa')) return 'visa';
  if (card.includes('master')) return 'mastercard';
  return card ? 'card' : null;
}

export const alrajhiArb: PayProvider = {
  id: 'alrajhi_arb',
  async createPayment(input: CreatePaymentInput, creds: ProviderCreds): Promise<CreatePaymentResult> {
    try {
      const id = creds.tranportal_id;
      const password = creds.tranportal_password;
      const resourceKey = creds.terminal_resource_key;
      if (!id || !password || !resourceKey) return { ok: false, error: 'حقول الراجحي المطلوبة غير مكتملة في بيئة الخادم' };
      const plain = buildArbPurchaseTrandata(input, { tranportal_id: id, tranportal_password: password });
      const result = await gatewayRequest(gatewayUrl(creds), [{ id, trandata: encryptArbTrandata(plain, resourceKey), responseURL: input.callbackUrl, errorURL: input.callbackUrl }], input.customerIp);
      const parsed = result.ok ? parseArbInitialResponse(result.data) : null;
      if (!parsed) {
        const response = firstResponse(result.data);
        return { ok: false, error: response.errorText || response.error || result.error || 'رفض مصرف الراجحي إنشاء عملية الدفع' };
      }
      // The URL returned by the bank is authoritative; the fallback only keeps test contracts explicit.
      return { ok: true, providerRef: parsed.paymentId, redirectUrl: parsed.redirectUrl || `${hostedUrl(creds)}?PaymentID=${encodeURIComponent(parsed.paymentId)}` };
    } catch { return { ok: false, error: 'تعذر تجهيز عملية الراجحي؛ تحقق من Terminal Resource Key' }; }
  },
  async verifyByRef(providerRef: string, creds: ProviderCreds, _mode, expectedAmountSar = 0, expectedTrackId = ''): Promise<VerifyResult> {
    try {
      const id = creds.tranportal_id;
      const password = creds.tranportal_password;
      const resourceKey = creds.terminal_resource_key;
      const supportingUrl = tranportalGatewayUrl(creds);
      if (!id || !password || !resourceKey || !supportingUrl || !expectedTrackId) return { paid: false, amountSar: 0, providerRef, status: 'configuration_missing' };
      const plain = buildArbInquiryTrandata({ amountSar: expectedAmountSar, paymentId: providerRef, trackId: expectedTrackId }, { tranportal_id: id, tranportal_password: password });
      const result = await gatewayRequest(supportingUrl, [{ id, trandata: encryptArbTrandata(plain, resourceKey) }]);
      const response = firstResponse(result.data);
      if (!result.ok || String(response.status) !== '1' || !response.trandata) return { paid: false, amountSar: 0, providerRef, status: response.error || response.errorText || result.error || 'inquiry_failed' };
      const data = firstData(JSON.parse(decryptArbTrandata(response.trandata, resourceKey)));
      const amountSar = Number(data.amt || 0);
      const merchantTrackId = String(data.trackId || '');
      const paid = String(data.result || '').toUpperCase() === 'CAPTURED'
        && String(data.paymentId || '') === providerRef
        && merchantTrackId === expectedTrackId;
      return { paid, amountSar, providerRef, merchantTrackId, method: paymentMethod(data.cardType), status: String(data.result || 'unknown') };
    } catch { return { paid: false, amountSar: 0, providerRef, status: 'inquiry_invalid' }; }
  },
  extractRefFromWebhook(_body, query): string | null { return query.get('paymentId') || query.get('PaymentID') || null; },
};
