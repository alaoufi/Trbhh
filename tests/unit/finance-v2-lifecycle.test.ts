import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {calculateFiscalLinesV2} from '@/lib/finance/fiscal-v2';
import {buildReturnSnapshot} from '@/lib/finance/workflows';
import {validateAdjustment} from '@/lib/finance/adjustments';
import {customerInvoice} from '@/lib/finance/documents';
import {printableFinanceInvoice} from '@/lib/finance/exports';
import {buildFinanceReport} from '@/lib/finance/reports';
import {FinanceInvoiceView} from '@/components/finance/finance-invoice-view';
import type {FinanceData,FinanceInvoice,FiscalLineV2,FiscalSnapshotV2} from '@/lib/finance/types';

type Note={id:string;kind:'credit_note'|'debit_note';snapshot:FiscalSnapshotV2};
const at='2026-09-22T12:00:00.000Z',noteAt='2026-09-23T12:00:00.000Z';
const line=(changes:Partial<FiscalLineV2>={}):FiscalLineV2=>({key:'7',title:'Frozen product',quantity:2,unitPriceMinor:3,discountMinor:0,vatBps:1500,priceBasis:'inclusive',component:'product',...changes});
function fiscal(lines:FiscalLineV2[]=[line()]):FiscalSnapshotV2 {
 const totals=calculateFiscalLinesV2(lines);
 return {version:2,issuer:{name:'Frozen issuer',taxNumber:'300000000000003',address:'Frozen issuer address'},customer:{name:'Frozen customer',address:'Frozen customer address'},currency:'SAR',...totals,paidMinor:totals.totalMinor,sourceOrderId:'2',sourceReceiptId:'3',policyReference:'PRIVATE_POLICY_REFERENCE',policyId:'private-policy-id',policyRequestId:'private-policy-request',orderSnapshotFingerprint:'f'.repeat(64),derivation:'sale'};
}
function credit(original:FiscalSnapshotV2,prior:Note[],lines:{key:string;quantity:number}[]):FiscalSnapshotV2 {
 const snapshot=buildReturnSnapshot(original,prior,{lines});if(snapshot.version!==2)throw Error('Expected V2 snapshot');return snapshot;
}
function reverse(original:FiscalSnapshotV2,prior:Note[],id:string):FiscalSnapshotV2 {
 const snapshot=buildReturnSnapshot(original,prior,{lines:[],reversalOf:id});if(snapshot.version!==2)throw Error('Expected V2 snapshot');return snapshot;
}
function invoice(snapshot:FiscalSnapshotV2,kind:FinanceInvoice['kind']='invoice',id='1',original=snapshot):FinanceInvoice {
 const productLines=original.lines.filter(x=>x.component==='product'),supplierLines=productLines.filter(x=>x.supplierId);
 const shippingMinor=original.lines.filter(x=>x.component==='shipping').reduce((sum,x)=>sum+x.grossMinor,0);
 return {id,orderId:'2',receiptId:'3',number:(kind==='invoice'?'INV-':kind==='credit_note'?'CRN-':'DBN-')+id,kind,parentId:kind==='invoice'?null:'1',status:'issued',at:kind==='invoice'?at:noteAt,issuedAt:kind==='invoice'?at:noteAt,totalMinor:snapshot.totalMinor,netMinor:snapshot.netMinor,vatMinor:snapshot.vatMinor,snapshot,reason:kind==='invoice'?'':'Reviewed correction',
  source:{id:'2',memberId:'44',customerName:'Frozen customer',status:'paid',createdAt:at,paidAt:at,subtotalMinor:original.totalMinor-shippingMinor,shippingMinor,totalMinor:original.totalMinor,currency:'SAR',items:productLines.map(x=>({productId:x.key,title:x.title,quantity:x.quantity,unitMinor:x.unitPriceMinor,totalMinor:x.grossMinor})),suppliers:supplierLines.map(x=>({supplierId:x.supplierId!,supplierName:'PRIVATE_SUPPLIER',productId:x.key,amountMinor:x.supplierMinor!}))}};
}
function data(original:FiscalSnapshotV2,notes:Note[]=[]):FinanceData {
 const issued=invoice(original),netCredit=notes.reduce((sum,n)=>sum+(n.kind==='credit_note'?1:-1)*n.snapshot.totalMinor,0);
 return {ready:true,orders:[issued.source],receipts:[{id:'3',orderId:'2',provider:'fixture',amountMinor:original.totalMinor,currency:'SAR',reference:'fixture-paid',at}],refunds:netCredit?[{id:'refund-1',orderId:'2',receiptId:'3',provider:'fixture',externalId:'fixture-refund',amountMinor:netCredit,currency:'SAR',at:noteAt,evidenceRef:'fixture-evidence',actorId:'9'}]:[],suppliers:[],accruals:[],expenses:[],settlements:[],invoices:[issued,...notes.map(n=>invoice(n.snapshot,n.kind,n.id,original))],budgets:[],periods:[],audit:[]};
}
const report=(source:FinanceData)=>buildFinanceReport(source,{month:'2026-09',section:'reconciliation',mode:'accountant'},new Date('2026-09-24T12:00:00Z'));

