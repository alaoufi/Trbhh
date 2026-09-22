import {describe, expect, it} from 'vitest';
import {buildFinanceReport, parseFinanceQuery, settlementCandidates} from '@/lib/finance/reports';
import type {FinanceData, FinanceQuery, FinanceSettlement} from '@/lib/finance/types';

const now = new Date('2026-09-22T12:00:00Z');
const query:FinanceQuery = {month:'2026-09',section:'overview',mode:'simple'};
function fixture():FinanceData {
  const source = {id:'o1',memberId:'m1',customerName:'عميل',status:'paid',createdAt:'2026-09-02T09:00:00Z',paidAt:'2026-09-02T09:05:00Z',subtotalMinor:11500,shippingMinor:0,totalMinor:11500,currency:'SAR',items:[{productId:'p1',title:'منتج',quantity:1,unitMinor:11500,totalMinor:11500}],suppliers:[{supplierId:'s1',supplierName:'مورد',productId:'p1',amountMinor:7000}]};
  return {ready:true,orders:[source],receipts:[{id:'r1',orderId:'o1',provider:'fixture',amountMinor:11500,currency:'SAR',reference:'pay1',at:'2026-09-02T09:05:00Z'}],refunds:[],suppliers:[{id:'s1',name:'مورد'}],accruals:[{id:'a1',orderId:'o1',productId:'p1',supplierId:'s1',amountMinor:7000,at:'2026-09-02T09:05:00Z',eligibleAt:'2026-09-10T00:00:00Z',dueAt:'2026-09-25T00:00:00Z',holdReason:''}],expenses:[],settlements:[],invoices:[{id:'i1',orderId:'o1',receiptId:'r1',number:'INV-001',kind:'invoice',parentId:null,status:'issued',at:'2026-09-02T09:05:00Z',totalMinor:11500,netMinor:10000,vatMinor:1500,reason:'',source,snapshot:{version:1,issuer:{name:'جهة',taxNumber:'300000000000003',address:'عنوان'},customer:{name:'عميل',address:'عنوان'},currency:'SAR',lines:[{key:'p1',title:'منتج',quantity:1,unitNetMinor:10000,discountMinor:0,vatBps:1500,netMinor:10000,vatMinor:1500,grossMinor:11500,supplierId:'s1',supplierMinor:7000}],netMinor:10000,vatMinor:1500,totalMinor:11500,paidMinor:11500,sourceOrderId:'o1',sourceReceiptId:'r1',policyReference:'approved-policy-1'}}],budgets:[],periods:[],audit:[]};
}
const refund=(amountMinor=1150)=>({id:'ref1',orderId:'o1',receiptId:'r1',provider:'fixture',externalId:'refund-event-1',amountMinor,currency:'SAR',at:'2026-09-21T12:00:00Z',evidenceRef:'verified-event-1',actorId:'admin1'});
function addPartialCredit(data:FinanceData,at='2026-09-20T12:00:00Z') {
  const credit=structuredClone(data.invoices[0]);
  Object.assign(credit,{id:'credit1',kind:'credit_note',parentId:'i1',number:'CR-1',at,totalMinor:1150,netMinor:1000,vatMinor:150,reason:'جزء مرتجع'});
  Object.assign(credit.snapshot!,{netMinor:1000,vatMinor:150,totalMinor:1150,paidMinor:1150});
  Object.assign(credit.snapshot!.lines[0],{discountMinor:9000,netMinor:1000,vatMinor:150,grossMinor:1150,supplierMinor:700});
  data.invoices.push(credit);return credit;
}
const metric=(r:ReturnType<typeof buildFinanceReport>,key:string)=>r.metrics.find(m=>m.key===key)?.valueMinor;
const settlement=(patch:Partial<FinanceSettlement>={}):FinanceSettlement=>({id:'s-pay',supplierId:'s1',amountMinor:2000,at:'2026-09-12T10:00:00Z',status:'approved',reference:'bank-1',reason:'',lines:[{accrualId:'a1',amountMinor:2000}],reversalOf:null,...patch});

