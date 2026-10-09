import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  getCjOrderDetail: vi.fn(),
  getTracking: vi.fn(),
  applyCjStatus: vi.fn(),
  setOrderTracking: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  ordersFindMany: vi.fn(),
  ordersUpdate: vi.fn(),
  whFindMany: vi.fn(),
  whUpdate: vi.fn(),
}));
vi.mock('@/lib/cj/client', () => ({ getCjOrderDetail: mock.getCjOrderDetail, getTracking: mock.getTracking }));
vi.mock('@/lib/cj/orders/store', () => ({ applyCjStatus: mock.applyCjStatus, setOrderTracking: mock.setOrderTracking }));
vi.mock('@/lib/prisma', () => ({ prisma: {
  cj_orders: { findFirst: mock.findFirst, findUnique: mock.findUnique, findMany: mock.ordersFindMany, update: mock.ordersUpdate },
  cj_webhook_events: { findMany: mock.whFindMany, update: mock.whUpdate },
} }));

import { applyCjWebhookEvent, pollOpenCjOrders, processPendingWebhookEvents } from '@/lib/cj/orders/sync-status';

beforeEach(() => {
  vi.clearAllMocks();
  mock.applyCjStatus.mockResolvedValue({ ok: true, mapped: 'shipped' });
  mock.setOrderTracking.mockResolvedValue(undefined);
  mock.ordersUpdate.mockResolvedValue({});
  mock.whUpdate.mockResolvedValue({});
});

describe('applyCjWebhookEvent — ربط الحدث بطلبه وتطبيقه', () => {
  it('يطابق بمعرّف CJ ويطبّق الحالة + التتبّع', async () => {
    mock.findFirst.mockResolvedValue({ id: 7n, internal_ref: 'R1', status: 'sent_to_cj' });
    const r = await applyCjWebhookEvent({ eventKey: 'e1', cjOrderId: 'CJ-1', orderNumber: '', rawStatus: 'Shipped', trackNumber: 'LP1' });
    expect(r).toEqual({ applied: true, matched: true });
    expect(mock.applyCjStatus).toHaveBeenCalledWith(7n, 'Shipped', expect.anything());
    expect(mock.setOrderTracking).toHaveBeenCalledWith(7n, expect.objectContaining({ trackingNumber: 'LP1' }), expect.anything());
  });

  it('يطابق برقمنا (internal_ref) عند غياب معرّف CJ', async () => {
    mock.findFirst.mockResolvedValue(null);
    mock.findUnique.mockResolvedValue({ id: 8n, internal_ref: 'R2', status: 'paid' });
    const r = await applyCjWebhookEvent({ eventKey: 'e2', cjOrderId: '', orderNumber: 'R2', rawStatus: 'delivered', trackNumber: '' });
    expect(r.matched).toBe(true);
    expect(mock.applyCjStatus).toHaveBeenCalledWith(8n, 'delivered', expect.anything());
  });

  it('لا طلب مطابق → matched=false بلا تطبيق', async () => {
    mock.findFirst.mockResolvedValue(null);
    mock.findUnique.mockResolvedValue(null);
    const r = await applyCjWebhookEvent({ eventKey: 'e3', cjOrderId: 'X', orderNumber: 'Y', rawStatus: 'shipped', trackNumber: '' });
    expect(r).toEqual({ applied: false, matched: false });
    expect(mock.applyCjStatus).not.toHaveBeenCalled();
  });
});

describe('processPendingWebhookEvents — معالجة الدفعة', () => {
  it('يعلّم الأحداث المطابَقة معالَجة', async () => {
    mock.whFindMany.mockResolvedValue([{ id: 1n, event_key: 'e1', cj_order_id: 'CJ-1', order_number: '', raw_status: 'shipped', track_number: '' }]);
    mock.findFirst.mockResolvedValue({ id: 7n, internal_ref: 'R1', status: 'sent_to_cj' });
    const r = await processPendingWebhookEvents(10);
    expect(r).toEqual({ processed: 1, matched: 1 });
    expect(mock.whUpdate).toHaveBeenCalledWith({ where: { id: 1n }, data: { processed: 1 } });
  });

  it('حدث بلا طلب مطابق لا يُعلَّم معالَجاً', async () => {
    mock.whFindMany.mockResolvedValue([{ id: 2n, event_key: 'e2', cj_order_id: 'Z', order_number: '', raw_status: 'x', track_number: '' }]);
    mock.findFirst.mockResolvedValue(null);
    mock.findUnique.mockResolvedValue(null);
    const r = await processPendingWebhookEvents(10);
    expect(r).toEqual({ processed: 0, matched: 0 });
    expect(mock.whUpdate).not.toHaveBeenCalled();
  });
});

describe('pollOpenCjOrders — الاستطلاع الدوري (شبكة أمان، قراءة فقط)', () => {
  it('يستعلم عن الطلبات المفتوحة ويطبّق الحالة والتتبّع ويختم آخر استطلاع', async () => {
    mock.ordersFindMany.mockResolvedValue([{ id: 7n, internal_ref: 'R1', cj_order_id: 'CJ-1' }]);
    mock.getCjOrderDetail.mockResolvedValue({ ok: true, data: { orderStatus: 'Shipped', trackNumber: 'LP1' } });
    mock.getTracking.mockResolvedValue({ ok: true, data: { trackStatus: 'in transit', logisticName: 'CJPacket' } });
    const r = await pollOpenCjOrders(10);
    expect(r).toEqual({ polled: 1, updated: 1 });
    expect(mock.applyCjStatus).toHaveBeenCalledWith(7n, 'Shipped', expect.anything());
    expect(mock.setOrderTracking).toHaveBeenCalledWith(7n, expect.objectContaining({ trackingNumber: 'LP1', carrier: 'CJPacket' }), expect.anything());
    expect(mock.ordersUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 7n } }));
  });

  it('فشل استعلام CJ لا يكسر — يختم آخر استطلاع فقط', async () => {
    mock.ordersFindMany.mockResolvedValue([{ id: 7n, internal_ref: 'R1', cj_order_id: 'CJ-1' }]);
    mock.getCjOrderDetail.mockResolvedValue({ ok: false, error: 'network' });
    const r = await pollOpenCjOrders(10);
    expect(r).toEqual({ polled: 1, updated: 0 });
    expect(mock.ordersUpdate).toHaveBeenCalled();
  });
});