describe('V2 source-derived credits and debit reversals',()=>{
 it('preserves the exact saved VAT remainder across tiny partial and final credits',()=>{
  const original=fiscal(),saved=structuredClone(original);
  expect(original).toMatchObject({totalMinor:6,netMinor:5,vatMinor:1});
  const first=credit(original,[],[{key:'7',quantity:1}]),prior:Note[]=[{id:'11',kind:'credit_note',snapshot:first}];
  const last=credit(original,prior,[{key:'7',quantity:1}]);
  expect(first).toMatchObject({derivation:'source_allocation',totalMinor:3,vatMinor:1,netMinor:2,paidMinor:3});
  expect(last).toMatchObject({totalMinor:3,vatMinor:0,netMinor:3,paidMinor:3});
  expect(()=>validateAdjustment('credit_note',original,prior,last)).not.toThrow();expect(original).toEqual(saved);
  // The saved first allocation differs from independently recalculating one unit.
  expect(calculateFiscalLinesV2(first.lines).vatMinor).toBe(0);
  expect(first.vatMinor+last.vatMinor).toBe(original.vatMinor);expect(first.netMinor+last.netMinor).toBe(original.netMinor);
 });
 it('allocates discount and supplier remainders exactly without changing saved unit prices',()=>{
  const original=fiscal([line({quantity:3,unitPriceMinor:4,discountMinor:2,supplierId:'8',supplierMinor:5})]),notes:Note[]=[];
  const expected=[{grossMinor:3,vatMinor:0,netMinor:3,discountMinor:1,supplierMinor:2},{grossMinor:4,vatMinor:1,netMinor:3,discountMinor:1,supplierMinor:2},{grossMinor:3,vatMinor:0,netMinor:3,discountMinor:0,supplierMinor:1}];
  for(let index=0;index<3;index++){
   const snapshot=credit(original,notes,[{key:'7',quantity:1}]);expect(snapshot.lines[0]).toMatchObject({...expected[index],quantity:1,unitPriceMinor:4,priceBasis:'inclusive',supplierId:'8'});notes.push({id:String(11+index),kind:'credit_note',snapshot});
  }
  for(const field of ['quantity','grossMinor','netMinor','vatMinor','discountMinor','supplierMinor'] as const)expect(notes.reduce((sum,n)=>sum+(n.snapshot.lines[0][field]??0),0)).toBe(original.lines[0][field]);
  expect(()=>credit(original,notes,[{key:'7',quantity:1}])).toThrow('finance_note_exceeds_original');
 });
 it('conserves a one-halala gross across all three source units, including zero-valued allocations',()=>{
  const original=fiscal([line({quantity:3,unitPriceMinor:1,discountMinor:2})]),notes:Note[]=[];
  for(let index=0;index<3;index++){const snapshot=credit(original,notes,[{key:'7',quantity:1}]);notes.push({id:String(11+index),kind:'credit_note',snapshot});}
  expect(notes.map(n=>n.snapshot.totalMinor)).toEqual([0,1,0]);expect(notes.reduce((sum,n)=>sum+n.snapshot.lines[0].discountMinor,0)).toBe(2);
  expect(notes.reduce((sum,n)=>sum+n.snapshot.totalMinor,0)).toBe(original.totalMinor);
 });
 it('keeps unequal item and shipping VAT rates and original identity through a full credit',()=>{
  const original=fiscal([line({quantity:3,unitPriceMinor:7,discountMinor:2}),line({key:'8',quantity:2,unitPriceMinor:3,discountMinor:1,vatBps:500,priceBasis:'exclusive'}),line({key:'shipping',title:'Frozen shipping',quantity:1,unitPriceMinor:5,vatBps:1500,component:'shipping'})]);
  const full=credit(original,[],original.lines.map(x=>({key:x.key,quantity:x.quantity})));
  expect(full).toEqual({...original,derivation:'source_allocation'});expect(full.lines.map(x=>x.vatMinor)).toEqual([2,0,1]);expect(full.totalMinor).toBe(29);
  expect(()=>validateAdjustment('credit_note',original,[],full)).not.toThrow();
 });
 it('reverses one entire prior credit exactly and restores only that credit capacity',()=>{
  const original=fiscal(),first=credit(original,[],[{key:'7',quantity:1}]),prior:Note[]=[{id:'11',kind:'credit_note',snapshot:first}];
  const debit=reverse(original,prior,'11');expect(debit).toEqual({...first,reversalOf:'11',derivation:'source_allocation'});
  expect(()=>validateAdjustment('debit_note',original,prior,debit)).not.toThrow();
  const after:Note[]=[...prior,{id:'12',kind:'debit_note',snapshot:debit}];
  expect(credit(original,after,[{key:'7',quantity:2}])).toEqual({...original,derivation:'source_allocation'});
  expect(()=>reverse(original,after,'11')).toThrow('finance_credit_reversal_invalid');expect(()=>reverse(original,after,'12')).toThrow('finance_credit_reversal_invalid');
 });
 it('rejects duplicate selections, excessive quantities, unknown credits and forged fiscal values',()=>{
  const original=fiscal(),full=credit(original,[],[{key:'7',quantity:2}]);
  expect(()=>credit(original,[],[{key:'7',quantity:1},{key:'7',quantity:1}])).toThrow('finance_return_invalid');
  expect(()=>credit(original,[],[{key:'7',quantity:3}])).toThrow('finance_note_exceeds_original');
  expect(()=>reverse(original,[],'missing')).toThrow('finance_credit_reversal_invalid');
  for(const patch of [{policyId:'different'},{policyRequestId:'different'},{orderSnapshotFingerprint:'0'.repeat(64)},{customer:{name:'Different',address:'Different'}}])expect(()=>validateAdjustment('credit_note',original,[],{...full,...patch})).toThrow('finance_note_identity_invalid');
  expect(()=>validateAdjustment('credit_note',original,[],{...full,totalMinor:full.totalMinor+1})).toThrow('finance_note_difference');
  expect(()=>validateAdjustment('credit_note',{...original,paidMinor:original.totalMinor-1},[],full)).toThrow('finance_note_exceeds_paid');
 });
});

