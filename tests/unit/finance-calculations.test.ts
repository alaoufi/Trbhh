import {describe, expect, it} from 'vitest';
import {calculateFiscalLines, formatFinanceMoney} from '@/lib/finance/calculations';
import type {FiscalLine} from '@/lib/finance/types';

const line = (patch: Partial<FiscalLine> = {}): FiscalLine => ({key:'p1', title:'منتج', quantity:1, unitNetMinor:10000, discountMinor:0, vatBps:1500, ...patch});

describe('explicit fiscal arithmetic in integer halalas', () => {
  it('rounds each line half up after its explicit discount, then sums the saved lines', () => {
    const result = calculateFiscalLines([line({unitNetMinor:11, discountMinor:1}), line({key:'p2', unitNetMinor:10})]);
    expect(result.lines.map(x=>x.vatMinor)).toEqual([2,2]);
    expect(result).toMatchObject({netMinor:20, vatMinor:4, totalMinor:24});
  });
  it('uses exact integer intermediates even when rate multiplication exceeds safe number precision', () => {
    const amount = 5_000_000_000_010;
    const result = calculateFiscalLines([line({unitNetMinor:amount})]);
    expect(result.vatMinor).toBe(750_000_000_002);
    expect(result.totalMinor).toBe(5_750_000_000_012);
  });
  it('supports safe report amounts beyond a per-order SQL INT limit', () => {
    expect(calculateFiscalLines([line({unitNetMinor:2_147_483_647, vatBps:0}),line({key:'p2',unitNetMinor:1,vatBps:0})]).totalMinor).toBe(2_147_483_648);
  });
  it.each([
    {quantity:0}, {quantity:1.5}, {quantity:NaN}, {unitNetMinor:-1}, {unitNetMinor:Infinity},
    {unitNetMinor:Number.MAX_SAFE_INTEGER+1}, {discountMinor:-1}, {discountMinor:10001},
    {vatBps:-1}, {vatBps:10001}, {vatBps:1.5}, {vatBps:undefined}, {supplierMinor:-1},
  ])('rejects invalid explicit values %j', patch => {
    expect(()=>calculateFiscalLines([line(patch as Partial<FiscalLine>)])).toThrow();
  });
  it('rejects safe inputs whose multiplication or aggregate overflows', () => {
    expect(()=>calculateFiscalLines([line({unitNetMinor:Number.MAX_SAFE_INTEGER,quantity:2,vatBps:0})])).toThrow();
    expect(()=>calculateFiscalLines([line({unitNetMinor:Number.MAX_SAFE_INTEGER,vatBps:0}),line({key:'p2',unitNetMinor:1,vatBps:0})])).toThrow();
  });
  it('does not mutate source lines or infer a rate', () => {
    const source = Object.freeze(line({quantity:2,unitNetMinor:100,discountMinor:25,vatBps:0}));
    expect(calculateFiscalLines([source]).lines[0]).toMatchObject({netMinor:175,vatMinor:0,grossMinor:175});
    expect(source).not.toHaveProperty('netMinor');
  });
  it('formats negative amounts and zero without losing a halala', () => {
    expect(formatFinanceMoney(-123456)).toBe('−1,234.56 ر.س');
    expect(formatFinanceMoney(0)).toBe('0.00 ر.س');
    expect(formatFinanceMoney(Number.MAX_SAFE_INTEGER)).toBe('90,071,992,547,409.91 ر.س');
    expect(()=>formatFinanceMoney(1.1)).toThrow();
  });
});
