import {describe,expect,it,vi} from 'vitest';
import {validateFinanceChange} from '@/lib/finance/workflows';
import {validateCalculationPolicy} from '@/lib/finance/fiscal-v2';
import {readApprovedFiscalPolicy,type ApprovedFiscalPolicy} from '@/lib/finance/fiscal-policy';
import {buildOrderFiscalSnapshot,quoteFiscalProduct,quoteFiscalShipping,readOrderFiscalSnapshot} from '@/lib/finance/order-fiscal-snapshot';
import {fingerprint} from '@/lib/finance/service';

const now=new Date('2026-09-24T10:00:00Z');
const control={enabled:false,registrationConfirmed:false,registrationEffectiveFrom:null as string|null,registrationThresholdMinor:37500000};
const calculation={version:2 as const,priceBasis:'exclusive' as const,itemScope:'uniform_catalog' as const,shippingPriceBasis:'exclusive' as const,shippingVatBps:1500,discountTreatment:'none' as const,rounding:'line_half_up' as const,policyRollover:'hold_for_review' as const,automationDelegateId:'42',vatControl:control};
const payload={effectiveFrom:'2026-10-01',issuer:{name:'Synthetic non-VAT issuer',address:'Synthetic issuer address',taxNumber:''},vatBps:1500,policyReference:'synthetic-central-vat',calculationPolicy:calculation};
const input={kind:'tax_settings' as const,targetId:'tax',payload,reason:'Explicit operator-reviewed fiscal setting',requestKey:'central-vat-fixture'};
const shipping={name:'Synthetic buyer',phone:'+966500000000',addressLine:'Synthetic street',city:'Riyadh',postalCode:'12345',country:'SA' as const};
function policy(change:Partial<typeof control>={}):ApprovedFiscalPolicy{return {...payload,issuer:{...payload.issuer},id:'7',requestId:'8',at:'2026-09-20T00:00:00.000Z',calculationPolicy:{...calculation,vatControl:{...control,...change}}};}
function approvedDb(value:ApprovedFiscalPolicy){return {$queryRaw:vi.fn(async()=>[{id:7n,request_id:8n,effective_from:value.effectiveFrom,issuer:value.issuer,vat_bps:value.vatBps,policy_reference:value.policyReference,created_at:new Date(value.at),calculation_policy:value.calculationPolicy,approved_payload:value}])};}