describe('V2 preserved customer and admin documents',()=>{
 it('redacts supplier and approval provenance without mutating archived values or the internal copy',()=>{
  const original=invoice(fiscal([line({title:'<img onerror=alert(1)>',supplierId:'8',supplierMinor:2})])),saved=structuredClone(original),customer=customerInvoice(original);
  const encoded=JSON.stringify(customer);for(const privateValue of ['PRIVATE_SUPPLIER','PRIVATE_POLICY_REFERENCE','private-policy-id','private-policy-request','f'.repeat(64),'supplierMinor','supplierId'])expect(encoded).not.toContain(privateValue);
  expect(customer.receiptId).toBe('');expect(customer.source.memberId).toBe('');expect(customer.snapshot?.sourceReceiptId).toBe('');expect(customer.snapshot?.version).toBe(2);
  expect(customer.totalMinor).toBe(original.totalMinor);expect(customer.snapshot?.lines[0]).toMatchObject({unitPriceMinor:3,priceBasis:'inclusive',netMinor:5,vatMinor:1,grossMinor:6});expect(original).toEqual(saved);
  const publicPrint=printableFinanceInvoice(customer,false),adminPrint=printableFinanceInvoice(original,true);
  expect(publicPrint).toContain('&lt;img');expect(publicPrint).not.toContain('<img');expect(publicPrint).toContain('Frozen customer address');expect(publicPrint).toContain('0.06');expect(publicPrint).not.toContain('PRIVATE_SUPPLIER');expect(adminPrint).toContain('PRIVATE_SUPPLIER');
  expect(renderToStaticMarkup(createElement(FinanceInvoiceView,{invoice:customer,internal:false,printHref:'/account/invoices/1/print'}))).toContain('شامل الضريبة');expect(original).toEqual(saved);
 });
 it('renders saved allocated VAT on both copies instead of recalculating a partial note',()=>{
  const original=fiscal([line({quantity:3,unitPriceMinor:4,discountMinor:2})]),first=credit(original,[],[{key:'7',quantity:1}]),note=invoice(first,'credit_note','11',original);
  expect(first.lines[0]).toMatchObject({grossMinor:3,vatMinor:0,netMinor:3,discountMinor:1});
  for(const internal of [false,true]){
   const view=internal?note:customerInvoice(note),html=printableFinanceInvoice(view,internal);expect(html).toContain('0.03');expect(html).toContain('0.00');expect(view.snapshot?.lines).toEqual(note.snapshot?.lines);
   expect(renderToStaticMarkup(createElement(FinanceInvoiceView,{invoice:view,internal,canExport:false}))).toContain('بنود المستند المحفوظة وقت الإصدار');
  }
 });
});

