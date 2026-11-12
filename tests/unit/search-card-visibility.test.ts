import { describe, expect, it } from 'vitest';
import { searchCardVisibility } from '@/lib/search-card-visibility';

// Interpret the small Prisma predicate subset over fixtures, independently of the builder.
function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, test]) => {
    if (key === 'OR') return (test as Record<string, unknown>[]).some((part) => matches(row, part));
    if (key === 'AND') return (test as Record<string, unknown>[]).every((part) => matches(row, part));
    if (test === null || typeof test !== 'object') return row[key] === test;
    return Object.entries(test as Record<string, unknown>).every(([operator, operand]) => {
      if (operator === 'in') return (operand as unknown[]).includes(row[key]);
      if (operator === 'notIn') return !(operand as unknown[]).includes(row[key]);
      if (row[key] == null) return false;
      if (operator === 'gt') return (row[key] as number) > (operand as number);
      if (operator === 'gte') return (row[key] as number) >= (operand as number);
      throw new Error(`Unsupported fixture operator ${operator}`);
    });
  });
}

// قرار منتج ثابت: العرض/البحث العام في تربح غير محدود بمدة الباقة (adDays). مدة الباقة
// تخصّ حدّ نشر المعلن فقط، لا إخفاء إعلانه من التصفّح. لذا الرؤية لا تفرض أي قيد عمر —
// يُستثنى فقط المعلن المحظور.
describe('رؤية البطاقات: العرض العام غير محدود بمدة الباقة', () => {
  const now = new Date('2026-09-10T12:00:00Z');
  const ad = (user: number, daysAgo: number, extras = {}) => ({ user_id: BigInt(user), created_at: new Date(now.getTime() - daysAgo * 86400000), expires_at: null, urgent_until: null, adsSpecial: '', ...extras });

  it('كل الإعلانات تظهر مهما قدُم تاريخها، ولا تتأثر بمدة الباقة الافتراضية أو المشترَكة', () => {
    const where = searchCardVisibility({ now, defaultDays: 7, bannedIds: [9n], plans: [{ id: 1, adDays: 30 }, { id: 2, adDays: 0 }], subscriptions: [{ userId: 2, packageId: 1 }, { userId: 3, packageId: 2 }] });
    expect(matches(ad(1, 3650), where)).toBe(true); // بلا اشتراك، قديم جداً — يظهر
    expect(matches(ad(2, 3650), where)).toBe(true); // مشترك بباقة ٣٠ يوماً، أقدم بكثير — يظهر
    expect(matches(ad(3, 3650), where)).toBe(true);
    expect(matches(ad(1, 0), where)).toBe(true);
  });

  it('المعلن المحظور لا تظهر إعلاناته حتى لو كانت حديثة أو مميّزة أو عاجلة', () => {
    const where = searchCardVisibility({ now, defaultDays: 7, bannedIds: [9n], plans: [], subscriptions: [] });
    const future = new Date(now.getTime() + 86400000);
    expect(matches(ad(9, 0, { adsSpecial: 'checked', expires_at: future }), where)).toBe(false);
    expect(matches(ad(9, 0, { urgent_until: future }), where)).toBe(false);
    expect(matches(ad(5, 0), where)).toBe(true);
  });

  it('بلا محظورين: لا قيد إطلاقاً، وبلا فرع OR فارغ', () => {
    const where = searchCardVisibility({ now, defaultDays: 0, bannedIds: [], plans: [], subscriptions: [] });
    expect(where.OR ?? []).not.toContainEqual({});
    expect(matches({ user_id: 1n, created_at: new Date(0) }, where)).toBe(true);
  });
});
