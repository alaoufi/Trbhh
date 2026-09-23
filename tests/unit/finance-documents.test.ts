import {describe,it,expect,vi} from 'vitest';
import {customerInvoice,readFinanceInvoice} from '@/lib/finance/documents';
import {printableFinanceInvoice,escapeFinanceHtml} from '@/lib/finance/exports';
import {FINANCE_TABLES} from '@/lib/finance/schema';
import {financeSchemaColumns} from '../fixtures/finance-schema-columns';
import type {FinanceInvoice} from '@/lib/finance/types';
const invoice:FinanceInvoice={id:'1',orderId:'2',receiptId:'private-receipt',number:'INV-2026-1',kind:'invoice',parentId:null,status:'issued',at:'2026-09-22T12:00:00.000Z',totalMinor:11500,netMinor:10000,vatMinor:1500,reason:'',
 source:{id:'2',memberId:'44',customerName:'<script>alert(1)</script>',status:'paid',createdAt:'2026-09-22T12:00:00Z',paidAt:'2026-09-22T12:00:00Z',subtotalMinor:11500,shippingMinor:0,totalMinor:11500,currency:'SAR',items:[],suppliers:[{supplierId:'8',supplierName:'PRIVATE_SUPPLIER',productId:'9',amountMinor:6000}]},
 snapshot:{version:1,issuer:{name:'جهة اختبار',taxNumber:'300000000000003',address:'الرياض'},customer:{name:'عميل اختبار',address:'الرياض'},currency:'SAR',lines:[{key:'9',title:'<img onerror=alert(1)>',quantity:1,unitNetMinor:10000,discountMinor:0,vatBps:1500,netMinor:10000,vatMinor:1500,grossMinor:11500,supplierId:'8',supplierMinor:6000}],netMinor:10000,vatMinor:1500,totalMinor:11500,paidMinor:11500,sourceOrderId:'2',sourceReceiptId:'private-receipt',policyReference:'PRIVATE_POLICY'}};
describe('customer finance documents',()=>{
 it('redacts internal data before rendering while retaining original amounts',()=>{
   const safe=customerInvoice(invoice),json=JSON.stringify(safe);
   expect(json).not.toContain('PRIVATE_SUPPLIER');expect(json).not.toContain('PRIVATE_POLICY');expect(json).not.toContain('private-receipt');expect(json).not.toContain('supplierMinor');
   expect(safe.totalMinor).toBe(invoice.totalMinor);expect(invoice.source.suppliers).toHaveLength(1);
 });
 it('never interpolates unescaped database text in printable output',()=>{
   const html=printableFinanceInvoice(customerInvoice(invoice),false);
   expect(html).toContain('&lt;img');expect(html).not.toContain('<img');expect(html).not.toContain('PRIVATE_SUPPLIER');
   expect(escapeFinanceHtml(null)).toBe('غير مكتمل');
 });
 it('binds ownership in the database query and returns no other users invoice',async()=>{
   const queries:{sql:string;values:unknown[]}[]=[];
   const db={$queryRaw:vi.fn(async(sql:TemplateStringsArray,...values:unknown[])=>{
     const q=sql.join('?');queries.push({sql:q,values});
     if(q.includes('information_schema.TABLES'))return FINANCE_TABLES.map(name=>({name,engine:'InnoDB'}));
     if(q.includes('information_schema.COLUMNS'))return financeSchemaColumns();
     return [];
   })};
   expect(await readFinanceInvoice(db as never,'1',44)).toBeNull();
   expect(queries.at(-1)?.sql).toContain('o.member_id=?');expect(queries.at(-1)?.values).toEqual([1n,44n]);
 });
});
