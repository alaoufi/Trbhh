import {beforeEach,describe,expect,it,vi} from 'vitest';
const db=vi.hoisted(()=>({query:vi.fn(),write:vi.fn(),transaction:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:{$queryRaw:db.query,$executeRaw:db.write,$transaction:db.transaction}}));
// Quote integrity has its own integration suite. Isolate persistence from that
// parser while retaining the complete worker commitment in the stored fixture.
vi.mock('@/lib/cj/fulfillment/commitment',()=>({validateAndTransformLiveCjQuoteToCommitment:(value:unknown)=>value}));
import {fulfillmentStore} from '@/lib/cj/fulfillment/store';
import {runFulfillment,type Commitment,type FulfillmentProvider,type FulfillmentRecord} from '@/lib/cj/fulfillment/worker';

const commitment:Commitment={supplierReference:'review-order-7',supplierUsdMinor:1000,originAreaId:'1',originCountry:'CN',logisticName:'CJPacket',destination:{country:'SA',name:'Buyer',phone:'+966500000000',region:'Riyadh',city:'Riyadh',address1:'Street، الرمز البريدي 12345',address2:'',postalCode:'12345'},lines:[{pid:'P',vid:'V',quantity:1}]};
type StoredRow={id:bigint;commerce_order_id:bigint;version:number;status:FulfillmentRecord['status'];quote_json:Commitment;supplier_reference:string;cj_order_id:string|null;evidence_json:unknown;last_error:string|null};
type Notice={event:string;recipient:string;payload:Record<string,unknown>};
type State={row:StoredRow;order:{id:bigint;member_id:bigint;status:string;currency:string;total_minor:number;fulfillment_status:string};receipt:{amount_minor:number;currency:string};notices:Notice[];audits:{event:string;payload:Record<string,unknown>}[]};
type Call={sql:string;values:unknown[];transaction:boolean};
type Tx={$queryRaw:(sql:TemplateStringsArray,...values:unknown[])=>Promise<unknown>;$executeRaw:(sql:TemplateStringsArray,...values:unknown[])=>Promise<number>};
function fixture(){
 let state:State={row:{id:7n,commerce_order_id:3n,version:4,status:'created',quote_json:commitment,supplier_reference:commitment.supplierReference,cj_order_id:'CJ1',evidence_json:{createAcknowledgement:{requestHash:'request-hash',requestPayload:{payType:3},orderId:'CJ1',reference:commitment.supplierReference,response:{orderId:'CJ1'}}},last_error:null},order:{id:3n,member_id:2n,status:'paid',currency:'SAR',total_minor:5000,fulfillment_status:'offline_pending'},receipt:{amount_minor:5000,currency:'SAR'},notices:[],audits:[]};
 const calls:Call[]=[];let failNotice=false,loseCas=false;let queue:Promise<unknown>=Promise.resolve();
 const query=async(draft:State,transaction:boolean,parts:TemplateStringsArray,values:unknown[])=>{
  const sql=parts.join('?');calls.push({sql,values,transaction});
  if(sql.includes('SELECT commerce_order_id FROM commerce_cj_fulfillment_outbox'))return [{commerce_order_id:draft.row.commerce_order_id}];
  if(sql.includes('SELECT f.*'))return [{...structuredClone(draft.row),paid_verified:BigInt(draft.receipt.amount_minor===draft.order.total_minor&&draft.receipt.currency==='SAR'?1:0)}];
  if(sql.includes('FROM commerce_orders'))return [structuredClone(draft.order)];
  throw Error('unhandled_query:'+sql);
 };
 const write=async(draft:State,transaction:boolean,parts:TemplateStringsArray,values:unknown[])=>{
  const sql=parts.join('?');calls.push({sql,values,transaction});
  if(sql.startsWith('UPDATE commerce_cj_fulfillment_outbox SET')){
   if(loseCas||draft.row.version!==values.at(-1))return 0;
   draft.row={...draft.row,version:draft.row.version+1,status:values[0] as StoredRow['status'],cj_order_id:values[1] as string|null,evidence_json:JSON.parse(String(values[5])),last_error:values[6] as string|null};return 1;
  }
  if(sql.startsWith('UPDATE commerce_orders SET fulfillment_status')){
   if(draft.order.status!=='paid'||draft.order.fulfillment_status==='completed')return 0;
   draft.order.fulfillment_status='action_required';return 1;
  }
  if(sql.startsWith('INSERT INTO commerce_notifications')){
   if(failNotice)throw Error('notice_write_failed');
   const notice={event:String(values[1]),recipient:String(values[2]),payload:JSON.parse(String(values[3]))};
   if(!draft.notices.some(row=>row.event===notice.event&&row.recipient===notice.recipient))draft.notices.push(notice);
   else if(!sql.includes('ON DUPLICATE KEY UPDATE id=id'))throw Error('duplicate_notice');
   return 1;
  }
  if(sql.startsWith('INSERT INTO commerce_audit_events')){
   const audit={event:String(values[1]),payload:JSON.parse(String(values[2]))};
   if(!draft.audits.some(row=>row.event===audit.event))draft.audits.push(audit);
   else if(!sql.includes('ON DUPLICATE KEY UPDATE id=id'))throw Error('duplicate_audit');
   return 1;
  }
  throw Error('unhandled_write:'+sql);
 };
 db.query.mockImplementation((parts,...values)=>query(state,false,parts,values));
 db.write.mockImplementation((parts,...values)=>write(state,false,parts,values));
 db.transaction.mockImplementation((run:(tx:Tx)=>Promise<unknown>)=>{
  const result=queue.then(async()=>{const draft=structuredClone(state);const output=await run({$queryRaw:(parts,...values)=>query(draft,true,parts,values),$executeRaw:(parts,...values)=>write(draft,true,parts,values)});state=draft;return output;});
  queue=result.catch(()=>undefined);return result;
 });
 return {state:()=>state,calls,failNotice:()=>{failNotice=true;},loseCas:()=>{loseCas=true;}};
}
beforeEach(()=>vi.clearAllMocks());
describe('durable customer-visible CJ fulfillment holds',()=>{
 it.each(['blocked','parent_uncertain'] as const)('atomically exposes %s without changing bank payment',async status=>{
  const f=fixture(),receipt=structuredClone(f.state().receipt),ack=(f.state().row.evidence_json as Record<string,unknown>).createAcknowledgement;
  expect(await fulfillmentStore.cas('7',4,{status,lastError:'parent_outcome_unknown'})).toBe(true);
  expect(f.state().row).toMatchObject({status,version:5});
  expect(f.state().order).toMatchObject({status:'paid',fulfillment_status:'action_required'});
  expect(f.state().receipt).toEqual(receipt);
  expect((f.state().row.evidence_json as Record<string,unknown>).createAcknowledgement).toEqual(ack);
  expect(f.state().notices).toHaveLength(1);expect(f.state().audits).toHaveLength(1);
  expect(f.state().notices[0]).toMatchObject({recipient:'member:2',payload:{orderId:'3',fulfillmentStatus:'action_required',source:'cj',supplierStatus:status}});
  expect(f.calls.filter(c=>/^(UPDATE|INSERT)/.test(c.sql)).every(c=>c.transaction)).toBe(true);
  const orderLock=f.calls.findIndex(c=>c.sql.includes('FROM commerce_orders')&&c.sql.includes('FOR UPDATE'));
  const outboxWrite=f.calls.findIndex(c=>c.sql.startsWith('UPDATE commerce_cj_fulfillment_outbox'));
  expect(orderLock).toBeGreaterThanOrEqual(0);expect(orderLock).toBeLessThan(outboxWrite);
 });
 it('allows one concurrent CAS owner and creates one notice',async()=>{
  const f=fixture();const results=await Promise.all([fulfillmentStore.cas('7',4,{status:'blocked',lastError:'payable_mismatch'}),fulfillmentStore.cas('7',4,{status:'blocked',lastError:'payable_mismatch'})]);
  expect(results.sort()).toEqual([false,true]);expect(f.state().row.version).toBe(5);expect(f.state().notices).toHaveLength(1);
 });
 it('deduplicates an already surfaced hold on a later version',async()=>{
  const f=fixture();await fulfillmentStore.cas('7',4,{status:'parent_uncertain',lastError:'parent_outcome_unknown'});await fulfillmentStore.cas('7',5,{status:'parent_uncertain',lastError:'parent_outcome_unknown'});
  expect(f.state().notices).toHaveLength(1);expect(f.state().audits).toHaveLength(1);expect(f.state().notices[0].event.length).toBeLessThanOrEqual(40);
 });
 it('rolls back the CAS and order state if the hold notice cannot be persisted',async()=>{
  const f=fixture(),before=structuredClone(f.state());f.failNotice();
  await expect(fulfillmentStore.cas('7',4,{status:'blocked',lastError:'payable_mismatch'})).rejects.toThrow('notice_write_failed');
  expect(f.state()).toEqual(before);
 });
 it('does not surface a hold after a failed CAS',async()=>{
  const f=fixture();f.loseCas();expect(await fulfillmentStore.cas('7',4,{status:'blocked',lastError:'payable_mismatch'})).toBe(false);
  expect(f.state().order.fulfillment_status).toBe('offline_pending');expect(f.state().notices).toHaveLength(0);
 });
 it.each(['unpaid','wrong_receipt','completed'])('preserves financial or terminal state for %s',async scenario=>{
  const f=fixture();if(scenario==='unpaid')f.state().order.status='awaiting_payment';if(scenario==='wrong_receipt')f.state().receipt.amount_minor=4999;if(scenario==='completed')f.state().order.fulfillment_status='completed';
  const before=structuredClone(f.state().order);await fulfillmentStore.cas('7',4,{status:'blocked',lastError:'payable_mismatch'});
  expect(f.state().order).toEqual(before);expect(f.state().notices).toHaveLength(0);
  if(scenario!=='completed')expect(f.state().row.version).toBe(4);
 });
 it('keeps ordinary progress free of false action-required notices',async()=>{
  const f=fixture();await fulfillmentStore.cas('7',4,{status:'parent_claimed'});
  expect(f.state().order.fulfillment_status).toBe('offline_pending');expect(f.state().notices).toHaveLength(0);
 });
 it.each(['blocked','parent_uncertain'] as const)('does not resume supplier mutations after persisting %s',async status=>{
  const f=fixture();await fulfillmentStore.cas('7',4,{status,lastError:'parent_outcome_unknown'});
  const proof={...commitment,orderId:'CJ1',reference:commitment.supplierReference,payableUsdMinor:1000,paymentDate:null,cjOrderCode:'SD1'};
  const provider:FulfillmentProvider={createUnpaid:vi.fn(),findByReference:vi.fn(),detail:vi.fn(async()=>proof),preparePayment:vi.fn(),balance:vi.fn(),debit:vi.fn(),billing:vi.fn()};
  await runFulfillment('7',fulfillmentStore,provider);
  expect(provider.createUnpaid).not.toHaveBeenCalled();expect(provider.preparePayment).not.toHaveBeenCalled();expect(provider.debit).not.toHaveBeenCalled();expect(f.state().order.status).toBe('paid');
 });
});