describe('V2 reconciliation report arithmetic',()=>{
 it.each(['inclusive','exclusive'] as const)('accepts correct %s saved item/shipping taxes without a false math issue',basis=>{
  const original=fiscal([line({quantity:2,unitPriceMinor:1025,priceBasis:basis}),line({key:'shipping',title:'Shipping',quantity:1,unitPriceMinor:125,vatBps:500,priceBasis:basis,component:'shipping'})]);
  expect(report(data(original)).issues.filter(x=>x.severity==='error')).toEqual([]);
 });
 it('accepts source-allocated partial/final credits whose saved VAT cannot be independently recomputed',()=>{
  const original=fiscal(),first=credit(original,[],[{key:'7',quantity:1}]),notes:Note[]=[{id:'11',kind:'credit_note',snapshot:first}];
  notes.push({id:'12',kind:'credit_note',snapshot:credit(original,notes,[{key:'7',quantity:1}])});
  expect(report(data(original,notes)).issues.filter(x=>x.severity==='error')).toEqual([]);
  expect(report(data(original,notes)).metrics.find(x=>x.key==='vat')?.valueMinor).toBe(0);
 });
 it('flags an actual corrupted sale line instead of accepting a matching header total',()=>{
  const source=data(fiscal()),stored=source.invoices[0].snapshot!;stored.lines[0].vatMinor+=1;stored.lines[0].netMinor-=1;
  const keys=report(source).issues.map(x=>x.key);expect(keys).toContain('invoice_line_vatMinor:1:0');expect(keys).toContain('invoice_line_netMinor:1:0');
 });
 it('flags actual saved header and source price mismatches',()=>{
  const source=data(fiscal());source.invoices[0].totalMinor+=1;source.orders[0].items[0].totalMinor+=1;
  const keys=report(source).issues.map(x=>x.key);expect(keys).toContain('invoice_snapshot_totalMinor:1');expect(keys).toContain('item_total:2:7');expect(keys).toContain('order_items:2');
 });
});
