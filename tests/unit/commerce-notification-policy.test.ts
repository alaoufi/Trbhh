import { describe, expect, it } from 'vitest';
import { paymentNotificationTargets, renderPaymentNotice } from '@/lib/commerce/notification-policy';
import { commerceConfigFromRows } from '@/lib/commerce/config';

const config = commerceConfigFromRows([
  { k: 'commerce_notifications_enabled', v: '1' },
  { k: 'commerce_admin_phone', v: '0501234567' },
]);
const channels = { sms: true, whatsapp: true };

describe('commerce notification routing independent of payment execution', () => {
  it('queues dashboard confirmation plus both configured channels for customer and admin', () => {
    const result = paymentNotificationTargets(config, channels, { userId: 12, phone: '0551234567' });
    expect(result).toContainEqual({ channel: 'in_app', recipient: 'member:12' });
    expect(result).toContainEqual({ channel: 'in_app', recipient: 'admin' });
    expect(result.filter(r => r.channel === 'sms')).toHaveLength(2);
    expect(result.filter(r => r.channel === 'whatsapp')).toHaveLength(2);
  });
  it('uses whichever channel exists and deduplicates the same phone', () => {
    expect(paymentNotificationTargets(config, { sms: true, whatsapp: false }, { userId: 12, phone: '+966501234567' }))
      .toEqual([{ channel: 'in_app', recipient: 'member:12' }, { channel: 'in_app', recipient: 'admin' }, { channel: 'sms', recipient: '966501234567' }]);
  });
  it('keeps dashboard confirmation even when external delivery is off or unavailable', () => {
    expect(paymentNotificationTargets(commerceConfigFromRows([]), channels, { userId: 12, phone: '0551234567' })).toHaveLength(2);
    expect(paymentNotificationTargets(config, { sms: false, whatsapp: false }, { userId: 12, phone: '0551234567' })).toHaveLength(2);
  });
  it('does not route invalid phones and refuses malformed member identity', () => {
    expect(paymentNotificationTargets(config, channels, { userId: 12, phone: 'xxx' })).toHaveLength(4);
    expect(() => paymentNotificationTargets(config, channels, { userId: 0, phone: '' })).toThrow();
  });
  it('renders exact two-decimal money without card details', () => {
    expect(renderPaymentNotice(config.text.paidMessage, { order: 'TB-12', amountMinor: 1025, reference: 'ref-12' }))
      .toBe('تربح: تم تأكيد دفع الطلب TB-12 بمبلغ 10.25 ر.س. مرجع الدفع: ref-12');
    expect(() => renderPaymentNotice('{amount}', { order: '12', amountMinor: 10.25, reference: 'r' })).toThrow();
  });
});
