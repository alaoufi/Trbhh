import { saudiCommercePhone, type CommerceConfig } from './config';

export type PaymentNoticeTarget = { channel: 'in_app' | 'sms' | 'whatsapp'; recipient: string };

/** Pure routing only: never creates, retries, or verifies a payment. */
export function paymentNotificationTargets(
  config: CommerceConfig,
  available: { sms: boolean; whatsapp: boolean },
  customer: { userId: number; phone: string },
): PaymentNoticeTarget[] {
  if (!Number.isSafeInteger(customer.userId) || customer.userId <= 0) throw new Error('Invalid member');
  const targets: PaymentNoticeTarget[] = [
    { channel: 'in_app', recipient: `member:${customer.userId}` },
    { channel: 'in_app', recipient: 'admin' },
  ];
  if (!config.notificationsEnabled) return targets;
  const phones = new Set([saudiCommercePhone(customer.phone), config.adminPhone].filter((p): p is string => !!p));
  for (const phone of phones) {
    if (available.sms) targets.push({ channel: 'sms', recipient: phone });
    if (available.whatsapp) targets.push({ channel: 'whatsapp', recipient: phone });
  }
  return targets;
}

export function renderPaymentNotice(template: string, data: { order: string; amountMinor: number; reference: string }): string {
  if (!Number.isSafeInteger(data.amountMinor) || data.amountMinor < 0) throw new Error('Invalid amount');
  const amount = `${Math.floor(data.amountMinor / 100)}.${String(data.amountMinor % 100).padStart(2, '0')}`;
  const values = { order: data.order, amount, reference: data.reference };
  return template.replace(/\{(order|amount|reference)\}/g, (_, key: keyof typeof values) => values[key]);
}
