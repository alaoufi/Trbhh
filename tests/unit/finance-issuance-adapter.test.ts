import {beforeEach,describe,expect,it,vi} from 'vitest';
const boundary=vi.hoisted(()=>({permission:vi.fn(),schema:vi.fn()}));
vi.mock('@/lib/finance/schema',()=>({assertFinanceSchemaReady:boundary.schema}));
vi.mock('@/lib/access-control/financial-authorization',()=>({requireFinancePermission:boundary.permission,enforceFinanceChecker:vi.fn()}));
import {issueProspectiveInvoice,issueInvoicesForWorker} from '@/lib/finance/issuance';
import {buildOrderFiscalSnapshot,quoteFiscalProduct,quoteFiscalShipping} from '@/lib/finance/order-fiscal-snapshot';
import {fingerprint} from '@/lib/finance/service';
import type {ApprovedFiscalPolicy} from '@/lib/finance/fiscal-policy';
import type {FinanceOrder,FiscalSnapshotV2} from '@/lib/finance/types';

const createdAt=new Date('2026-08-01T00:00:00.123Z'),paidAt=new Date('2026-08-01T00:01:00.456Z'),issuedAt=new Date('2026-08-02T00:00:00Z');
const shipping={name:'Synthetic buyer',phone:'+966500000000',addressLine:'Synthetic street',city:'Test city',postalCode:'12345',country:'SA' as const};
const policy:ApprovedFiscalPolicy={id:'7',requestId:'8',effectiveFrom:'2026-07-01',at:'2026-06-01T00:00:00.000Z',issuer:{name:'Synthetic issuer',address:'Synthetic issuer address',taxNumber:'300000000000003'},vatBps:1500,policyReference:'fixture-v2-policy',calculationPolicy:{version:2,priceBasis:'inclusive',itemScope:'uniform_catalog',shippingPriceBasis:'exclusive',shippingVatBps:0,discountTreatment:'none',rounding:'line_half_up',policyRollover:'hold_for_review',automationDelegateId:'71'}};
function fixture(){
 const original=buildOrderFiscalSnapshot(2n,createdAt,policy,shipping,[{...quoteFiscalProduct(policy,{key:'5',title:'Frozen item',quantity:3,unitPriceMinor:4}),supplierId:'6',supplierMinor:6},quoteFiscalShipping(policy,5)]);
 const source:FinanceOrder={id:'2',memberId:'9',customerName:shipping.name,status:'paid',createdAt:createdAt.toISOString(),paidAt:paidAt.toISOString(),subtotalMinor:12,shippingMinor:5,totalMinor:17,currency:'SAR',items:[{productId:'5',title:'Frozen item',quantity:3,unitMinor:4,totalMinor:12}],suppliers:[{supplierId:'6',supplierName:'Frozen supplier',productId:'5',amountMinor:6}]};
 const state={missing:false,closed:false,policyMismatch:false,receiptAmount:17,snapshot:structuredClone(original),source,savedHash:fingerprint(original),issued:null as FiscalSnapshotV2|null};
 const calls:{sql:string;values:unknown[]}[]=[];
 const query=vi.fn(async(sql:TemplateStringsArray,...values:unknown[])=>{
  const text=sql.join('?');calls.push({sql:text,values});
  if(text.includes('FROM finance_order_fiscal_snapshots'))return state.missing?[]:[{policy_id:7n,request_id:8n,captured_at:createdAt,fingerprint:state.savedHash,snapshot:state.snapshot}];
  if(text.includes('FROM finance_tax_policies'))return [{id:7n,request_id:8n,effective_from:'2026-07-01',issuer:policy.issuer,vat_bps:1500,policy_reference:policy.policyReference,created_at:new Date(policy.at),calculation_policy:policy.calculationPolicy,approved_payload:{...policy,vatBps:state.policyMismatch?500:1500}}];
  if(text.includes('FROM commerce_receipts'))return [{id:3n,order_id:2n,amount_minor:BigInt(state.receiptAmount),currency:'SAR',recorded_at:paidAt}];
  if(text.includes('FROM commerce_orders'))return [{id:2n,member_id:9n,status:'paid',currency:'SAR',created_at:createdAt,paid_at:paidAt,subtotal_minor:12,shipping_fee_minor:5,total_minor:17,shipping}];
  if(text.includes('FROM commerce_order_items'))return [{product_id:5n,title:'Frozen item',quantity:3,unit_price_minor:4,total_minor:12}];
  if(text.includes('FROM commerce_order_suppliers'))return [{supplier_id:6n,supplier_name:'Frozen supplier',product_id:5n,total_cost_minor:6}];
  if(text.includes('FROM finance_periods'))return [{closed_at:state.closed?issuedAt:null,checks_json:[],reason:'',version:0}];
  if(text.includes('FROM finance_sequences'))return [{next_value:1n}];
  if(text.includes('FROM finance_invoices'))return [{id:1n,status:state.issued?'issued':'pending_policy',number:state.issued?'INV-2026-00000001':null,snapshot:state.issued,source_snapshot:state.source,total_minor:17n,order_id:2n,receipt_id:3n,created_at:paidAt}];
  throw new Error('Unexpected test query '+text);
 });
 const execute=vi.fn(async(sql:TemplateStringsArray,...values:unknown[])=>{
  if(sql.join('?').startsWith("UPDATE finance_invoices SET status='issued'"))state.issued=JSON.parse(String(values[4]));
  return 1;
 });
 const tx={$queryRaw:query,$executeRaw:execute};
 const db={...tx,$transaction:async<T>(work:(value:typeof tx)=>Promise<T>)=>work(tx)};
 return {db,state,execute,calls};
}
beforeEach(()=>{vi.clearAllMocks();boundary.permission.mockResolvedValue(undefined);vi.unstubAllEnvs();});
const authority={actorId:71n,mode:'automation' as const};
describe('prospective trusted issuance adapter',()=>{
 it('builds the real document from saved source and exact receipt, including original address and shipping',async()=>{
  const f=fixture();expect(await issueProspectiveInvoice(f.db as never,3n,authority,issuedAt)).toBe('INV-2026-00000001');
  expect(f.state.issued).toMatchObject({version:2,netMinor:15,vatMinor:2,totalMinor:17,sourceOrderId:'2',sourceReceiptId:'3',orderSnapshotFingerprint:f.state.savedHash,customer:{name:shipping.name,address:'Synthetic street، Test city، 12345، SA'}});
  expect(f.state.issued?.lines[1]).toMatchObject({key:'shipping',grossMinor:5,vatMinor:0});
  expect(boundary.permission).toHaveBeenCalledWith(expect.anything(),71n,'invoices:create');
  const audit=f.execute.mock.calls.find(x=>String(x[0]).includes('finance_audit'))!;
  expect(audit).toBeDefined();expect(audit).toContain(71n);
  expect(audit.map(x=>String(x)).join(' ')).toContain('"execution":"automation"');
  expect(audit.map(x=>String(x)).join(' ')).toContain('"delegatedByPolicyId":"7"');
 });
 it('checks approval at order and original receipt timestamps with DATETIME(3) precision',async()=>{
  const f=fixture();await issueProspectiveInvoice(f.db as never,3n,authority,issuedAt);
  const calls=f.calls.filter(x=>x.sql.includes('FROM finance_tax_policies'));
  expect(calls.map(x=>x.values[1])).toEqual([createdAt,paidAt]);
  for(const call of calls)expect(call.sql).toContain("r.status='approved'");
 });
 it('retries without allocating another number or rewriting an issued snapshot',async()=>{
  const f=fixture();await issueProspectiveInvoice(f.db as never,3n,authority,issuedAt);const saved=structuredClone(f.state.issued);
  expect(await issueProspectiveInvoice(f.db as never,3n,authority,issuedAt)).toBe('INV-2026-00000001');
  expect(f.execute.mock.calls.filter(x=>String(x[0]).includes('UPDATE finance_sequences'))).toHaveLength(1);expect(f.state.issued).toEqual(saved);
 });
 it.each(['missing','closed','policyMismatch','receiptAmount','snapshot','source'] as const)('rejects %s without issuing',async mode=>{
  const f=fixture();
  if(mode==='receiptAmount')f.state.receiptAmount=16;
  else if(mode==='snapshot')f.state.snapshot.customer.name='Changed';
  else if(mode==='source')f.state.source.items[0].totalMinor=11;
  else f.state[mode]=true;
  await expect(issueProspectiveInvoice(f.db as never,3n,authority,issuedAt)).rejects.toThrow(/finance_/);
  expect(f.state.issued).toBeNull();expect(f.execute.mock.calls.some(x=>String(x[0]).includes('finance_sequences'))).toBe(false);
 });
 it('requires the currently authorized explicit delegate, never an implicit account',async()=>{
  const f=fixture();await expect(issueProspectiveInvoice(f.db as never,3n,{...authority,actorId:72n},issuedAt)).rejects.toThrow('finance_automation_delegate_mismatch');
  expect(f.execute).not.toHaveBeenCalled();
  boundary.permission.mockRejectedValueOnce(new Error('access_forbidden'));
  await expect(issueProspectiveInvoice(f.db as never,3n,authority,issuedAt)).rejects.toThrow('access_forbidden');expect(f.execute).not.toHaveBeenCalled();
 });
 it('keeps issuance auth separate from capture auth and rejects before any database access',async()=>{
  const db={$queryRaw:vi.fn(),$transaction:vi.fn()};
  await expect(issueInvoicesForWorker(db as never,'Bearer fixture')).rejects.toThrow('finance_issuance_not_configured');
  vi.stubEnv('FINANCE_CAPTURE_SECRET','c'.repeat(32));vi.stubEnv('FINANCE_ISSUANCE_SECRET','c'.repeat(32));
  await expect(issueInvoicesForWorker(db as never,'Bearer '+'c'.repeat(32))).rejects.toThrow('finance_issuance_not_configured');
  vi.stubEnv('FINANCE_ISSUANCE_SECRET','i'.repeat(32));
  await expect(issueInvoicesForWorker(db as never,'Bearer '+'c'.repeat(32))).rejects.toThrow('finance_issuance_unauthorized');
  expect(db.$queryRaw).not.toHaveBeenCalled();expect(db.$transaction).not.toHaveBeenCalled();
 });
});
