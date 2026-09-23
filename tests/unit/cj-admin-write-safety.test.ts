import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
const state = vi.hoisted(() => ({ execute: vi.fn(), log: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { $executeRaw: state.execute } }));
vi.mock('@/lib/audit', () => ({ logAdmin: state.log }));
import { updateCjReview, upsertCjProduct } from '@/lib/cj/mapping';
import { auditCjChange, cjAuditFingerprint } from '@/lib/cj/audit';
import { computePrice } from '@/lib/cj/pricing';
beforeEach(() => { vi.clearAllMocks(); state.execute.mockResolvedValue(1); });
const lastQuery = () => { const [strings, ...values] = state.execute.mock.calls.at(-1)!; return Prisma.sql(strings, ...values); };
describe('CJ writes preserve fields outside the granted operation', () => {
  it('an edit without approval omits status from the actual SQL update', async () => {
    await updateCjReview(4, { nameAr: 'New', descriptionAr: 'Text', trbhhCategory: 'Category' });
    expect(lastQuery().sql).not.toContain('status=');
    await updateCjReview(4, { nameAr: 'New', status: 'ready' });
    expect(lastQuery().sql).toContain('status='); expect(lastQuery().values).toContain('ready');
  });
  it('create-only imports atomically preserve every column on a duplicate key', async () => {
    const row = { cjProductId: 'CJ4', name: 'New', price: computePrice(1000, 0, 0, 3000) };
    await upsertCjProduct(row, { createOnly: true });
    expect(lastQuery().sql.split('ON DUPLICATE KEY UPDATE')[1].trim()).toBe('id=id');
    await upsertCjProduct(row);
    expect(lastQuery().sql.split('ON DUPLICATE KEY UPDATE')[1]).toContain('supplier_cost_minor=VALUES(supplier_cost_minor)');
  });
  it('records independent bounded before/after fields without free text or contact values', async () => {
    const sensitive = 'PRIVATE-PHONE-NOTE-' + 'text'.repeat(100);
    await auditCjChange(9, 'agents', '3', { active: 0, contact: null }, { active: 1, contact: cjAuditFingerprint(sensitive) });
    expect(state.log).toHaveBeenCalledTimes(2);
    for (const [actor, action, target, note] of state.log.mock.calls) {
      expect([actor, action, target]).toEqual([9, 'تعديل وكلاء CJ', '3']);
      expect(note.length).toBeLessThanOrEqual(300); expect(note).not.toContain(sensitive); expect(JSON.parse(note)).toHaveProperty('before'); expect(JSON.parse(note)).toHaveProperty('after');
    }
  });
});