describe('central approved VAT control',()=>{
 it('allows an explicit OFF policy with no invented registration number and preserves its configured rate',()=>{
  expect(validateFinanceChange(input,now).payload).toEqual(payload);
 });
 it('allows approval effective today in Riyadh but never backdates a change into yesterday',()=>{
  expect(()=>validateFinanceChange({...input,payload:{...payload,effectiveFrom:'2026-09-24'}},now)).not.toThrow();
  expect(()=>validateFinanceChange({...input,payload:{...payload,effectiveFrom:'2026-09-23'}},now)).toThrow('finance_tax_policy_invalid');
 });
 it('retains the explicit control when validating the calculation policy',()=>{
  expect(validateCalculationPolicy(calculation)).toEqual(calculation);
 });
 it.each(['inclusive','exclusive'] as const)('OFF applies no product or shipping VAT for %s catalog prices',basis=>{
  const active=policy();active.calculationPolicy.priceBasis=basis;active.calculationPolicy.shippingPriceBasis=basis;
  const product=quoteFiscalProduct(active,{key:'5',title:'Synthetic item',quantity:2,unitPriceMinor:1025}),delivery=quoteFiscalShipping(active,125);
  expect(product).toMatchObject({netMinor:2050,vatMinor:0,grossMinor:2050,vatBps:0});
  expect(delivery).toMatchObject({netMinor:125,vatMinor:0,grossMinor:125,vatBps:0});
  expect(buildOrderFiscalSnapshot(2n,new Date('2026-10-02'),active,shipping,[product,delivery])).toMatchObject({netMinor:2175,vatMinor:0,totalMinor:2175,policy:{calculationPolicy:{vatControl:{enabled:false}}}});
 });
 it('ON applies the configured central rate to product and shipping with exact halala rounding',()=>{
  const active=policy({enabled:true,registrationConfirmed:true,registrationEffectiveFrom:'2026-10-01'});active.issuer.taxNumber='300000000000003';
  expect(quoteFiscalProduct(active,{key:'5',title:'Synthetic item',quantity:2,unitPriceMinor:1025})).toMatchObject({netMinor:2050,vatMinor:308,grossMinor:2358});
  expect(quoteFiscalShipping(active,125)).toMatchObject({netMinor:125,vatMinor:19,grossMinor:144});
 });
 it.each([
  {enabled:true,registrationConfirmed:false,registrationEffectiveFrom:'2026-10-01'},
  {enabled:true,registrationConfirmed:true,registrationEffectiveFrom:null},
  {enabled:true,registrationConfirmed:true,registrationEffectiveFrom:'2026-10-02'},
  {enabled:true,registrationConfirmed:true,registrationEffectiveFrom:'2026-02-30'},
  {enabled:'true'},
  {registrationThresholdMinor:0},
  {registrationThresholdMinor:37500000.5},
 ])('rejects incomplete or invalid activation metadata %j',change=>{
  expect(()=>validateFinanceChange({...input,payload:{...payload,issuer:{...payload.issuer,taxNumber:'300000000000003'},calculationPolicy:{...calculation,vatControl:{...control,...change}}}},now)).toThrow(/finance_/);
 });
 it('requires an actual registration number for ON and rejects independent shipping rates in a new central policy',()=>{
  const enabled={...control,enabled:true,registrationConfirmed:true,registrationEffectiveFrom:'2026-10-01'};
  expect(()=>validateFinanceChange({...input,payload:{...payload,calculationPolicy:{...calculation,vatControl:enabled}}},now)).toThrow(/finance_/);
  expect(()=>validateFinanceChange({...input,payload:{...payload,calculationPolicy:{...calculation,shippingVatBps:500}}},now)).toThrow(/finance_/);
 });
 it('requires explicit control on new V2 requests but leaves historical calculation JSON unmodified',()=>{
  const {vatControl:_old,...legacy}=calculation;
  expect(validateCalculationPolicy(legacy)).toEqual(legacy);
  expect(()=>validateFinanceChange({...input,payload:{...payload,issuer:{...payload.issuer,taxNumber:'300000000000003'},calculationPolicy:legacy}},now)).toThrow(/finance_/);
 });
 it('reads approved OFF policy without a tax number and refuses absent activation state for new purchases',async()=>{
  const active=policy();expect(await readApprovedFiscalPolicy(approvedDb(active) as never,new Date('2026-10-02'))).toEqual(active);
  const {vatControl:_old,...legacy}=active.calculationPolicy;
  const old={...active,issuer:{...active.issuer,taxNumber:'300000000000003'},calculationPolicy:legacy};
  await expect(readApprovedFiscalPolicy(approvedDb(old) as never,new Date('2026-10-02'))).rejects.toThrow(/finance_/);
 });
 it('revalidates the immutable saved OFF rates and rejects a positive tax line even when totals and fingerprint are recomputed',async()=>{
  const active=policy(),at=new Date('2026-10-02');
  const snapshot=buildOrderFiscalSnapshot(2n,at,active,shipping,[quoteFiscalProduct(active,{key:'5',title:'Synthetic item',quantity:2,unitPriceMinor:1025}),quoteFiscalShipping(active,125)]);
  const row=()=>({policy_id:7n,request_id:8n,captured_at:at,fingerprint:fingerprint(snapshot),snapshot});
  const db={$queryRaw:vi.fn(async()=>[row()])};
  expect((await readOrderFiscalSnapshot(db as never,2n)).snapshot.vatMinor).toBe(0);
  snapshot.lines[0].vatBps=1500;snapshot.lines[0].vatMinor=308;snapshot.lines[0].grossMinor=2358;snapshot.vatMinor=308;snapshot.totalMinor=2483;
  await expect(readOrderFiscalSnapshot(db as never,2n)).rejects.toThrow('finance_calculation_policy_mismatch');
 });
});
