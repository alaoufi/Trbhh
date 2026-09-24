import {describe,expect,it,vi} from 'vitest';
import {ensureFinanceTaxRevisionIndexes} from '@/lib/finance/tax-index-upgrade';

function fixture(){
 const rows=[
  {name:'finance_tax_effective',c:'effective_from',seq:1,non_unique:0,prefix:null as number|null},
  {name:'finance_tax_reference',c:'policy_reference',seq:1,non_unique:0,prefix:null as number|null},
  {name:'finance_tax_request',c:'request_id',seq:1,non_unique:0,prefix:null as number|null},
 ];
 const upgraded=()=>{rows.splice(0,2,
  {name:'finance_tax_effective_lookup',c:'effective_from',seq:1,non_unique:1,prefix:null},
  {name:'finance_tax_reference_lookup',c:'policy_reference',seq:1,non_unique:1,prefix:null});};
 const db={$queryRaw:vi.fn(async()=>rows.map(row=>({...row}))),$executeRawUnsafe:vi.fn(async(_sql:string)=>{upgraded();return 0;})};
 return {rows,db,upgraded};
}
describe('safe tax policy revision index upgrade',()=>{
 it('replaces only two known uniqueness restrictions atomically and is idempotent',async()=>{
  const f=fixture();await ensureFinanceTaxRevisionIndexes(f.db as never);await ensureFinanceTaxRevisionIndexes(f.db as never);
  expect(f.db.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  expect(f.db.$executeRawUnsafe.mock.calls[0][0]).toBe('ALTER TABLE finance_tax_policies ADD INDEX finance_tax_effective_lookup (effective_from), DROP INDEX finance_tax_effective, ADD INDEX finance_tax_reference_lookup (policy_reference), DROP INDEX finance_tax_reference');
  expect(f.rows.find(row=>row.name==='finance_tax_request')?.non_unique).toBe(0);
 });
 it('does no DDL on a fresh schema with the replacement indexes',async()=>{
  const f=fixture();f.upgraded();await ensureFinanceTaxRevisionIndexes(f.db as never);expect(f.db.$executeRawUnsafe).not.toHaveBeenCalled();
 });
 it.each(['wrongColumn','prefix','composite','unexpectedUnique'] as const)('fails closed without DDL for %s metadata',async mode=>{
  const f=fixture();if(mode==='wrongColumn')f.rows[0].c='id';else if(mode==='prefix')f.rows[0].prefix=4;else if(mode==='composite')f.rows.push({...f.rows[0],c:'id',seq:2});else f.rows.push({...f.rows[0],name:'unreviewed_unique'});
  await expect(ensureFinanceTaxRevisionIndexes(f.db as never)).rejects.toThrow('finance_tax_index_upgrade_failed');expect(f.db.$executeRawUnsafe).not.toHaveBeenCalled();
 });
 it('accepts a concurrent successful upgrade only after verifying metadata',async()=>{
  const f=fixture();f.db.$executeRawUnsafe.mockImplementation(async()=>{f.upgraded();throw Error('duplicate index from other boot');});
  await expect(ensureFinanceTaxRevisionIndexes(f.db as never)).resolves.toBeUndefined();
 });
 it('does not swallow failed or incomplete DDL and sanitizes driver details',async()=>{
  const f=fixture();f.db.$executeRawUnsafe.mockRejectedValue(Error('secret driver details'));
  await expect(ensureFinanceTaxRevisionIndexes(f.db as never)).rejects.toThrow(/^finance_tax_index_upgrade_failed$/);
 });
});