describe('finance reports from immutable recorded sources',()=>{
  it('reconciles complete sources and provides a source link for every metric',()=>{
    const report=buildFinanceReport(fixture(),query,now);
    expect(metric(report,'sales')).toBe(11500);
    expect(metric(report,'collected')).toBe(11500);
    expect(metric(report,'trbhh_income')).toBe(3000);
    expect(metric(report,'vat')).toBe(1500);
    expect(report.issues.filter(i=>i.severity==='error')).toEqual([]);
    expect(report.canClose).toBe(true);
    expect([...report.metrics,...report.previousMetrics].every(m=>m.href.startsWith('/admin/finance?')&&m.explanation.length>0)).toBe(true);
  });
  it('uses Riyadh month boundaries and calculates prior-month metrics independently',()=>{
    const data=fixture();
    data.receipts[0].at='2026-08-31T21:00:00Z';
    data.orders[0].paidAt='2026-08-31T21:00:00Z';
    data.invoices[0].at='2026-08-31T21:00:00Z';
    data.accruals[0].at='2026-08-31T21:00:00Z';
    const report=buildFinanceReport(data,query,now);
    expect(metric(report,'collected')).toBe(11500);
    expect(report.previousMetrics.find(m=>m.key==='collected')?.valueMinor).toBe(0);
    data.receipts[0].at='2026-08-31T20:59:59Z';
    expect(buildFinanceReport(data,query,now).previousMetrics.find(m=>m.key==='collected')?.valueMinor).toBe(11500);
  });
  it('retains opening supplier balances and excludes future movements from month end',()=>{
    const data=fixture();
    data.accruals[0].at='2026-08-20T10:00:00Z';
    data.settlements=[settlement(),settlement({id:'oct',at:'2026-10-02T00:00:00Z',amountMinor:1000,lines:[{accrualId:'a1',amountMinor:1000}]})];
    const report=buildFinanceReport(data,query,new Date('2026-10-05T00:00:00Z'));
    expect(report.suppliers[0]).toMatchObject({openingMinor:7000,accruedMinor:0,paidMinor:2000,remainingMinor:5000});
    expect(report.movements.at(-1)?.balanceMinor).toBe(5000);
  });
  it('does not release held accruals merely because the order is paid',()=>{
    const data=fixture(); data.accruals[0].eligibleAt=null;data.accruals[0].dueAt=null;
    const report=buildFinanceReport(data,query,now);
    expect(report.suppliers[0]).toMatchObject({pendingMinor:7000,dueMinor:0,remainingMinor:7000});
    expect(report.due7Minor).toBe(0);expect(report.due30Minor).toBe(0);
    expect(report.issues.some(i=>i.key.includes('eligibility'))).toBe(true);
    expect(report.canClose).toBe(false);
  });
  it('subtracts partial allocations and anchors due windows to now for the current month',()=>{
    const data=fixture(); data.settlements=[settlement()];
    const report=buildFinanceReport(data,query,now);
    expect(report.suppliers[0]).toMatchObject({paidMinor:2000,remainingMinor:5000});
    expect(report.due7Minor).toBe(5000);expect(report.due30Minor).toBe(5000);
    expect(report.availableMinor).toBe(4500);
  });
  it('uses historical month end for commitments and excludes obligations first recorded later',()=>{
    const data=fixture();data.accruals[0].dueAt='2026-10-04T00:00:00Z';
    data.expenses=[{id:'e1',category:'hosting',description:'Future',netMinor:100,vatMinor:0,totalMinor:100,paidMinor:0,at:'2026-10-01T00:00:00Z',dueAt:'2026-10-02T00:00:00Z',reference:'e1',reversalOf:null}];
    const report=buildFinanceReport(data,query,new Date('2026-11-10T00:00:00Z'));
    expect(report.due7Minor).toBe(7000);
  });
  it('counts reversals at their own date and ignores drafts',()=>{
    const data=fixture();data.settlements=[settlement({at:'2026-08-25T10:00:00Z',status:'reversed'}),settlement({id:'reversal',at:'2026-09-12T10:00:00Z',reversalOf:'s-pay'}),settlement({id:'draft',status:'draft'})];
    data.accruals[0].at='2026-08-01T00:00:00Z';data.accruals[0].eligibleAt='2026-08-10T00:00:00Z';data.accruals[0].dueAt='2026-08-20T00:00:00Z';
    const report=buildFinanceReport(data,query,now);
    expect(report.suppliers[0]).toMatchObject({openingMinor:5000,paidMinor:-2000,remainingMinor:7000});
    expect(metric(report,'supplier_paid')).toBe(-2000);
    expect(report.previousMetrics.find(m=>m.key==='supplier_paid')?.valueMinor).toBe(2000);
  });
  it('leaves policy-dependent amounts unknown and blocks close for pending policy',()=>{
    const data=fixture();Object.assign(data.invoices[0],{status:'pending_policy',snapshot:null,netMinor:null,vatMinor:null,number:null});
    const report=buildFinanceReport(data,query,now);
    expect(metric(report,'vat')).toBeNull();expect(metric(report,'trbhh_income')).toBeNull();expect(metric(report,'net_income')).toBeNull();
    expect(report.canClose).toBe(false);expect(report.issues.some(i=>i.key.includes('pending_policy')&&i.severity==='error')).toBe(true);
  });
  it.each(['receipt','item','accrual','vat'] as const)('detects even a one-halalah %s difference',target=>{
    const data=fixture();
    if(target==='receipt')data.receipts[0].amountMinor--;
    if(target==='item')data.orders[0].items[0].totalMinor--;
    if(target==='accrual')data.accruals[0].amountMinor--;
    if(target==='vat')data.invoices[0].snapshot!.lines[0].vatMinor--;
    const report=buildFinanceReport(data,query,now);
    expect(report.canClose).toBe(false);expect(report.issues.some(i=>Math.abs(i.differenceMinor??0)===1)).toBe(true);
  });
  it('flags missing receipts, duplicate payment events, and missing invoice archives',()=>{
    const missing=fixture();missing.receipts=[];
    expect(buildFinanceReport(missing,query,now).issues.some(i=>i.key.includes('receipt_missing'))).toBe(true);
    const duplicate=fixture();duplicate.receipts.push({...duplicate.receipts[0],id:'r2'});
    expect(buildFinanceReport(duplicate,query,now).issues.some(i=>i.key.includes('receipt_duplicate'))).toBe(true);
    const archive=fixture();archive.invoices=[];
    const report=buildFinanceReport(archive,query,now);
    expect(report.issues.some(i=>i.key.includes('invoice_missing'))).toBe(true);expect(metric(report,'vat')).toBeNull();
  });
  it('rejects settlement overpayment and allocations to another supplier',()=>{
    const data=fixture();data.settlements=[settlement({amountMinor:7001,lines:[{accrualId:'a1',amountMinor:7001}]})];
    expect(buildFinanceReport(data,query,now).issues.some(i=>i.key.includes('overpayment'))).toBe(true);
    data.settlements=[settlement({supplierId:'s2'})];
    expect(buildFinanceReport(data,query,now).issues.some(i=>i.key.includes('settlement_source'))).toBe(true);
  });
  it('does not attribute a shared customer receipt to a single supplier',()=>{
    const data=fixture();data.suppliers.push({id:'s2',name:'ثان'});data.orders[0].suppliers.push({supplierId:'s2',supplierName:'ثان',productId:'p2',amountMinor:1000});
    const report=buildFinanceReport(data,{...query,supplierId:'s1'},now);
    expect(metric(report,'collected')).toBeNull();expect(report.movements.some(m=>m.id==='r1')).toBe(false);
    expect(report.issues.some(i=>i.key.includes('supplier_cash_scope'))).toBe(true);
  });
  it('uses recorded cash movements, including expense reversals, without claiming a bank balance',()=>{
    const data=fixture();data.expenses=[{id:'e1',category:'hosting',description:'خدمة',netMinor:1000,vatMinor:150,totalMinor:1150,paidMinor:1150,at:'2026-09-03T10:00:00Z',dueAt:'2026-09-03T10:00:00Z',reference:'exp-1',reversalOf:null},{id:'e2',category:'hosting',description:'إلغاء',netMinor:1000,vatMinor:150,totalMinor:1150,paidMinor:1150,at:'2026-09-04T10:00:00Z',dueAt:'2026-09-04T10:00:00Z',reference:'exp-2',reversalOf:'e1'}];
    const report=buildFinanceReport(data,query,now);
    expect(metric(report,'cashflow')).toBe(11500);expect(metric(report,'operating_expenses')).toBe(0);
    expect(report.issues.some(i=>i.key==='cash_scope')).toBe(true);
    expect(report.metrics.find(m=>m.key==='cashflow')?.explanation).toContain('ليس رصيد');
  });
  it('reports budget differences and leaves percentage undefined for a zero plan',()=>{
    const data=fixture();data.budgets=[{month:'2026-09',category:'sales',plannedMinor:10000}];
    const report=buildFinanceReport(data,query,now);
    expect(report.budget.find(b=>b.category==='sales')).toMatchObject({plannedMinor:10000,actualMinor:11500,differenceMinor:1500,usagePercent:115});
    expect(report.budget.find(b=>b.category==='hosting')?.usagePercent).toBeNull();
  });
  it('never treats unavailable tables as an empty, ready accounting period',()=>{
    const data=fixture();data.ready=false;
    const report=buildFinanceReport(data,query,now);expect(report.canClose).toBe(false);expect(report.issues.some(i=>i.key==='data_unavailable'&&i.severity==='error')).toBe(true);
  });
  it('keeps income unknown when the invoice omits supplier allocation policy',()=>{
    const data=fixture();delete data.invoices[0].snapshot!.lines[0].supplierId;delete data.invoices[0].snapshot!.lines[0].supplierMinor;
    const report=buildFinanceReport(data,query,now);
    expect(metric(report,'trbhh_income')).toBeNull();
    expect(report.issues.some(i=>i.key.includes('supplier_policy_missing'))).toBe(true);
    expect(report.canClose).toBe(false);
  });
  it('reconciles supplier allocations in the fiscal snapshot and captured amount',()=>{
    const data=fixture();data.invoices[0].snapshot!.lines[0].supplierMinor=6999;data.invoices[0].snapshot!.paidMinor=11499;
    const report=buildFinanceReport(data,query,now);
    expect(report.issues.some(i=>i.key.includes('invoice_supplier')&&i.differenceMinor===-1)).toBe(true);
    expect(report.issues.some(i=>i.key.includes('invoice_paid')&&i.differenceMinor===-1)).toBe(true);
  });
  it('does not accept a supplier accrual whose source order was never paid',()=>{
    const data=fixture();data.orders[0].paidAt=null;data.receipts=[];data.invoices=[];
    const report=buildFinanceReport(data,query,now);
    expect(report.issues.some(i=>i.key.includes('accrual_orphan'))).toBe(true);expect(report.canClose).toBe(false);
  });
  it('flags duplicate source identifiers instead of accepting doubled expenses',()=>{
    const data=fixture();const expense={id:'e1',category:'hosting' as const,description:'خدمة',netMinor:1000,vatMinor:150,totalMinor:1150,paidMinor:1150,at:'2026-09-03T10:00:00Z',dueAt:'2026-09-03T10:00:00Z',reference:'exp-1',reversalOf:null};
    data.expenses=[expense,{...expense}];
    expect(buildFinanceReport(data,query,now).issues.some(i=>i.key.includes('expense_duplicate_id'))).toBe(true);
  });
  it('preserves a historical closed period when a later reversal is recorded',()=>{
    const data=fixture();data.settlements=[settlement({at:'2026-09-26T00:00:00Z',status:'reversed'}),settlement({id:'rev',reversalOf:'s-pay',at:'2026-10-02T00:00:00Z'})];
    const report=buildFinanceReport(data,query,new Date('2026-10-10T00:00:00Z'));
    expect(metric(report,'supplier_paid')).toBe(2000);expect(report.suppliers[0].remainingMinor).toBe(5000);
    expect(report.issues.filter(i=>i.severity==='error')).toEqual([]);
  });
  it('rejects duplicate reversals even when their net amount looks like another valid balance',()=>{
    const data=fixture();data.settlements=[settlement(),settlement({id:'rev1',reversalOf:'s-pay'}),settlement({id:'rev2',reversalOf:'s-pay'})];
    const report=buildFinanceReport(data,query,now);
    expect(report.issues.some(i=>i.key.includes('settlement_reversal_duplicate'))).toBe(true);expect(report.canClose).toBe(false);
  });
  it('never closes a credit note exceeding the original gross or tax',()=>{
    const data=fixture();data.invoices.push({...structuredClone(data.invoices[0]),id:'credit',kind:'credit_note',parentId:'i1',number:'CR-1',reason:'return',totalMinor:11501});
    const report=buildFinanceReport(data,query,now);
    expect(report.issues.some(i=>i.key.includes('credit_exceeds_invoice'))).toBe(true);expect(report.canClose).toBe(false);
  });
  it('nets an unpaid expense reversal against its original due date, not the reversal date',()=>{
    const data=fixture();const expense={id:'e1',category:'hosting' as const,description:'خدمة',netMinor:1000,vatMinor:0,totalMinor:1000,paidMinor:0,at:'2026-09-03T10:00:00Z',dueAt:'2026-10-15T10:00:00Z',reference:'exp-1',reversalOf:null};
    data.expenses=[expense,{...expense,id:'e2',reversalOf:'e1',at:'2026-09-20T10:00:00Z',dueAt:'2026-09-20T10:00:00Z'}];
    const report=buildFinanceReport(data,query,now);
    expect(report.due7Minor).toBe(7000);expect(report.due30Minor).toBe(7000);
  });
  it('does not report known zero tax or income for a paid order missing all fiscal sources',()=>{
    const data=fixture();data.receipts=[];data.invoices=[];
    const report=buildFinanceReport(data,query,now);
    expect(metric(report,'vat')).toBeNull();expect(metric(report,'trbhh_income')).toBeNull();
  });
  it('keeps arithmetic identical in accountant mode and when only text/status filters change',()=>{
    const data=fixture();const plain=buildFinanceReport(data,query,now);
    const filtered=buildFinanceReport(data,{...query,mode:'accountant',q:'missing',status:'pending'},now);
    expect(filtered.metrics.map(m=>m.valueMinor)).toEqual(plain.metrics.map(m=>m.valueMinor));
    expect(filtered.suppliers).toEqual(plain.suppliers);
  });
  it('deducts only verified recorded cash refunds and flags their missing credit document',()=>{
    const data=fixture();data.refunds=[refund()];
    const report=buildFinanceReport(data,query,now);
    expect(metric(report,'refunds')).toBe(1150);expect(metric(report,'cashflow')).toBe(10350);expect(report.availableMinor).toBe(3350);
    expect(report.budget.find(b=>b.category==='refunds')?.actualMinor).toBe(1150);
    expect(report.issues.some(i=>i.key.includes('refund_credit_difference')&&i.differenceMinor===1150)).toBe(true);expect(report.canClose).toBe(false);
  });
  it('does not invent a cash refund when only a credit note exists',()=>{
    const data=fixture();data.invoices.push({...structuredClone(data.invoices[0]),id:'credit',kind:'credit_note',parentId:'i1',number:'CR-1',reason:'return'});
    const report=buildFinanceReport(data,query,now);
    expect(metric(report,'refunds')).toBe(0);expect(metric(report,'cashflow')).toBe(11500);
    expect(report.issues.some(i=>i.key.includes('refund_credit_difference'))).toBe(true);
  });
  it('rejects duplicate refund events and refunds exceeding the original paid amount',()=>{
    const data=fixture();data.refunds=[refund(11500),{...refund(1),id:'ref2'}];
    const report=buildFinanceReport(data,query,now);
    expect(report.issues.some(i=>i.key.includes('refund_duplicate'))).toBe(true);
    expect(report.issues.some(i=>i.key.includes('refund_exceeds_receipt')&&i.differenceMinor===1)).toBe(true);expect(report.canClose).toBe(false);
  });
  it('validates refund receipt, provider, timestamp and evidence source',()=>{
    const data=fixture();data.refunds=[{...refund(),provider:'other',at:'2026-08-20T12:00:00Z',evidenceRef:''}];
    const report=buildFinanceReport(data,query,now);
    expect(report.issues.some(i=>i.key.includes('refund_source'))).toBe(true);expect(report.canClose).toBe(false);
  });
  it('keeps historical refund cashflow at the refund date and out of supplier cash',()=>{
    const data=fixture();data.refunds=[{...refund(),at:'2026-10-02T12:00:00Z'}];
    expect(metric(buildFinanceReport(data,query,new Date('2026-11-01T00:00:00Z')),'refunds')).toBe(0);
    expect(metric(buildFinanceReport(data,{...query,month:'2026-10'},new Date('2026-11-01T00:00:00Z')),'refunds')).toBe(1150);
    expect(metric(buildFinanceReport(data,{...query,supplierId:'s1'},now),'refunds')).toBeNull();
  });
  it('nets a credit supplier allocation into balances, commitments and linked ledger movements',()=>{
    const data=fixture();addPartialCredit(data);data.refunds=[refund()];
    const report=buildFinanceReport(data,query,now);
    expect(report.suppliers[0]).toMatchObject({openingMinor:0,accruedMinor:6300,remainingMinor:6300});
    expect(report.due7Minor).toBe(6300);expect(metric(report,'supplier_cost')).toBe(6300);
    expect(report.movements.some(m=>m.id.includes('credit1')&&m.debitMinor===700&&m.balanceMinor===6300)).toBe(true);
    expect(report.issues.filter(i=>i.severity==='error')).toEqual([]);
  });
  it('applies supplier credits in their own month and keeps prior opening balances intact',()=>{
    const data=fixture();data.accruals[0].at='2026-08-20T12:00:00Z';addPartialCredit(data);data.refunds=[refund()];
    const report=buildFinanceReport(data,query,now);
    expect(report.suppliers[0]).toMatchObject({openingMinor:7000,accruedMinor:-700,remainingMinor:6300});
  });
  it('preserves a settled supplier return as a recovery receivable without inventing available cash',()=>{
    const data=fixture();data.accruals[0].dueAt='2026-09-11T00:00:00Z';addPartialCredit(data);data.settlements=[settlement({amountMinor:7000,lines:[{accrualId:'a1',amountMinor:7000}]})];data.refunds=[refund()];
    const report=buildFinanceReport(data,query,now);
    expect(report.suppliers[0].remainingMinor).toBe(-700);
    expect(report.issues.some(i=>i.key.includes('supplier_recovery')&&i.severity==='warning')).toBe(true);expect(report.canClose).toBe(true);
    expect(report.availableMinor).toBe(3350);
    expect(settlementCandidates(data,'s1',new Date('2026-09-26T12:00:00Z'))).toEqual([]);
  });
  it('cancelled settlements never count as payments and cancelled invoice drafts need corrective review',()=>{
    const data=fixture();data.settlements=[settlement({status:'cancelled'})];
    expect(metric(buildFinanceReport(data,query,now),'supplier_paid')).toBe(0);
    data.invoices[0].status='cancelled';data.invoices[0].snapshot=null;
    const report=buildFinanceReport(data,query,now);expect(report.canClose).toBe(false);
    expect(report.issues.some(i=>i.key==='invoice_cancelled:i1')).toBe(true);
  });
  it('detects a note supplier allocation that does not belong to its original order item',()=>{
    const data=fixture();const credit=addPartialCredit(data);credit.snapshot!.lines[0].supplierId='s2';
    expect(buildFinanceReport(data,query,now).issues.some(i=>i.key.includes('note_supplier_source'))).toBe(true);
  });
  it('uses the same remaining amounts for settlement selection after notes and partial payments',()=>{
    const data=fixture();addPartialCredit(data);data.settlements=[settlement()];
    expect(settlementCandidates(data,'s1',now)).toEqual([]);
    const candidates=settlementCandidates(data,'s1',new Date('2026-09-26T12:00:00Z'));
    expect(candidates.map(c=>({id:c.accrual.id,remainingMinor:c.remainingMinor}))).toEqual([{id:'a1',remainingMinor:4300}]);
    data.settlements.push(settlement({id:'draft2',status:'draft'}));
    expect(settlementCandidates(data,'s1',new Date('2026-09-26T12:00:00Z'))).toEqual([]);
  });
  it('distinguishes receipt event references from different payment providers',()=>{
    const data=fixture();data.receipts.push({...data.receipts[0],id:'r2',provider:'second',orderId:'another'});
    expect(buildFinanceReport(data,query,now).issues.some(i=>i.key.startsWith('receipt_duplicate_reference:'))).toBe(false);
  });
  it('allows a full credit, debit restoration and recredit when net totals remain within the original',()=>{
    const data=fixture();
    for(const [id,kind,at] of [['cr1','credit_note','2026-09-10T12:00:00Z'],['db1','debit_note','2026-09-12T12:00:00Z'],['cr2','credit_note','2026-09-15T12:00:00Z']] as const)data.invoices.push({...structuredClone(data.invoices[0]),id,kind,at,parentId:'i1',number:id,reason:'تعديل'});
    data.refunds=[refund(11500)];
    const report=buildFinanceReport(data,query,now);
    expect(report.issues.filter(i=>i.severity==='error')).toEqual([]);expect(report.canClose).toBe(true);expect(report.suppliers[0].remainingMinor).toBe(0);
  });
  it('blocks net debit quantities or changed note line identities beyond the original',()=>{
    const data=fixture();const note=addPartialCredit(data);note.kind='debit_note';
    expect(buildFinanceReport(data,query,now).issues.some(i=>i.key.includes('credit_exceeds_invoice'))).toBe(true);
    note.kind='credit_note';note.snapshot!.lines[0].title='Another product';
    expect(buildFinanceReport(data,query,now).issues.some(i=>i.key.includes('note_line_identity'))).toBe(true);
  });
  it('recognizes a late-issued original invoice in its still-open receipt month and retains actual issuance time',()=>{
    const data=fixture();data.invoices[0].issuedAt='2026-10-02T12:00:00Z';
    const report=buildFinanceReport(data,query,new Date('2026-10-05T12:00:00Z'));
    expect(metric(report,'vat')).toBe(1500);expect(metric(report,'trbhh_income')).toBe(3000);
    expect(report.issues.filter(i=>i.severity==='error')).toEqual([]);expect(report.data.invoices[0].issuedAt).toBe('2026-10-02T12:00:00Z');
  });
  it('rejects unsafe aggregates and malformed monetary data instead of silently rounding',()=>{
    const data=fixture();data.receipts[0].amountMinor=Number.MAX_SAFE_INTEGER;data.receipts.push({...data.receipts[0],id:'r2',amountMinor:1});
    expect(()=>buildFinanceReport(data,query,now)).toThrow();
    data.receipts=[{...data.receipts[0],amountMinor:-1}];expect(()=>buildFinanceReport(data,query,now)).toThrow();
  });
});

describe('finance query parsing',()=>{
  it('defaults to the Riyadh calendar month and rejects unsupported query states',()=>{
    expect(parseFinanceQuery({month:'2026-13',section:'unknown',mode:'other'},new Date('2026-08-31T22:00:00Z'))).toEqual({month:'2026-09',section:'overview',mode:'simple'});
    expect(parseFinanceQuery({month:'1000-01'},now).month).toBe('2026-09');
  });
  it('preserves validated filters without changing report arithmetic mode',()=>{
    expect(parseFinanceQuery({month:'2026-08',section:'suppliers',mode:'accountant',supplierId:'s1',q:'  طلب  ',status:'approved'},now)).toEqual({month:'2026-08',section:'suppliers',mode:'accountant',supplierId:'s1',q:'طلب',status:'approved'});
  });
});
