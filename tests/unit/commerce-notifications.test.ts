import { describe, expect, it, vi } from 'vitest';
import { dispatchPaidNotification, type NotificationDb } from '@/lib/commerce/notifications';
import { commerceConfigFromRows } from '@/lib/commerce/config';
const cfg = commerceConfigFromRows([{ k: 'commerce_notifications_enabled', v: '1' }]);
const row = { channel: 'sms', recipient: '966501234567', payload: { orderId: '1', amountMinor: 1025, currency: 'SAR', providerReference: 'ref1' } };
function fixture() {
  const execute = vi.fn().mockResolvedValue(1), query = vi.fn().mockResolvedValue([row]);
  const transport = { sms: vi.fn().mockResolvedValue(true), whatsapp: vi.fn().mockResolvedValue(true) };
  return { db: { $executeRaw: execute, $queryRaw: query } as NotificationDb, execute, query, transport };
}
describe('durable notification dispatcher', () => {
  it('does not deliver anything when the independent commerce notification switch is off', async () => {
    const { db, execute, transport } = fixture();
    expect(await dispatchPaidNotification(db, 1n, commerceConfigFromRows([]), transport)).toBe('disabled');
    expect(execute).not.toHaveBeenCalled(); expect(transport.sms).not.toHaveBeenCalled();
  });
  it('delivers only after the atomic pending claim and acknowledges that claim', async () => {
    const { db, execute, transport } = fixture();
    expect(await dispatchPaidNotification(db, 1n, cfg, transport)).toBe('sent');
    expect(transport.sms).toHaveBeenCalledExactlyOnceWith('966501234567', expect.stringContaining('10.25'));
    expect(transport.whatsapp).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(2);
  });
  it('never sends an already claimed/unknown/sent row', async () => {
    const { db, execute, transport } = fixture(); execute.mockResolvedValueOnce(0);
    expect(await dispatchPaidNotification(db, 1n, cfg, transport)).toBe('not_pending');
    expect(transport.sms).not.toHaveBeenCalled();
  });
  it.each([false, 'throw'])('records uncertain delivery without blind retry (%s)', async outcome => {
    const { db, transport } = fixture();
    if (outcome === false) transport.sms.mockResolvedValueOnce(false);
    else transport.sms.mockRejectedValueOnce(new Error('timeout with credentials must not be logged'));
    expect(await dispatchPaidNotification(db, 1n, cfg, transport)).toBe('unknown');
    expect(transport.sms).toHaveBeenCalledTimes(1);
  });
  it('does not deliver corrupt payloads or non-phone destinations', async () => {
    const { db, query, transport } = fixture();
    query.mockResolvedValueOnce([{ ...row, payload: { ...row.payload, amountMinor: '10.25' } }]);
    expect(await dispatchPaidNotification(db, 1n, cfg, transport)).toBe('unknown');
    expect(transport.sms).not.toHaveBeenCalled();
  });
});
