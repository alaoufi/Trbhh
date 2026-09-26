import { describe, expect, it } from 'vitest';
import { cjShipEstimateFromAvailability, parseCjAvailability } from '@/lib/cj/mapping';

const OLD = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // أقدم من نافذة النضارة (٦ ساعات)

describe('قيمة الشحن الحقيقية من API (عرض دائم)', () => {
  it('تعيد أرخص شحن محقّق من availability_json', () => {
    const json = JSON.stringify({ checkedAt: OLD, stockQuantity: 5, variants: [], shippingOptions: [
      { name: 'CJPacket', priceMinor: 2500, currency: 'SAR', originCountry: 'CN', deliveryDays: '10-18' },
      { name: 'Express', priceMinor: 1800, currency: 'SAR', originCountry: 'CN', deliveryDays: '5-9' },
    ] });
    expect(cjShipEstimateFromAvailability({ availability_json: json })).toEqual({ minor: 1800, deliveryDays: '5-9' });
  });

  it('تبقى ظاهرة رغم انتهاء نافذة النضارة (بخلاف parseCjAvailability الصارمة)', () => {
    const json = JSON.stringify({ checkedAt: OLD, stockQuantity: 3, variants: [
      { vid: 'v1', stockQuantity: 3, shippingOptions: [{ name: 'CJPacket', priceMinor: 1200, currency: 'SAR', originCountry: 'CN', deliveryDays: '7-15' }] },
    ], shippingOptions: [{ name: 'CJPacket', priceMinor: 1200, currency: 'SAR', originCountry: 'CN', deliveryDays: '7-15' }] });
    expect(parseCjAvailability({ availability_json: json })).toBeNull(); // النضارة رفضته
    expect(cjShipEstimateFromAvailability({ availability_json: json })).toEqual({ minor: 1200, deliveryDays: '7-15' }); // لكن الشحن يبقى
  });

  it('تعيد null بلا بيانات صالحة', () => {
    expect(cjShipEstimateFromAvailability({ availability_json: null })).toBeNull();
    expect(cjShipEstimateFromAvailability({ availability_json: 'not json' })).toBeNull();
    expect(cjShipEstimateFromAvailability({ availability_json: JSON.stringify({ shippingOptions: [] }) })).toBeNull();
  });
});
