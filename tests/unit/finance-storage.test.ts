import { describe, expect, it } from 'vitest';
import { FINANCE_DDL } from '@/lib/finance/schema';
import { parseFinanceId, parseFinanceMonth, fingerprint, requireOpenPeriod, validateExpense } from '@/lib/finance/service';

describe('finance persistence boundaries', () => {
  it('adds independent immutable document tables without changing existing records', () => {
    expect(FINANCE_DDL.length).toBeGreaterThanOrEqual(9);
    for (const ddl of FINANCE_DDL) {
      expect(ddl).toMatch(/^CREATE TABLE IF NOT EXISTS finance_/);
      expect(ddl).not.toMatch(/\bDROP TABLE|\bDELETE FROM|\bUPDATE commerce_/);
      expect(ddl).toContain('ENGINE=InnoDB');
    }
    const invoices = FINANCE_DDL.find(x => x.startsWith('CREATE TABLE IF NOT EXISTS finance_invoices'))!;
    expect(invoices).toContain('UNIQUE KEY finance_invoice_source (source_key)');
    expect(invoices).toContain('UNIQUE KEY finance_invoice_number (number)');
    expect(invoices).toContain('source_snapshot JSON NOT NULL');
    expect(invoices).toContain('ON DELETE RESTRICT');
  });
  it('rejects malformed identifiers and invalid calendar months', () => {
    expect(parseFinanceId('12')).toBe(12n);
    for (const value of ['0', '-1', '1 OR 1=1', '1.1', '900719925474099200000']) expect(() => parseFinanceId(value)).toThrow();
    expect(parseFinanceMonth('2026-09')).toBe('2026-09');
    for (const value of ['2026-13', '2026-00', 'September', '2026-9']) expect(() => parseFinanceMonth(value)).toThrow();
  });
  it('fingerprints content independently of object key order', () => {
    expect(fingerprint({a: 1,b: [2,3]})).toBe(fingerprint({b: [2,3],a: 1}));
    expect(fingerprint({a: 2})).not.toBe(fingerprint({a: 1}));
  });
  it('rejects missing evidence, fractional halalas, and overpaid expenses', () => {
    const input = { category:'hosting',description:'Hosting invoice',netMinor:1000,vatMinor:150,paidMinor:1150,occurredAt:'2026-09-22',dueAt:'2026-09-22',reference:'INV-1',requestKey:'expense-unique-0001' };
    expect(validateExpense(input).totalMinor).toBe(1150);
    expect(() => validateExpense({...input,paidMinor:1151})).toThrow('finance_expense_invalid');
    expect(() => validateExpense({...input,netMinor:10.1})).toThrow();
    expect(() => validateExpense({...input,reference:''})).toThrow();
    expect(() => validateExpense({...input,occurredAt:'2026-02-30'})).toThrow();
  });
  it('locks the period and rejects a closed month', async () => {
    const calls: string[] = [];
    const tx = { $executeRaw: async (sql:TemplateStringsArray) => {calls.push(sql.join('?'));return 1;}, $queryRaw: async (sql:TemplateStringsArray) => {calls.push(sql.join('?'));return [{closed_at:new Date()}];} };
    await expect(requireOpenPeriod(tx as never,'2026-09')).rejects.toThrow('finance_period_closed');
    expect(calls.some(sql => sql.includes('FOR UPDATE'))).toBe(true);
  });
});
