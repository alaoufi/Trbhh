import { describe, expect, it } from 'vitest';
import { searchCardVisibility } from '@/lib/search-card-visibility';

// Interpret the small Prisma predicate subset over fixtures, independently of the builder.
function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, test]) => {
    // Prisma drops empty OR operands; unlike a top-level {}, they do not match all rows.
    if (key === 'OR') return (test as Record<string, unknown>[]).some((part) => Object.keys(part).length > 0 && matches(row, part));
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

describe('search counts and pages use card visibility before pagination', () => {
  const now = new Date('2026-09-10T12:00:00Z');
  const where = searchCardVisibility({ now, defaultDays: 7, bannedIds: [9n], plans: [{ id: 1, adDays: 30 }, { id: 2, adDays: 0 }], subscriptions: [{ userId: 2, packageId: 1 }, { userId: 3, packageId: 2 }, { userId: 4, packageId: 99 }] });
  const ad = (user: number, daysAgo: number, extras = {}) => ({ user_id: BigInt(user), created_at: new Date(now.getTime() - daysAgo * 86400000), expires_at: null, urgent_until: null, adsSpecial: '', ...extras });
  it('returns only the banned filter for an unlimited default without assigned plans', () => {
    for (const defaultDays of [0, -1]) {
      const unrestricted = searchCardVisibility({ now, defaultDays, bannedIds: [], plans: [], subscriptions: [] });
      expect(unrestricted).toEqual({});
      expect(matches(ad(1, 3650), unrestricted)).toBe(true);
      const bannedOnly = searchCardVisibility({ now, defaultDays, bannedIds: [9n], plans: [], subscriptions: [] });
      expect(bannedOnly).toEqual({ user_id: { notIn: [9n] } });
      expect(matches(ad(1, 3650), bannedOnly)).toBe(true);
      expect(matches(ad(9, 1), bannedOnly)).toBe(false);
    }
  });
  it('uses the unlimited default when no subscription maps to a known plan', () => {
    const unrestricted = searchCardVisibility({ now, defaultDays: 0, bannedIds: [], plans: [{ id: 1, adDays: 7 }], subscriptions: [{ userId: 2, packageId: 99 }] });
    expect(unrestricted).toEqual({});
    expect(matches(ad(2, 365), unrestricted)).toBe(true);
  });
  it('still restricts assigned finite plans when the unassigned default is unlimited', () => {
    const mixed = searchCardVisibility({ now, defaultDays: 0, bannedIds: [9n], plans: [{ id: 1, adDays: 7 }, { id: 2, adDays: 0 }], subscriptions: [{ userId: 2, packageId: 1 }, { userId: 3, packageId: 2 }] });
    expect(mixed.OR).toContainEqual({ user_id: { notIn: [2n, 3n] } });
    expect(mixed.OR).not.toContainEqual({});
    expect(matches(ad(1, 3650), mixed)).toBe(true);
    expect(matches(ad(2, 7), mixed)).toBe(true);
    expect(matches(ad(2, 8), mixed)).toBe(false);
    expect(matches(ad(3, 3650), mixed)).toBe(true);
    expect(matches(ad(9, 1), mixed)).toBe(false);
    expect(matches(ad(2, 365, { urgent_until: new Date(now.getTime() + 86400000) }), mixed)).toBe(true);
  });
  it('excludes expired default ads but preserves current subscriptions and unlimited plans', () => {
    expect(matches(ad(1, 8), where)).toBe(false);
    expect(matches(ad(1, 7), where)).toBe(true);
    expect(matches(ad(2, 20), where)).toBe(true);
    expect(matches(ad(2, 31), where)).toBe(false);
    expect(matches(ad(3, 365), where)).toBe(true);
    expect(matches(ad(4, 8), where)).toBe(false);
  });
  it('preserves paid featuring or urgency until expiry, without exposing banned sellers', () => {
    const future = new Date(now.getTime() + 86400000);
    expect(matches(ad(1, 365, { adsSpecial: 'checked', expires_at: future }), where)).toBe(true);
    expect(matches(ad(1, 365, { urgent_until: future }), where)).toBe(true);
    expect(matches(ad(1, 365, { adsSpecial: 'checked', expires_at: now }), where)).toBe(false);
    expect(matches(ad(9, 1, { urgent_until: future }), where)).toBe(false);
  });
});
