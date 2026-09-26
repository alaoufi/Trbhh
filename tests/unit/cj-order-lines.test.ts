import { describe, expect, it } from 'vitest';
import { sanitizeOrderLines, parseOrderLines } from '@/lib/cj/orders/store';

describe('بنود طلب CJ — تطهير وقراءة', () => {
  it('يقبل vid + كمية صالحة ويحذف الفاسد', () => {
    const out = sanitizeOrderLines([
      { vid: 'v1', quantity: 2, sku: 'S1', logisticName: 'CJPacket' },
      { vid: '', quantity: 3 },          // بلا vid → يُحذف
      { vid: 'v2', quantity: 0 },        // كمية غير صالحة → يُحذف
      { vid: 'v3', quantity: 1000 },     // فوق الحد → يُحذف
      { vid: 'v4', quantity: 1 },
      'nonsense',                         // ليس كائناً → يُحذف
    ]);
    expect(out).toEqual([
      { vid: 'v1', quantity: 2, sku: 'S1', logisticName: 'CJPacket' },
      { vid: 'v4', quantity: 1 },
    ]);
  });

  it('يقصّ الكمية العشرية ويحدّ عدد البنود', () => {
    expect(sanitizeOrderLines([{ vid: 'v', quantity: 2.9 }])).toEqual([{ vid: 'v', quantity: 2 }]);
    const many = Array.from({ length: 80 }, (_, i) => ({ vid: `v${i}`, quantity: 1 }));
    expect(sanitizeOrderLines(many).length).toBe(50);
  });

  it('parseOrderLines يقرأ JSON بأمان ويعيد [] عند الفساد', () => {
    expect(parseOrderLines('[{"vid":"v1","quantity":2}]')).toEqual([{ vid: 'v1', quantity: 2 }]);
    expect(parseOrderLines('not json')).toEqual([]);
    expect(parseOrderLines('')).toEqual([]);
    expect(parseOrderLines(null)).toEqual([]);
  });
});
