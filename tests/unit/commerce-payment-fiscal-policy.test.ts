import {beforeEach,describe,expect,it,vi} from 'vitest';
const boundary=vi.hoisted(()=>({fiscal:vi.fn()}));
vi.mock('@/lib/commerce/schema',()=>({assertCommerceSchemaReady:vi.fn()}));
vi.mock('@/lib/finance/order-fiscal-snapshot',async importOriginal=>({...await importOriginal<object>(),requireOrderFiscalPolicyAtPayment:boundary.fiscal}));
import {claimPaymentAttempt} from '@/lib/commerce/orders';
const clock=new Date('2026-09-24T12:00:00.123Z');
function fixture(){
 const row={id:2n,order_id:1n,provider:'fixture',provider_ref:'known-reference',redirect_url:'https://fixture.invalid/existing-payment',merchant_order_id:'known-merchant-order',claim_token:'original-claim',amount_minor:11500,currency:'SAR',status:'pending'};
 const execute=vi.fn();const query=vi.fn(async(sql:TemplateStringsArray)=>{
  const text=sql.join('?');if(text.includes('FROM commerce_orders'))return [{id:1n,status:'awaiting_payment'}];
  if(text.includes('FROM commerce_payment_attempts'))return [row];
  if(text.includes('UTC_TIMESTAMP'))return [{now:clock}];throw new Error('Unexpected fixture query');
 });
 const tx={$queryRaw:query,$executeRaw:execute};return {row,execute,db:{$transaction:async<T>(run:(client:typeof tx)=>Promise<T>)=>run(tx)}};
}
beforeEach(()=>{vi.clearAllMocks();boundary.fiscal.mockResolvedValue(undefined);});
describe('saved payment URL fiscal authority',()=>{
 it('rechecks the approved immutable quote before returning an existing payment link',async()=>{
  const f=fixture(),result=await claimPaymentAttempt(f.db as never,{memberId:9n,orderId:1n,provider:'fixture'});
  expect(result.claimed).toBe(false);expect(result.attempt.redirectUrl).toBe(f.row.redirect_url);
  expect(boundary.fiscal).toHaveBeenCalledWith(expect.anything(),1n,clock);expect(f.execute).not.toHaveBeenCalled();
 });
 it.each(['finance_order_snapshot_missing','finance_policy_changed_before_payment','finance_schema_not_ready'])('withholds a payable link on %s while preserving original attempt evidence',async error=>{
  const f=fixture(),before=structuredClone(f.row);boundary.fiscal.mockRejectedValueOnce(new Error(error));
  const result=await claimPaymentAttempt(f.db as never,{memberId:9n,orderId:1n,provider:'fixture'});
  expect(result).toMatchObject({claimed:false,attempt:{id:2n,reference:'known-reference',amountMinor:11500,redirectUrl:null}});
  expect(f.row).toEqual(before);expect(f.execute).not.toHaveBeenCalled();
 });
});
