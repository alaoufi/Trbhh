import {describe, expect, it} from 'vitest';
import {parseSar, formatSar, checkedMoney, lineTotal, sumMoney} from '@/lib/commerce/money';

describe('commerce integer money', () => {
  it('parses exact SAR without floating point arithmetic', () => {
    expect(parseSar('10.25')).toBe(1025);
    expect(parseSar('0.01')).toBe(1);
    expect(parseSar('0')).toBe(0);
    expect(formatSar(1025)).toBe('10.25');
    expect(lineTotal(1025, 3)).toBe(3075);
    expect(sumMoney([1, 2, 3075])).toBe(3078);
  });
  it.each(['10.251','-1','+1','1e3',' 1','1 ','01','1.','NaN','Infinity','21474836.48'])('rejects ambiguous/overflow SAR %s', value => {
    expect(() => parseSar(value)).toThrow();
  });
  it.each([NaN, Infinity, -1, 0.5, 2147483648])('rejects invalid minor units %s', value => {
    expect(() => checkedMoney(value)).toThrow();
  });
  it('checks multiplication and addition bounds', () => {
    expect(() => lineTotal(2147483647,2)).toThrow();
    expect(() => lineTotal(100,0)).toThrow();
    expect(() => sumMoney([2147483647,1])).toThrow();
  });
});
