import {describe,expect,it} from 'vitest';
import {financeNumber,readFinanceData} from '@/lib/finance/read-model';
import {FINANCE_TABLES} from '@/lib/finance/schema';

describe('financial source projection consistency',()=>{
  it('reads all source queries through one repeatable-read transaction when a client is supplied',async()=>{
    const observed:string[]=[];
    const tx={$queryRaw:async(sql:TemplateStringsArray)=>{observed.push(sql.join('?'));return [];}};
    let options:unknown;let transactionCount=0;
    const client={
      $queryRaw:async()=>{throw new Error('Torn read outside transaction');},
      $transaction:async<T>(callback:(transaction:typeof tx)=>Promise<T>,settings:unknown)=>{transactionCount++;options=settings;return callback(tx);},
    };
    const report=await readFinanceData(client as never);
    expect(report.ready).toBe(false);expect(report.orders).toEqual([]);expect(report.refunds).toEqual([]);
    expect(transactionCount).toBe(1);expect(options).toMatchObject({isolationLevel:'RepeatableRead'});
    expect(observed.some(sql=>sql.includes('commerce_orders'))).toBe(true);expect(observed.some(sql=>sql.includes('commerce_receipts'))).toBe(true);
  });
  it('uses an existing transaction directly without a nested transaction or writes',async()=>{
    let reads=0;
    const transaction={$queryRaw:async()=>{reads++;return [];}};
    const report=await readFinanceData(transaction as never);
    expect(report.ready).toBe(false);expect(reads).toBe(7);
  });
  it('preserves the receipt accounting date separately from a later actual invoice issue date',async()=>{
    const created=new Date('2026-08-20T12:00:00Z'),issued=new Date('2026-09-02T12:00:00Z');
    const tx={$queryRaw:async(sql:TemplateStringsArray)=>{
      const query=sql.join('?');
      if(query.includes('information_schema.TABLES'))return FINANCE_TABLES.map(name=>({name,engine:'InnoDB'}));
      if(query.includes('FROM finance_invoices'))return [{id:1n,order_id:1n,receipt_id:1n,kind:'invoice',number:'INV-1',parent_id:null,status:'issued',created_at:created,issued_at:issued,net_minor:10000n,vat_minor:1500n,total_minor:11500n,snapshot:null,source_snapshot:{},reason:''}];
      return [];
    }};
    const data=await readFinanceData(tx as never);
    expect(data.invoices[0].at).toBe(created.toISOString());expect(data.invoices[0].issuedAt).toBe(issued.toISOString());
  });
  it.each(['',' ',' 1','1 ','1e3','1.0','0x10','+1','--1','NaN','Infinity','9007199254740993',null,undefined,{},true])('rejects ambiguous or unsafe stored integer %j',value=>{
    expect(()=>financeNumber(value)).toThrow('finance_amount_invalid');
  });
  it('reads exact native bigint, numeric and decimal integer strings',()=>{
    expect(financeNumber(0)).toBe(0);expect(financeNumber(123n)).toBe(123);expect(financeNumber('-123')).toBe(-123);expect(financeNumber('9007199254740991')).toBe(Number.MAX_SAFE_INTEGER);
  });
});
