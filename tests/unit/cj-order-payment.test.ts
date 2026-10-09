import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  createCjOrder: vi.fn(),
  payCjOrderBalance: vi.fn(),
  getOrderById: vi.fn(),
  parseOrderLines: vi.fn(),
  transitionOrder: vi.fn(),
  appendOrderEvent: vi.fn(),
  recordLedgerEntry: vi.fn(),
  getSettingNum: vi.fn(),
  update: vi.fn(),
}));
vi.mock('@/lib/cj/client', () => ({ createCjOrder: mock.createCjOrder, payCjOrderBalance: mock.payCjOrderBalance }));
vi.mock('@/lib/cj/orders/dispatch', () => ({ buildCjOrderPayload: () => ({ orderNumber: 'ref', products: [{ vid: 'v1', quantity: 1 }] }) }));
vi.mock('@/lib/cj/orders/store', () => ({
  getOrderById: mock.getOrderById,
  parseOrderLines: mock.parseOrderLines,
  transitionOrder: mock.transitionOrder,
  appendOrderEvent: mock.appendOrderEvent,
}));
vi.mock('@/lib/cj/orders/ledger', () => ({ recordLedgerEntry: mock.recordLedgerEntry }));
vi.mock('@/lib/settings', () => ({ getSettingNum: mock.getSettingNum }));
vi.mock('@/lib/prisma', () => ({ prisma: { cj_orders: { update: mock.update } } }));

import { approveAndPayOrder, cjOrderCapUsdMinor } from '@/lib/cj/orders/payment';

const baseOrder = {
  id: 7n, internal_ref: 'CJTEST-1', cj_order_id: '', cj_shipment_order_id: '',
  actual_payment_usd_minor: 0, paid_at: null, approved_at: null, approved_by: null, placed_at: null,
  cj_lines_json: '[{"vid":"v1","quantity":1}]', status: 'awaiting_payment',
};

beforeEach(() => {
  vi.clearAllMocks();
  mock.getOrderById.mockResolvedValue({ ...baseOrder });
  mock.parseOrderLines.mockReturnValue([{ vid: 'v1', quantity: 1 }]);
  mock.transitionOrder.mockResolvedValue({ ok: true, from: 'awaiting_payment', to: 'paid' });
  mock.appendOrderEvent.mockResolvedValue(true);
  mock.recordLedgerEntry.mockResolvedValue(true);
  mock.getSettingNum.mockResolvedValue(50); // سقف 50$ = 5000 minor
  mock.update.mockResolvedValue({});
  mock.createCjOrder.mockResolvedValue({ ok: true, data: { orderId: 'CJ-1', shipmentOrderId: '', actualPaymentUsd: 12, orderStatus: 'created' } });
  mock.payCjOrderBalance.mockResolvedValue({ ok: true, data: { paid: true } });
});

describe('cjOrderCapUsdMinor — سقف التكلفة', () => {
  it('يحوّل الدولار إلى minor، ويرجع 50$ افتراضياً عند قيمة غير صالحة', async () => {
    mock.getSettingNum.mockResolvedValue(30);
    expect(await cjOrderCapUsdMinor()).toBe(3000);
    mock.getSettingNum.mockResolvedValue(0);
    expect(await cjOrderCapUsdMinor()).toBe(5000);
    mock.getSettingNum.mockRejectedValue(new Error('db'));
    expect(await cjOrderCapUsdMinor()).toBe(5000);
  });
});

describe('approveAndPayOrder — حارس التكرار (idempotency)', () => {
  it('طلب مدفوع مسبقاً لا يُخصم ثانيةً', async () => {
    mock.getOrderById.mockResolvedValue({ ...baseOrder, paid_at: new Date(), cj_order_id: 'CJ-1', actual_payment_usd_minor: 1200 });
    const r = await approveAndPayOrder(7n, { actorId: 3 });
    expect(r).toMatchObject({ ok: true, alreadyPaid: true });
    expect(mock.createCjOrder).not.toHaveBeenCalled();
    expect(mock.payCjOrderBalance).not.toHaveBeenCalled();
  });
});

