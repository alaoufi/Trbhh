import {beforeEach,describe,expect,it,vi} from 'vitest';
import {calculateFiscalLinesV2} from '@/lib/finance/fiscal-v2';
import {buildReturnSnapshot} from '@/lib/finance/workflows';
import {fingerprint} from '@/lib/finance/service';
import type {FinanceData,FinanceInvoice,FinanceTaxPolicy,OrderFiscalSnapshot,FiscalSnapshotV2} from '@/lib/finance/types';
import type {CommerceDb} from '@/lib/commerce/types';
const mock=vi.hoisted(()=>({access:vi.fn(),data:vi.fn()}));
vi.mock('@/lib/access-control/store',()=>({readAccess:mock.access}));
vi.mock('@/lib/finance/read-model',async original=>({...await original<typeof import('@/lib/finance/read-model')>(),readFinanceData:mock.data}));
import {buildTaxRegistrationReport,readTaxRegistrationMonitor} from '@/lib/finance/tax-registration-read';

const now=new Date('2026-09-24T12:00:00Z'),saleAt='2026-09-01T12:00:00.000Z';
function fixture(rate=1500):FinanceData {
 const policy:FinanceTaxPolicy={id:'5',requestId:'6',at:'2026-01-01T00:00:00.000Z',effectiveFrom:'2026-01-02',issuer:{name:'تربح',address:'الرياض',taxNumber:'300000000000003'},vatBps:rate,policyReference:'approved-platform-sale',calculationPolicy:{version:2,priceBasis:'exclusive',itemScope:'uniform_catalog',shippingPriceBasis:'exclusive',shippingVatBps:rate,discountTreatment:'none',rounding:'line_half_up',policyRollover:'hold_for_review',automationDelegateId:'9',vatControl:{enabled:rate>0,registrationConfirmed:rate>0,registrationEffectiveFrom:rate>0?'2026-01-02':null,registrationThresholdMinor:37500000}}};
 const totals=calculateFiscalLinesV2([{key:'7',title:'منتج',quantity:2,unitPriceMinor:10000,discountMinor:0,vatBps:rate,priceBasis:'exclusive',component:'product'},{key:'shipping',title:'الشحن',quantity:1,unitPriceMinor:0,discountMinor:0,vatBps:rate,priceBasis:'exclusive',component:'shipping'}]);
 const saved:OrderFiscalSnapshot={version:2,orderId:'2',capturedAt:saleAt,policy:policy as OrderFiscalSnapshot['policy'],customer:{name:'PRIVATE_CUSTOMER',address:'PRIVATE_ADDRESS'},currency:'SAR',...totals};
 const snapshot:FiscalSnapshotV2={version:2,issuer:policy.issuer,customer:saved.customer,currency:'SAR',...totals,paidMinor:totals.totalMinor,sourceOrderId:'2',sourceReceiptId:'3',policyReference:policy.policyReference,policyId:'5',policyRequestId:'6',orderSnapshotFingerprint:fingerprint(saved),derivation:'sale'};
 const source={id:'2',memberId:'44',customerName:saved.customer.name,status:'paid',createdAt:saleAt,paidAt:saleAt,subtotalMinor:totals.totalMinor,shippingMinor:0,totalMinor:totals.totalMinor,currency:'SAR',items:[{productId:'7',title:'منتج',quantity:2,unitMinor:10000,totalMinor:totals.totalMinor}],suppliers:[]};
 const invoice:FinanceInvoice={id:'1',orderId:'2',receiptId:'3',number:'INV-1',kind:'invoice',parentId:null,status:'issued',at:saleAt,issuedAt:'2026-09-10T00:00:00.000Z',totalMinor:totals.totalMinor,netMinor:totals.netMinor,vatMinor:totals.vatMinor,snapshot,source:structuredClone(source),reason:''};
 return {ready:true,orders:[source],orderFiscalSnapshots:[saved],receipts:[{id:'3',orderId:'2',provider:'moyasar',reference:'live-paid-123',amountMinor:totals.totalMinor,currency:'SAR',at:saleAt}],invoices:[invoice],taxPolicies:[policy],requests:[{id:'6',kind:'tax_settings',targetId:'tax',payload:{effectiveFrom:policy.effectiveFrom,issuer:policy.issuer,vatBps:policy.vatBps,policyReference:policy.policyReference,calculationPolicy:policy.calculationPolicy},status:'approved',makerId:'8',checkerId:'9',reason:'اعتماد البيع باسم تربح',approvalReason:'اعتمد',at:policy.at,decidedAt:policy.at,result:{policyId:'5'}}],refunds:[],suppliers:[],accruals:[],expenses:[],settlements:[],budgets:[],periods:[],audit:[]};
}
const report=(data=fixture())=>buildTaxRegistrationReport(data,[],now);
beforeEach(()=>{vi.clearAllMocks();mock.access.mockResolvedValue({ready:true,keys:new Set(['tax:view'])});mock.data.mockResolvedValue(fixture());});

