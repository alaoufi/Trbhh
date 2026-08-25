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

type ArbResponse = { status?: string | number; result?: string; error?: string; errorText?: string; trandata?: string; paymentId?: string | number; PaymentID?: string | number };

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

/** Read the payment ID that ARB sends outside its encrypted transaction data. */
export function extractArbCallbackPaymentId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const body = firstResponse(payload);
  const paymentId = String(body.paymentId || body.PaymentID || '');
  return paymentId || null;
}

/** Decrypt the bank notification. ARB documents distinct outer and inner payment IDs. */
export function decodeArbCallback(payload: unknown, resourceKey: string): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') return null;
  // ARB documents its merchant notification as a one-item JSON array.
  const body = firstResponse(payload);
  const encrypted = typeof body.trandata === 'string' ? body.trandata : '';
  if (!encrypted) return null;
  try {
    const data = firstData(JSON.parse(decryptArbTrandata(encrypted, resourceKey)));
    return data;
  } catch { return null; }
}

/**
 * ARB can put the issuer's final error in the outer response envelope while
 * retaining the transaction identifiers in encrypted trandata.  Preserve both
 * sources so a documented final decline is not mistaken for an unknown state.
 */
export function mergeArbCallbackOutcome(data: Record<string, unknown>, payload: unknown): Record<string, unknown> {
  const outer = firstData(payload);
  const merged: Record<string, unknown> = { ...data };
  for (const key of ['error', 'errorText', 'responseText', 'responseCode', 'authRespCode', 'status', 'result']) {
    if (!merged[key] && outer[key]) merged[key] = outer[key];
  }
  return merged;
}

/**
 * Failure text from ARB is not safe to show wholesale: it can vary by bank
 * channel. Keep only the documented IPAY code for support diagnostics.
 */
export function extractArbFailureCode(data: Record<string, unknown>): string | null {
  const match = [data.error, data.errorText, data.result]
    .map((value) => String(value || '').match(/\bIPAY\d{7}\b/i)?.[0])
    .find(Boolean);
  return match ? match.toUpperCase() : null;
}

/**
 * A bank-hosted notification can explicitly say that the issuer rejected the
 * payment (for example after OTP). That is final: leaving it pending would
 * incorrectly ask the member or admin to confirm a rejected payment.
 * Unknown notifications stay pending for the server-to-server inquiry.
 */
export function isArbFinalDecline(data: Record<string, unknown>): boolean {
  const status = [data.errorText, data.error, data.result, data.responseText, data.responseCode, data.authRespCode, data.status]
    .map((value) => String(value || ''))
    .join(' ')
    .toUpperCase();
  return /DECLIN|DENIED|REJECT|NOT\s*CAPTURED|SECURITY|3D\s*SECURE|3DS|AUTHENTICATION|OTP|INSUFFICIENT|NO\s*FUNDS|INVALID|EXPIRED|CANCEL|إعدادات?\s*الأمان|اعدادات?\s*الامان/.test(status);
}

/** A captured result in ARB's encrypted final response is the bank's settlement decision. */
export function isArbCaptured(data: Record<string, unknown>): boolean {
  const result = data.result;
  const status = Array.isArray(result)
    ? String((result[0] as Record<string, unknown> | undefined)?.status || '')
    : String(result || data.status || '');
  return status.trim().toUpperCase() === 'CAPTURED';
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
 * Build the ARB supporting-transactions inquiry by the bank transaction ID.
 * `trackId` remains Trbhh's original merchant identifier; ARB uses `udf5`
 * to select the lookup key held in `transId`.
 */
export function buildArbInquiryTrandata(
  input: { amountSar: number; transactionId: string; trackId: string },
  creds: Pick<ProviderCreds, 'tranportal_id' | 'tranportal_password'>,
  lookup: 'PaymentID' | 'TRANID' = 'PaymentID',
): string {
  return JSON.stringify([{
    id: creds.tranportal_id,
    password: creds.tranportal_password,
    action: '8',
    amt: numberString(input.amountSar),
    currencyCode: '682',
    trackId: input.trackId,
    udf5: lookup,
    transId: input.transactionId,
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

export function arbPaymentMethod(cardType: unknown): PayMethod | null {
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
      const inquire = async (lookup: 'PaymentID' | 'TRANID') => {
        const plain = buildArbInquiryTrandata({ amountSar: expectedAmountSar, transactionId: providerRef, trackId: expectedTrackId }, { tranportal_id: id, tranportal_password: password }, lookup);
        const result = await gatewayRequest(supportingUrl, [{ id, trandata: encryptArbTrandata(plain, resourceKey) }]);
        return { result, response: firstResponse(result.data) };
      };
      // New transactions retain ARB's original PaymentID.  The legacy fallback
      // supports attempts created before that correction, where this column was
      // overwritten with the later TransID.
      let inquiry = await inquire('PaymentID');
      if ((!inquiry.result.ok || String(inquiry.response.status) !== '1' || !inquiry.response.trandata)) inquiry = await inquire('TRANID');
      const { result, response } = inquiry;
      if (!result.ok || String(response.status) !== '1' || !response.trandata) return { paid: false, amountSar: 0, providerRef, status: response.error || response.errorText || result.error || 'inquiry_failed' };
      const data = firstData(JSON.parse(decryptArbTrandata(response.trandata, resourceKey)));
      const amountSar = Number(data.amt || 0);
      const merchantTrackId = String(data.trackId || '');
      const rawStatus = String(data.errorText || data.error || data.result || 'unknown');
      const paid = isArbCaptured(data)
        && (String(data.paymentId || '') === providerRef || String(data.transId || '') === providerRef)
        && merchantTrackId === expectedTrackId;
      return { paid, amountSar, providerRef, merchantTrackId, method: arbPaymentMethod(data.cardType), status: rawStatus };
    } catch { return { paid: false, amountSar: 0, providerRef, status: 'inquiry_invalid' }; }
  },
  extractRefFromWebhook(_body, query): string | null { return query.get('paymentId') || query.get('PaymentID') || null; },
};