describe('approveAndPayOrder — بوابات المنع قبل أي خصم', () => {
  it('لا بنود → no_lines بلا إنشاء ولا دفع', async () => {
    mock.parseOrderLines.mockReturnValue([]);
    const r = await approveAndPayOrder(7n);
    expect(r).toMatchObject({ ok: false, reason: 'no_lines' });
    expect(mock.payCjOrderBalance).not.toHaveBeenCalled();
  });

  it('الشراء الحيّ معطّل → blocked، لا دفع، ينتقل لبانتظار الموافقة', async () => {
    mock.createCjOrder.mockResolvedValue({ ok: false, error: 'cj_purchasing_disabled' });
    const r = await approveAndPayOrder(7n, { actorId: 3 });
    expect(r).toMatchObject({ ok: false, reason: 'blocked' });
    expect(mock.payCjOrderBalance).not.toHaveBeenCalled();
    expect(mock.transitionOrder).toHaveBeenCalledWith(7n, 'awaiting_approval', expect.anything());
  });

  it('فشل إنشاء الطلب لدى CJ → cj_create_error + needs_action، لا دفع', async () => {
    mock.createCjOrder.mockResolvedValue({ ok: false, error: 'network' });
    const r = await approveAndPayOrder(7n);
    expect(r).toMatchObject({ ok: false, reason: 'cj_create_error', detail: 'network' });
    expect(mock.payCjOrderBalance).not.toHaveBeenCalled();
    expect(mock.transitionOrder).toHaveBeenCalledWith(7n, 'needs_action', expect.anything());
  });

  it('غياب المبلغ الفعلي → no_amount، لا دفع (لا دفع بمبلغ غير متحقق)', async () => {
    mock.createCjOrder.mockResolvedValue({ ok: true, data: { orderId: 'CJ-1', shipmentOrderId: '', actualPaymentUsd: null, orderStatus: 'created' } });
    const r = await approveAndPayOrder(7n);
    expect(r).toMatchObject({ ok: false, reason: 'no_amount' });
    expect(mock.payCjOrderBalance).not.toHaveBeenCalled();
    expect(mock.transitionOrder).toHaveBeenCalledWith(7n, 'needs_action', expect.anything());
  });

  it('تجاوز السقف → over_cap، لا دفع نهائياً', async () => {
    mock.createCjOrder.mockResolvedValue({ ok: true, data: { orderId: 'CJ-1', shipmentOrderId: '', actualPaymentUsd: 80, orderStatus: 'created' } });
    const r = await approveAndPayOrder(7n); // السقف 50$
    expect(r).toMatchObject({ ok: false, reason: 'over_cap', actualPaymentUsdMinor: 8000, capUsdMinor: 5000 });
    expect(mock.payCjOrderBalance).not.toHaveBeenCalled();
    expect(mock.recordLedgerEntry).not.toHaveBeenCalled();
  });

  it('سقف العملية الصريح يَغلِب الإعداد العام', async () => {
    mock.createCjOrder.mockResolvedValue({ ok: true, data: { orderId: 'CJ-1', shipmentOrderId: '', actualPaymentUsd: 12, orderStatus: 'created' } });
    const r = await approveAndPayOrder(7n, { capUsdMinor: 1000 }); // سقف 10$ < 12$
    expect(r).toMatchObject({ ok: false, reason: 'over_cap', capUsdMinor: 1000 });
  });
});

describe('approveAndPayOrder — مسار الدفع الناجح', () => {
  it('ضمن السقف: ينشئ (payType=3) → يدفع → paid + قيد محاسبي واحد', async () => {
    const r = await approveAndPayOrder(7n, { actorId: 3 });
    expect(r).toMatchObject({ ok: true, cjOrderId: 'CJ-1', actualPaymentUsdMinor: 1200 });
    expect(mock.payCjOrderBalance).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'CJ-1', payId: 'TRB-CJTEST-1' }));
    expect(mock.transitionOrder).toHaveBeenCalledWith(7n, 'paid', expect.anything());
    expect(mock.recordLedgerEntry).toHaveBeenCalledWith(expect.objectContaining({ entryKey: 'CJTEST-1:charge', entryType: 'charge', amountUsdMinor: 1200 }));
  });

  it('فشل الدفع → pay_error + needs_action، لا قيد محاسبي', async () => {
    mock.payCjOrderBalance.mockResolvedValue({ ok: false, error: 'insufficient_balance' });
    const r = await approveAndPayOrder(7n);
    expect(r).toMatchObject({ ok: false, reason: 'pay_error', detail: 'insufficient_balance' });
    expect(mock.recordLedgerEntry).not.toHaveBeenCalled();
    expect(mock.transitionOrder).toHaveBeenCalledWith(7n, 'needs_action', expect.anything());
  });

  it('طلب له cj_order_id سابق: لا يُنشأ ثانيةً، يُدفع بالمبلغ المخزَّن (منع ازدواج الطلب)', async () => {
    mock.getOrderById.mockResolvedValue({ ...baseOrder, cj_order_id: 'CJ-OLD', actual_payment_usd_minor: 900 });
    const r = await approveAndPayOrder(7n);
    expect(mock.createCjOrder).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true, cjOrderId: 'CJ-OLD', actualPaymentUsdMinor: 900 });
    expect(mock.payCjOrderBalance).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'CJ-OLD' }));
  });

  it('عند توفّر shipmentOrderId يُمرَّر للدفع (payBalanceV2)', async () => {
    mock.createCjOrder.mockResolvedValue({ ok: true, data: { orderId: 'CJ-1', shipmentOrderId: 'SHIP-9', actualPaymentUsd: 12, orderStatus: 'created' } });
    await approveAndPayOrder(7n);
    expect(mock.payCjOrderBalance).toHaveBeenCalledWith(expect.objectContaining({ shipmentOrderId: 'SHIP-9' }));
  });

  it('الطلب غير موجود → not_found', async () => {
    mock.getOrderById.mockResolvedValue(null);
    expect(await approveAndPayOrder(7n)).toMatchObject({ ok: false, reason: 'not_found' });
  });
});