describe('confirmed platform tax source adapter',()=>{
 it('counts coherent issued net supply once, not invoice plus payment plus order or VAT',()=>{const result=report();expect(result.confirmedTotalMinor).toBe(20000);expect(result.confirmedSupplyCount).toBe(1);expect(result.coverage.gaps).toEqual([]);});
 it('counts the same taxable supply while VAT is off',()=>expect(report(fixture(0)).confirmedTotalMinor).toBe(20000));
 it('uses receipt/supply time even when issuance was delayed',()=>{const data=fixture();data.invoices[0].issuedAt='2026-09-25T00:00:00Z';expect(report(data).confirmedTotalMinor).toBe(0);data.invoices[0].issuedAt='2026-09-20T00:00:00Z';const result=buildTaxRegistrationReport(data,[],new Date('2027-09-02T12:00:00Z'));expect(result.confirmedTotalMinor).toBe(0);});
 it('deduplicates repeated immutable invoice rows',()=>{const data=fixture();data.invoices.push(structuredClone(data.invoices[0]));expect(report(data).confirmedTotalMinor).toBe(20000);});
 it.each(['sandbox','moyasar_test','fixture'])('excludes explicit %s payment provenance',provider=>{const data=fixture();data.receipts[0].provider=provider;const result=report(data);expect(result.confirmedTotalMinor).toBe(0);expect(result.excludedTestCount).toBe(1);expect(result.coverage.gaps).toEqual([]);});
 it('does not classify an ordinary reference containing contest as a test',()=>{const data=fixture();data.receipts[0].reference='contest-winner-payment';expect(report(data).confirmedTotalMinor).toBe(20000);});
 it.each(['receipt','policy','issuer','snapshot','source','approval'])('moves incoherent %s evidence to quantified review coverage',which=>{
  const data=fixture(),invoice=data.invoices[0];
  if(which==='receipt')data.receipts[0].amountMinor++;
  if(which==='policy')data.taxPolicies![0].calculationPolicy!.itemScope='other' as 'uniform_catalog';
  if(which==='issuer')invoice.snapshot!.issuer.name='another issuer';
  if(which==='snapshot')invoice.snapshot!.netMinor++;
  if(which==='source')invoice.source.memberId='999';
  if(which==='approval')data.requests![0].status='pending';
  const result=report(data);expect(result.confirmedTotalMinor).toBe(0);expect(result.coverage.complete).toBe(false);expect(result.coverage.gaps.find(gap=>gap.code==='invoice_unverified')).toMatchObject({count:1,amountMinor:23000});expect(result.forecast).toBeNull();
 });
 it('exposes paid unissued orders without claiming zero total is complete',()=>{const data=fixture();data.invoices=[];const result=report(data);expect(result.confirmedTotalMinor).toBe(0);expect(result.coverage.gaps).toContainEqual(expect.objectContaining({code:'paid_unissued',count:1,amountMinor:23000}));});
 it('excludes unpaid raw order GMV',()=>{const data=fixture();data.invoices=[];data.receipts=[];data.orders[0].status='awaiting_payment';data.orders[0].paidAt=null;expect(report(data).coverage.gaps).toEqual([]);});
 it('keeps unclear legacy documents out of confirmed supply',()=>{const data=fixture();data.invoices[0].snapshot={...data.invoices[0].snapshot!,version:1} as never;expect(report(data).coverage.gaps).toContainEqual(expect.objectContaining({code:'invoice_unverified'}));});
 it.each(['line_policy','item','supplier','saved_total','customer','same_checker','invalid_paid_at','invalid_issued_at'])('rejects internally recomputed but incoherent %s provenance',which=>{
  const data=fixture(),saved=data.orderFiscalSnapshots![0],invoice=data.invoices[0];
  if(which==='line_policy'){saved.policy.vatBps=0;saved.policy.calculationPolicy.shippingVatBps=0;data.requests![0].payload=structuredClone(saved.policy);}
  if(which==='item'){data.orders[0].items[0].unitMinor++;invoice.source=structuredClone(data.orders[0]);}
  if(which==='supplier'){data.orders[0].suppliers=[{supplierId:'77',supplierName:'supplier',productId:'7',amountMinor:5000}];invoice.source=structuredClone(data.orders[0]);}
  if(which==='saved_total')saved.totalMinor++;
  if(which==='customer'){data.orders[0].customerName='different';invoice.source=structuredClone(data.orders[0]);}
  if(which==='same_checker')data.requests![0].checkerId=data.requests![0].makerId;
  if(which==='invalid_paid_at'){data.orders[0].paidAt='invalid';invoice.source=structuredClone(data.orders[0]);}
  if(which==='invalid_issued_at')invoice.issuedAt='invalid';
  (invoice.snapshot as FiscalSnapshotV2).orderSnapshotFingerprint=fingerprint(saved);
  const result=report(data);expect(result.confirmedTotalMinor).toBe(0);expect(result.coverage.gaps).toContainEqual(expect.objectContaining({code:'invoice_unverified'}));
 });
 it('applies validated partial credit and reversal without subtracting cash refund again',()=>{
  const data=fixture(),original=data.invoices[0],snapshot=original.snapshot as FiscalSnapshotV2;
  const credit=buildReturnSnapshot(snapshot,[],{lines:[{key:'7',quantity:1}]});
  data.invoices.push({...original,id:'11',number:'CRN-11',kind:'credit_note',parentId:'1',at:'2026-09-12T00:00:00Z',issuedAt:'2026-09-12T00:00:00Z',snapshot:credit,totalMinor:credit.totalMinor,netMinor:credit.netMinor,vatMinor:credit.vatMinor});
  data.refunds.push({id:'r1',orderId:'2',receiptId:'3',provider:'moyasar',externalId:'refund1',amountMinor:credit.totalMinor,currency:'SAR',at:'2026-09-13T00:00:00Z',evidenceRef:'private',actorId:'9'});
  expect(report(data).confirmedTotalMinor).toBe(10000);
  data.refunds=[];const reversal=buildReturnSnapshot(snapshot,[{id:'11',kind:'credit_note',snapshot:credit}],{lines:[],reversalOf:'11'});
  data.invoices.push({...original,id:'12',number:'DBN-12',kind:'debit_note',parentId:'1',at:'2026-09-14T00:00:00Z',issuedAt:'2026-09-14T00:00:00Z',snapshot:reversal,totalMinor:reversal.totalMinor,netMinor:reversal.netMinor,vatMinor:reversal.vatMinor});
  expect(report(data).confirmedTotalMinor).toBe(20000);
 });
 it('shows unmatched refunds as gaps rather than inventing a tax credit',()=>{const data=fixture();data.refunds.push({id:'r',orderId:'2',receiptId:'3',provider:'moyasar',externalId:'r',amountMinor:100,currency:'SAR',at:saleAt,evidenceRef:'private',actorId:'9'});const result=report(data);expect(result.confirmedTotalMinor).toBe(20000);expect(result.coverage.gaps).toContainEqual(expect.objectContaining({code:'refund_unmatched'}));});
 it('quantifies unclassified wallet services but ignores deposits',()=>{
  const result=buildTaxRegistrationReport(fixture(),[{reason:'subscription',count:2,debitsMinor:5000,creditsMinor:0},{reason:'topup',count:1,debitsMinor:0,creditsMinor:900000}],now);
  expect(result.confirmedTotalMinor).toBe(20000);expect(result.coverage.gaps).toEqual([expect.objectContaining({code:'wallet_subscription',count:2,amountMinor:5000})]);expect(JSON.stringify(result)).not.toContain('PRIVATE_');
 });
 it('uses only the effective approved central threshold',()=>{const data=fixture();data.taxPolicies![0].calculationPolicy!.vatControl!.registrationThresholdMinor=100000;data.requests![0].payload=structuredClone(data.taxPolicies![0]);expect(report(data).thresholdMinor).toBe(100000);});
 it('keeps malformed approval evidence as a visible gap instead of treating the default threshold as verified',()=>{const data=fixture();data.requests![0].payload=null as never;const result=report(data);expect(result.thresholdMinor).toBe(37500000);expect(result.coverage.gaps).toContainEqual(expect.objectContaining({code:'threshold_unverified'}));expect(result.confirmedTotalMinor).toBe(0);});
});

describe('tax monitor read permission and read-only boundary',()=>{
 it('requires fresh tax:view before any financial source read, with no legacy-admin bypass',async()=>{
  mock.access.mockResolvedValue({ready:true,keys:new Set(['finance:view'])});const query=vi.fn(),tx={$queryRaw:query},db={$transaction:vi.fn(fn=>fn(tx))} as unknown as CommerceDb;
  await expect(readTaxRegistrationMonitor(db,9n,now)).rejects.toThrow('access_forbidden');expect(mock.data).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled();
 });
 it('returns aggregate-only data from one consistent read transaction without writes',async()=>{
  const query=vi.fn().mockResolvedValue([]),tx={$queryRaw:query},transaction=vi.fn(fn=>fn(tx)),db={$transaction:transaction} as unknown as CommerceDb;
  const result=await readTaxRegistrationMonitor(db,9n,now);expect(result.confirmedTotalMinor).toBe(20000);expect(transaction).toHaveBeenCalledWith(expect.any(Function),expect.objectContaining({isolationLevel:'RepeatableRead'}));expect(mock.access).toHaveBeenCalledWith(tx,9);expect(query).toHaveBeenCalledOnce();expect(JSON.stringify(result)).not.toContain('PRIVATE_');
 });
});
