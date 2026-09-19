import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { saudiCommercePhone, type CommerceConfig } from './config';
import { renderPaymentNotice } from './notification-policy';

export type NotificationDb = Pick<PrismaClient, '$executeRaw' | '$queryRaw'>;
export type NotificationTransport = {
  sms(phone: string, message: string): Promise<boolean>;
  whatsapp(phone: string, message: string): Promise<boolean>;
};
type Delivery = { channel: string; recipient: string; payload: unknown };

/** At-most-once dispatch with durable claims. Existing adapters return boolean,
 * not provider idempotency tokens: false/timeouts are UNKNOWN, never auto-retried.
 * A crash after claiming leaves `sending` for manual provider reconciliation.
 * No dependency on payment orchestration is allowed in this module.
 */
export async function dispatchPaidNotification(
  db: NotificationDb, id: bigint, config: CommerceConfig, transport: NotificationTransport,
): Promise<'disabled' | 'not_pending' | 'sent' | 'unknown'> {
  if (!config.notificationsEnabled) return 'disabled';
  if (typeof id !== 'bigint' || id <= 0n) throw new Error('invalid_notification');
  const token = randomUUID();
  const claimed = await db.$executeRaw`UPDATE commerce_notifications SET status='sending',claim_token=${token},claimed_at=CURRENT_TIMESTAMP(3)
    WHERE id=${id} AND status='pending' AND event='payment_paid' AND channel IN ('sms','whatsapp')`;
  if (claimed !== 1) return 'not_pending';
  try {
    const [row] = await db.$queryRaw<Delivery[]>`SELECT channel,recipient,payload FROM commerce_notifications WHERE id=${id} AND claim_token=${token} AND status='sending'`;
    if (!row || (row.channel !== 'sms' && row.channel !== 'whatsapp')) throw new Error('invalid_delivery');
    const phone = saudiCommercePhone(row.recipient);
    const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
    if (!phone || !payload || typeof payload !== 'object' || payload.currency !== 'SAR'
      || typeof payload.orderId !== 'string' || !/^\d+$/.test(payload.orderId)
      || typeof payload.providerReference !== 'string' || !payload.providerReference || payload.providerReference.length > 160
      || !Number.isSafeInteger(payload.amountMinor) || payload.amountMinor <= 0) throw new Error('invalid_delivery');
    const message = renderPaymentNotice(config.text.paidMessage, { order: payload.orderId,
      amountMinor: payload.amountMinor, reference: payload.providerReference });
    if (!message.trim() || message.length > 1600) throw new Error('invalid_message');
    // Abort/false from an existing adapter is deliberately not a retry signal.
    const sent = await transport[row.channel](phone, message);
    if (!sent) throw new Error('delivery_unconfirmed');
    const changed = await db.$executeRaw`UPDATE commerce_notifications SET status='sent',sent_at=CURRENT_TIMESTAMP(3),last_error=NULL
      WHERE id=${id} AND claim_token=${token} AND status='sending'`;
    return changed === 1 ? 'sent' : 'unknown';
  } catch {
    // A constant diagnostic avoids leaking provider secrets/responses into logs.
    await db.$executeRaw`UPDATE commerce_notifications SET status='unknown',last_error='delivery_unconfirmed'
      WHERE id=${id} AND claim_token=${token} AND status='sending'`.catch(() => {});
    return 'unknown';
  }
}
