import {describe,expect,it} from 'vitest';
import {financeCaptureErrorCategory} from '../../../src/lib/finance/capture-error';

describe('financeCaptureErrorCategory',()=>{
  it('preserves only approved stable finance error codes',()=>{
    expect(financeCaptureErrorCategory(new Error('finance_period_closed'))).toBe('finance_period_closed');
    expect(financeCaptureErrorCategory(new Error('finance_schema_not_ready'))).toBe('finance_schema_not_ready');
  });

  it('does not expose exception text or database details',()=>{
    expect(financeCaptureErrorCategory(new Error('secret=top-secret customer@example.com'))).toBe('unknown_error');
    expect(financeCaptureErrorCategory(Object.assign(new Error('query leaked private values'),{code:'P2010'}))).toBe('database_error');
  });
});
