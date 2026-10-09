import { describe, expect, it } from 'vitest';
import { extractCjStatusEvent } from '@/lib/cj/orders/sync-status';

describe('استخراج حقول حالة webhook من CJ', () => {
  it('يقرأ من الجذر أو من data، وبأسماء CJ المتعدّدة', () => {
    const a = extractCjStatusEvent({ orderId: 'CJ123', orderNumber: 'TRB-1', orderStatus: 'Shipped', trackNumber: 'LP777' });
    expect(a).toEqual({ cjOrderId: 'CJ123', orderNumber: 'TRB-1', rawStatus: 'Shipped', trackNumber: 'LP777' });

    const b = extractCjStatusEvent({ type: 'order', data: { cjOrderId: 'CJ9', orderNum: 'TRB-9', status: 'DELIVERED', trackingNumber: 'YT1' } });
    expect(b.cjOrderId).toBe('CJ9');
    expect(b.orderNumber).toBe('TRB-9');
    expect(b.rawStatus).toBe('DELIVERED');
    expect(b.trackNumber).toBe('YT1');
  });

  it('يعيد قيماً فارغة بلا خطأ عند غياب الحقول', () => {
    expect(extractCjStatusEvent({})).toEqual({ cjOrderId: '', orderNumber: '', rawStatus: '', trackNumber: '' });
  });

  it('يتسامح مع القيم الرقمية ويقصّ الطويل', () => {
    const r = extractCjStatusEvent({ orderId: 12345, logisticStatus: 'in transit' });
    expect(r.cjOrderId).toBe('12345');
    expect(r.rawStatus).toBe('in transit');
  });
});