describe('CJ acknowledgement and payment notices',()=>{
it('persists a supplier registration notice without claiming paid or reserved',async()=>{const f=fixture();const payment={payId:'PAY1',shipmentOrderId:'SD1',expiresAt:Date.now()+60000,payableUsdMinor:1000};expect(await fulfillmentStore.cas('7',4,{status:'payment_ready',payment})).toBe(true);expect(f.state().notices).toHaveLength(1);expect(f.state().notices[0].payload).toMatchObject({source:'cj',stage:'registered',supplierPaymentVerified:false,cjOrderId:'CJ1'});expect(f.state().notices[0].event.length).toBeLessThanOrEqual(40);await fulfillmentStore.cas('7',5,{status:'payment_ready',payment});expect(f.state().notices).toHaveLength(1);});
it('records confirmed supplier payment once without changing the bank receipt',async()=>{const f=fixture(),receipt=structuredClone(f.state().receipt);await fulfillmentStore.cas('7',4,{status:'supplier_paid',evidence:{method:'card',order:{paymentDate:'confirmed'}}});expect(f.state().notices[0].payload).toMatchObject({stage:'supplier_paid',supplierPaymentVerified:true});expect(f.state().receipt).toEqual(receipt);expect(f.state().notices[0].event).toBe('ship:cj:paid:7');});
it('cannot publish supplier progress without a matching customer receipt',async()=>{const f=fixture();f.state().receipt.amount_minor=1;expect(await fulfillmentStore.cas('7',4,{status:'supplier_paid',evidence:{}})).toBe(false);expect(f.state().notices).toHaveLength(0);});
});
