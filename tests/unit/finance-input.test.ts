import {describe,it,expect} from 'vitest';
import {parseFinanceSar,publicFinanceError,financeField} from '@/lib/finance/input';
describe('finance form boundaries',()=>{
  it('parses decimal riyals without float rounding',()=>{
    expect(parseFinanceSar('15.29')).toBe(1529);
    expect(parseFinanceSar('1000000000000.01')).toBe(100000000000001);
    for(const value of ['1e2','-1','01','1.001','Infinity',' 1','١٠',''])expect(()=>parseFinanceSar(value)).toThrow();
  });
  it('keeps SQL details and credentials out of redirects',()=>{
    expect(publicFinanceError(new Error('mysql://secret'))).toBe('finance_action_failed');
    expect(publicFinanceError(new Error('finance_period_closed'))).toBe('finance_period_closed');
    expect(()=>financeField(new FormData(),'id')).toThrow();
  });
});
