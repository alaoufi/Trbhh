import 'server-only';
import { getProduct, createCjOrder, getCjBalance, getCjOrderDetail } from './client';
import { verifyCjVariantForSaudi } from './availability';
import { cjSyncSettings } from './sync';
import { registerCommerceSupplier, type CommerceSupplier, type SupplierCapabilities, type SupplierResult, type SupplierVariantQuote, type SupplierCreatedOrder, type SupplierOrderStatus } from '@/lib/suppliers/commerce-supplier';

/**
 * تنفيذ مورد CJ للواجهة الموحّدة CommerceSupplier — طبقة رقيقة تلتفّ على دوال CJ القائمة
 * (لا تعيد بناءها). تُعلن قدرات CJ صراحةً. السعر/المخزون/الشحن تُجلب حيّاً؛ لا قيم تقديرية.
 */

const CJ_CAPABILITIES: SupplierCapabilities = {
  key: 'cj',
  label: 'CJdropshipping',
  liveProducts: true,
  livePrice: true,
  liveStock: true,
  liveShipping: true,
  createOrder: true,
  walletPay: true,
  // CJ لا يوفّر رابط سداد مباشراً موثوقاً لكل طلب عبر API (cjPayUrl مهجور) — يبقى false
  // حتى تثبت الواجهة الرسمية خلاف ذلك (ينتظر تأكيد لومي).
  directPayLink: false,
  tracking: true,
};

const cjSupplier: CommerceSupplier = {
  capabilities: CJ_CAPABILITIES,

  async verifyVariant(input): Promise<SupplierResult<SupplierVariantQuote>> {
    const { pid, vid, quantity, zip } = input;
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(pid) || !/^[A-Za-z0-9_-]{1,64}$/.test(vid) || !Number.isSafeInteger(quantity) || quantity < 1) {
      return { ok: false, error: 'invalid_request' };
    }
    const product = await getProduct(pid).catch(() => null);
    if (!product?.ok) return { ok: false, error: 'product_unavailable' };
    const variant = product.data.variants.find((v) => v.vid === vid);
    if (!variant) return { ok: false, error: 'variant_unavailable' };
    const settings = await cjSyncSettings().catch(() => ({ usdToSarX100: 375 } as { usdToSarX100: number }));
    const check = await verifyCjVariantForSaudi(pid, variant, quantity, {}, settings.usdToSarX100, {}, zip).catch(() => null);
    if (!check) return { ok: false, error: 'verification_failed' };
    if (check.status !== 'available') return { ok: false, error: check.status };
    return {
      ok: true,
      data: {
        vid: check.vid, sku: check.sku,
        supplierPriceMinor: check.supplierPriceMinor, salePriceMinor: check.salePriceMinor,
        stockQuantity: check.stockQuantity,
        shippingOptions: check.shippingOptions.map((o) => ({ name: o.name, priceMinor: o.priceMinor, additionalMinor: o.additionalMinor, deliveryDays: o.deliveryDays, originCountry: o.originCountry })),
        checkedAt: check.checkedAt, priceChanged: check.priceChanged,
      },
    };
  },

  async createOrder(input): Promise<SupplierResult<SupplierCreatedOrder>> {
    const r = await createCjOrder(input);
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, data: { orderId: r.data.orderId, shipmentOrderId: r.data.shipmentOrderId, actualAmountMinor: r.data.actualPaymentUsd != null ? Math.round(r.data.actualPaymentUsd * 100) : null, rawStatus: r.data.orderStatus } };
  },

  async walletBalanceMinor(): Promise<SupplierResult<number>> {
    const r = await getCjBalance();
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, data: Math.round(r.data.amountUsd * 100) };
  },

  async orderStatus(orderId): Promise<SupplierResult<SupplierOrderStatus>> {
    const r = await getCjOrderDetail(orderId);
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, data: { orderId: r.data.orderId, rawStatus: r.data.orderStatus, trackNumber: r.data.trackNumber } };
  },
};

registerCommerceSupplier(cjSupplier);
export { cjSupplier, CJ_CAPABILITIES };
