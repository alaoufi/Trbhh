import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  createCjOrder: vi.fn(),
  getOrderById: vi.fn(),
  parseOrderLines: vi.fn(),
  transitionOrder: vi.fn(),
  setOrderTracking: vi.fn(),
  appendOrderEvent: vi.fn(),
}));
vi.mock('@/lib/cj/client', () => ({ createCjOrder: mock.createCjOrder }));
vi.mock('@/lib/cj/orders/store', () => ({
  getOrderById: mock.getOrderById,
  parseOrderLines: mock.parseOrderLines,
  transitionOrder: mock.transitionOrder,
  setOrderTracking: mock.setOrderTracking,
  appendOrderEvent: mock.appendOrderEvent,
}));

import { buildCjOrderPayload, canDispatch, dispatchOrderToCj } from '@/lib/cj/orders/dispatch';

const baseOrder = {
  id: 7n, internal_ref: 'cjt-1-2', cj_order_id: '', status: 'paid', cj_lines_json: '[]',
  ship_country: 'sa', ship_region: 'الرياض', ship_city: 'الرياض', ship_address1: 'حي النخيل', ship_address2: 'شقة 3',
  ship_name: 'أحمد', ship_phone: '0500000000', ship_zip: '12345',
};
const lines = [{ vid: 'v1', quantity: 2, sku: 'S1', logisticName: 'CJPacket' }, { vid: 'v2', quantity: 1 }];

beforeEach(() => {
  vi.clearAllMocks();
  mock.getOrderById.mockResolvedValue({ ...baseOrder });
  mock.parseOrderLines.mockReturnValue(lines);
  mock.transitionOrder.mockResolvedValue({ ok: true, from: 'paid', to: 'sent_to_cj' });
  mock.setOrderTracking.mockResolvedValue(undefined);
  mock.appendOrderEvent.mockResolvedValue(true);
});

describe('canDispatch', () => {
  it('يسمح بالإرسال بعد تأكيد الدفع فقط', () => {
    expect(canDispatch('paid')).toBe(true);
    expect(canDispatch('verifying')).toBe(true);
    expect(canDispatch('awaiting_payment')).toBe(false);
    expect(canDispatch('sent_to_cj')).toBe(false);
    expect(canDispatch('completed')).toBe(false);
  });
});

describe('buildCjOrderPayload', () => {
  it('يبني حمولة المورد من الطلب والبنود (vid + كمية + مسار الشحن)', () => {
    const p = buildCjOrderPayload(baseOrder, lines);
    expect(p.orderNumber).toBe('cjt-1-2');
    expect(p.shippingCountryCode).toBe('SA');
    expect(p.shippingAddress).toBe('حي النخيل - شقة 3');
    expect(p.logisticName).toBe('CJPacket');
    expect(p.products).toEqual([{ vid: 'v1', quantity: 2 }, { vid: 'v2', quantity: 1 }]);
    expect(p.fromCountryCode).toBe('CN');
  });
});

describe('dispatchOrderToCj — الحارس الأمني', () => {
  it('عند قفل الشراء الحيّ: لا انتقال ولا شراء، ويُسجَّل «جاهز للإرسال»', async () => {
    mock.createCjOrder.mockResolvedValue({ ok: false, error: 'cj_purchasing_disabled' });
    const r = await dispatchOrderToCj(7n, 3);
    expect(r).toEqual({ ok: false, reason: 'blocked' });
    expect(mock.transitionOrder).not.toHaveBeenCalled();
    expect(mock.setOrderTracking).not.toHaveBeenCalled();
    expect(mock.appendOrderEvent).toHaveBeenCalledWith(7n, expect.objectContaining({ type: 'cj_dispatch_blocked' }));
  });

  it('لا يُرسل قبل تأكيد الدفع', async () => {
    mock.getOrderById.mockResolvedValue({ ...baseOrder, status: 'awaiting_payment' });
    const r = await dispatchOrderToCj(7n);
    expect(r).toEqual({ ok: false, reason: 'not_ready' });
    expect(mock.createCjOrder).not.toHaveBeenCalled();
  });

  it('لا يُرسل بلا بنود', async () => {
    mock.parseOrderLines.mockReturnValue([]);
    const r = await dispatchOrderToCj(7n);
    expect(r).toEqual({ ok: false, reason: 'no_lines' });
    expect(mock.createCjOrder).not.toHaveBeenCalled();
  });

  it('idempotent: طلب أُرسل سابقاً لا يُرسَل ثانية', async () => {
    mock.getOrderById.mockResolvedValue({ ...baseOrder, cj_order_id: 'CJ-OLD' });
    const r = await dispatchOrderToCj(7n);
    expect(r).toEqual({ ok: true, cjOrderId: 'CJ-OLD' });
    expect(mock.createCjOrder).not.toHaveBeenCalled();
  });

  it('عند تفعيل الشراء ونجاح المورد: يخزّن المعرّف وينتقل إلى sent_to_cj', async () => {
    mock.createCjOrder.mockResolvedValue({ ok: true, data: { orderId: 'CJ-123' } });
    const r = await dispatchOrderToCj(7n, 3);
    expect(r).toEqual({ ok: true, cjOrderId: 'CJ-123' });
    expect(mock.setOrderTracking).toHaveBeenCalledWith(7n, { cjOrderId: 'CJ-123' }, expect.objectContaining({ source: 'cj' }));
    expect(mock.transitionOrder).toHaveBeenCalledWith(7n, 'sent_to_cj', expect.objectContaining({ source: 'internal' }));
  });

  it('عند فشل المورد: يعلّم الطلب «يحتاج تدخّلاً»', async () => {
    mock.createCjOrder.mockResolvedValue({ ok: false, error: 'network' });
    const r = await dispatchOrderToCj(7n);
    expect(r).toEqual({ ok: false, reason: 'cj_error', detail: 'network' });
    expect(mock.transitionOrder).toHaveBeenCalledWith(7n, 'needs_action', expect.anything());
  });
});
