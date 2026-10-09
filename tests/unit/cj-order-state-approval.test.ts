import { describe, expect, it } from 'vitest';
import { canTransition, statusLabel, isStatus, FLOW_STATUSES, stageOf } from '@/lib/cj/orders/state';

describe('حالة awaiting_approval الجديدة في آلة الحالات', () => {
  it('مُعرَّفة ضمن المسار بترتيب صحيح (بعد بانتظار الدفع، قبل الدفع)', () => {
    expect(isStatus('awaiting_approval')).toBe(true);
    expect(statusLabel('awaiting_approval')).toBe('بانتظار موافقة الإدارة');
    const i = FLOW_STATUSES.indexOf('awaiting_approval');
    expect(i).toBe(FLOW_STATUSES.indexOf('awaiting_payment') + 1);
    expect(i).toBeLessThan(FLOW_STATUSES.indexOf('paid'));
  });

  it('انتقالات للأمام مسموحة، للخلف ممنوعة', () => {
    expect(canTransition('awaiting_payment', 'awaiting_approval')).toBe(true);
    expect(canTransition('awaiting_approval', 'paid')).toBe(true);
    expect(canTransition('awaiting_payment', 'paid')).toBe(true); // قفزة للأمام
    expect(canTransition('paid', 'awaiting_approval')).toBe(false); // للخلف
    expect(canTransition('awaiting_approval', 'awaiting_payment')).toBe(false);
  });

  it('يمكن الدخول لحالة استثنائية منها (needs_action/cancelled)', () => {
    expect(canTransition('awaiting_approval', 'needs_action')).toBe(true);
    expect(canTransition('awaiting_approval', 'cancelled')).toBe(true);
  });

  it('تقع ضمن مرحلة «الدفع» في لوحة المراقبة', () => {
    expect(stageOf('awaiting_approval')).toBe('payment');
  });
});
