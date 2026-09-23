import { describe, expect, it } from 'vitest';
import {
  canTransition, nextStatuses, isTerminal, isException, mapCjStatus, statusLabel, ALL_STATUSES, isStatus,
} from '@/lib/cj/orders/state';

describe('آلة حالات طلب CJ', () => {
  it('المسار للأمام فقط، لا للخلف ولا لنفس الحالة', () => {
    expect(canTransition('awaiting_payment', 'paid')).toBe(true);
    expect(canTransition('paid', 'shipped')).toBe(true); // قفزة للأمام مسموحة
    expect(canTransition('shipped', 'paid')).toBe(false); // للخلف ممنوع
    expect(canTransition('paid', 'paid')).toBe(false);
  });

  it('الدخول لحالة استثنائية متاح من حالة حيّة فقط', () => {
    expect(canTransition('preparing', 'needs_action')).toBe(true);
    expect(canTransition('paid', 'cancelled')).toBe(true);
    expect(canTransition('completed', 'cancelled')).toBe(false); // نهائية
  });

  it('الحالات النهائية لا انتقال بعدها', () => {
    for (const t of ALL_STATUSES) {
      expect(canTransition('completed', t)).toBe(false);
      expect(canTransition('refunded', t)).toBe(false);
    }
    expect(isTerminal('completed')).toBe(true);
    expect(isTerminal('delivered')).toBe(false);
  });

  it('الاسترداد والاستبدال لهما مصادر محدّدة', () => {
    expect(canTransition('return_requested', 'refunded')).toBe(true);
    expect(canTransition('return_requested', 'reshipped')).toBe(true);
    expect(canTransition('paid', 'refunded')).toBe(false); // لا استرداد مباشر بلا مسار إرجاع/إلغاء
    expect(canTransition('reshipped', 'preparing')).toBe(true); // يعود للمسار
  });

  it('needs_action/stalled يستأنفان المسار', () => {
    expect(canTransition('needs_action', 'preparing')).toBe(true);
    expect(canTransition('stalled', 'shipped')).toBe(true);
  });

  it('nextStatuses لا يحوي الحالة نفسها ولا النهائية من نهائية', () => {
    expect(nextStatuses('awaiting_payment')).not.toContain('awaiting_payment');
    expect(nextStatuses('completed')).toHaveLength(0);
    expect(nextStatuses('paid').length).toBeGreaterThan(0);
  });

  it('ربط حالات CJ الخام إلى الرموز الداخلية، وnull للمجهول', () => {
    expect(mapCjStatus('Shipped')).toBe('shipped');
    expect(mapCjStatus('IN TRANSIT')).toBe('in_transit');
    expect(mapCjStatus('delivered')).toBe('delivered');
    expect(mapCjStatus('something_weird')).toBeNull();
    expect(mapCjStatus('')).toBeNull();
  });

  it('مساعدات الحالة', () => {
    expect(isException('cancelled')).toBe(true);
    expect(isException('shipped')).toBe(false);
    expect(isStatus('paid')).toBe(true);
    expect(isStatus('nope')).toBe(false);
    expect(statusLabel('delivered')).toBe('تم التسليم');
  });
});
