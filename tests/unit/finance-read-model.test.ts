import {describe,expect,it} from 'vitest';
import {financeNumber,readFinanceData,readEffectiveFinanceTaxPolicy} from '@/lib/finance/read-model';
import {FINANCE_TABLES} from '@/lib/finance/schema';
import {financeSchemaColumns} from '../fixtures/finance-schema-columns';

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
  it('keeps the exact dynamic variant and discount fields in the finance order projection',async()=>{
    const variantSnapshot={key:'vid-black-xl',vid:'vid-black-xl',sku:'CJ-BLK-XL',attributes:{Color:'Black',Size:'XL',Voltage:'220V',Plug:'EU',Material:'Steel'}};
    const db={$queryRaw:async(sql:TemplateStringsArray)=>{
      const query=sql.join('?');
      if(query.includes('FROM commerce_orders'))return [{id:9n,member_id:2n,status:'paid',created_at:new Date('2026-09-24T10:00:00Z'),paid_at:null,subtotal_minor:10000,shipping_fee_minor:0,total_minor:10000,currency:'SAR',shipping:{name:'Buyer'}}];
      if(query.includes('FROM commerce_order_items'))return [{order_id:9n,product_id:5n,title:'Product',quantity:1,unit_price_minor:10000,list_unit_price_minor:12000,discount_minor:2000,total_minor:10000,variant_snapshot:variantSnapshot}];
      return [];
    }};
    const order=(await readFinanceData(db as never)).orders[0];
    expect(order.items[0]).toMatchObject({unitMinor:10000,listUnitMinor:12000,discountMinor:2000,variantSnapshot});
  });
  it('preserves the receipt accounting date separately from a later actual invoice issue date',async()=>{
    const created=new Date('2026-08-20T12:00:00Z'),issued=new Date('2026-09-02T12:00:00Z');
    const tx={$queryRaw:async(sql:TemplateStringsArray)=>{
      const query=sql.join('?');
      if(query.includes('information_schema.TABLES'))return FINANCE_TABLES.map(name=>({name,engine:'InnoDB'}));
      if(query.includes('information_schema.COLUMNS'))return financeSchemaColumns();
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
  it('effective policy lookup uses the Riyadh date and does not assume a policy exists',async()=>{
    const observed:unknown[][]=[];
    const db={$queryRaw:async(sql:TemplateStringsArray,...values:unknown[])=>{observed.push(values);expect(sql.join('?')).toContain('effective_from<=');return [];}};
    expect(await readEffectiveFinanceTaxPolicy(db as never,new Date('2026-09-30T20:59:59Z'))).toBeNull();
    expect(await readEffectiveFinanceTaxPolicy(db as never,new Date('2026-09-30T21:00:00Z'))).toBeNull();
    expect(observed).toEqual([['2026-09-30'],['2026-10-01']]);
  });
  it('preserves audit before/after and request metadata in the read projection',async()=>{
    const payload={before:{status:'draft'},after:{status:'approved'},ip:'127.0.0.1',sessionFingerprint:'a'.repeat(64)};
    const db={$queryRaw:async(sql:TemplateStringsArray)=>{
      const query=sql.join('?');if(query.includes('information_schema.TABLES'))return FINANCE_TABLES.map(name=>({name,engine:'InnoDB'}));
      if(query.includes('information_schema.COLUMNS'))return financeSchemaColumns();
      if(query.includes('reason,payload FROM finance_audit'))return [{id:1n,created_at:new Date('2026-09-22T12:00:00Z'),actor_id:72n,action:'settlement_approved',entity:'settlement',entity_id:'9',reason:'proof checked',payload:JSON.stringify(payload)}];return [];
    }};
    expect((await readFinanceData(db as never)).audit[0]).toMatchObject({...payload,actorId:'72',entityId:'9'});
  });
});
