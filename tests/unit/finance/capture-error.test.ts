import {describe,expect,it} from 'vitest';
import {financeCaptureErrorCategory} from '../../../src/lib/finance/capture-error';

describe('financeCaptureErrorCategory',()=>{
  it('preserves only approved stable finance error codes',()=>{
    expect(financeCaptureErrorCategory(new Error('finance_period_closed'))).toBe('finance_period_closed');
    expect(financeCaptureErrorCategory(new Error('finance_schema_not_ready'))).toBe('finance_schema_not_ready');
  });

  it('does not expose exception text or database details',()=>{
    expect(financeCaptureErrorCategory(new Error('secret=top-secret customer@example.com'))).toBe('unknown_error');
    expect(financeCaptureErrorCategory(Object.assign(new Error('query leaked private values'),{code:'P2022',meta:{column:'db.finance_order_items.variant_snapshot'}}))).toBe('database_missing_column_variant_snapshot');
    expect(financeCaptureErrorCategory(Object.assign(new Error('query leaked private values'),{code:'P2010'}))).toBe('database_p2010');
    expect(financeCaptureErrorCategory(Object.assign(new Error('query leaked private values'),{code:'P2010',meta:{code:'1054',message:"Unknown column 'variantSnapshot' in 'field list'"}}))).toBe('database_missing_column_variantsnapshot');
    expect(financeCaptureErrorCategory(Object.assign(new Error('query leaked private values'),{code:'P2022',meta:{column:'db.finance_order_items.variantSnapshot'}}))).toBe('database_missing_column_variantsnapshot');
  });
});
