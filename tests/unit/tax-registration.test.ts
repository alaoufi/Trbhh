import {describe,expect,it} from 'vitest';
import {calculateTaxRegistration,DEFAULT_REGISTRATION_THRESHOLD_MINOR,type TaxSupplyEvent} from '@/lib/finance/tax-registration';

const now=new Date('2026-09-24T10:00:00.000Z');
function sale(sourceKey:string,netMinor:number,at='2026-09-24T09:00:00.000Z',extra:Partial<TaxSupplyEvent>={}):TaxSupplyEvent{return {sourceKey,origin:'invoice',kind:'supply',classification:'standard',netMinor,at,...extra};}
const report=(events:TaxSupplyEvent[],extra:Record<string,unknown>={})=>calculateTaxRegistration({now,events,thresholdMinor:10000,gaps:[],...extra});

describe('tax registration rolling calendar monitor',()=>{
 it('exports one exact default in halalas',()=>expect(DEFAULT_REGISTRATION_THRESHOLD_MINOR).toBe(37500000));
 it('includes today and excludes future or older than12 calendar months without using calendar YTD',()=>{
  const result=report([sale('old',9000,'2025-09-24T09:59:59Z'),sale('boundary',1000,'2025-09-24T10:00:00Z'),sale('last-year',2000,'2025-12-10T00:00:00Z'),sale('today',3000),sale('future',9000,'2026-09-24T10:00:01Z')]);
  expect(result.confirmedTotalMinor).toBe(6000);expect(result.window.start).toBe('2025-09-24T10:00:00.000Z');expect(result.remainingMinor).toBe(4000);
 });
 it('clamps the leap-day boundary to the same local calendar time in February',()=>{
  const result=calculateTaxRegistration({now:new Date('2024-02-29T21:30:00Z'),events:[],gaps:[]});
  expect(result.window.start).toBe('2023-02-28T21:30:00.000Z');
  const leap=calculateTaxRegistration({now:new Date('2024-02-29T10:00:00Z'),events:[],gaps:[]});
  expect(leap.window.start).toBe('2023-02-28T10:00:00.000Z');
 });
 it('also reports twelve completed Riyadh calendar months',()=>{
  const result=report([sale('prior-month',400,'2026-08-31T20:59:59Z'),sale('current-month',500,'2026-08-31T21:00:00Z')]);
  expect(result.completedMonths).toMatchObject({start:'2025-08-31T21:00:00.000Z',endExclusive:'2026-08-31T21:00:00.000Z',totalMinor:400});
  expect(result.confirmedTotalMinor).toBe(900);
 });
 it.each([['standard',true],['zero',true],['exempt',false],['out_of_scope',false],['capital_asset',false]] as const)('handles explicit %s classification without inferring exemption from zero VAT',(classification,included)=>{
  expect(report([sale('source',100,now.toISOString(),{classification})]).confirmedTotalMinor).toBe(included?100:0);
 });
 it('excludes explicit test events',()=>expect(report([sale('test',1000,now.toISOString(),{isTest:true})]).confirmedTotalMinor).toBe(0));
 it('counts a supply once across order payment and invoice projections',()=>{
  const source=sale('order:1',1234);expect(report([source,{...source,origin:'payment'},{...source,origin:'order'}]).confirmedTotalMinor).toBe(1234);
 });
 it('refuses conflicting duplicate source amounts',()=>expect(()=>report([sale('order:1',100),sale('order:1',101)])).toThrow('tax_registration_source_conflict'));
 it('applies a linked partial credit and full prior-credit reversal once at their own dates',()=>{
  const source=sale('sale:1',1000,'2026-08-01T00:00:00Z');
  const credit=sale('credit:1',300,'2026-08-02T00:00:00Z',{kind:'credit',originalSourceKey:'sale:1'});
  const reversal=sale('reversal:1',300,'2026-08-03T00:00:00Z',{kind:'reversal',originalSourceKey:'sale:1',reversesSourceKey:'credit:1'});
  expect(report([source,credit]).confirmedTotalMinor).toBe(700);expect(report([source,credit,reversal,reversal]).confirmedTotalMinor).toBe(1000);
 });
 it('keeps a current credit against a supply outside the rolling window instead of changing the original date',()=>{
  const result=report([sale('old',500,'2025-08-01T00:00:00Z'),sale('credit',200,'2026-09-01T00:00:00Z',{kind:'credit',originalSourceKey:'old'})]);
  expect(result.confirmedTotalMinor).toBe(-200);expect(result.percentBps).toBe(0);expect(result.remainingMinor).toBe(10000);
 });
 it.each(['missing','excess','double-reversal'])('rejects %s credit linkage',(scenario)=>{
  const source=sale('sale',1000,'2026-08-01T00:00:00Z'),credit=sale('credit',300,'2026-08-02T00:00:00Z',{kind:'credit',originalSourceKey:'sale'});
  const events=scenario==='missing'?[credit]:scenario==='excess'?[source,{...credit,netMinor:1001}]:[source,credit,sale('r1',300,'2026-08-03T00:00:00Z',{kind:'reversal',originalSourceKey:'sale',reversesSourceKey:'credit'}),sale('r2',300,'2026-08-04T00:00:00Z',{kind:'reversal',originalSourceKey:'sale',reversesSourceKey:'credit'})];
  expect(()=>report(events)).toThrow('tax_registration_adjustment_invalid');
 });
 it.each([[6999,'normal'],[7000,'70'],[8499,'70'],[8500,'85'],[9500,'95'],[10000,'100'],[12000,'100']] as const)('uses exact alert boundary for %s',(amount,level)=>{
  const result=report([sale('sale',amount)]);expect(result.alert).toBe(level);expect(result.remainingMinor).toBe(Math.max(0,10000-amount));
 });
 it('keeps integer precision and rejects unsafe totals/thresholds',()=>{
  expect(report([sale('tiny',1)],{thresholdMinor:3}).percentBps).toBe(3333);
  expect(()=>report([sale('large',Number.MAX_SAFE_INTEGER),sale('extra',1)])).toThrow();
  expect(()=>report([],{thresholdMinor:0})).toThrow();expect(()=>report([sale('fraction',0.1)])).toThrow();
 });
 it('does not infer a safe forecast from partial coverage or inadequate observation history',()=>{
  expect(report([sale('today',100)]).forecast).toBeNull();
  expect(report([sale('older',100,'2026-01-01T00:00:00Z')],{gaps:[{code:'pending',label:'Pending',count:1,amountMinor:100}]}).forecast).toBeNull();
 });
 it('produces a labelled next12-month estimate range from recent3 and6 completed months',()=>{
  const events=Array.from({length:6},(_,i)=>sale('m'+i,(i+1)*100,'2026-'+String(i+3).padStart(2,'0')+'-10T00:00:00Z'));
  const result=report(events,{thresholdMinor:5500});
  expect(result.forecast).toMatchObject({lowMinor:0,highMinor:6000,monthsObserved:6,projectedSoon:true});
 });
 it('flags a new rapid-growth business after30days of confirmed history',()=>{
  const result=report([sale('first',10000000,'2026-08-01T00:00:00Z'),sale('new',10000000,'2026-09-23T00:00:00Z')],{thresholdMinor:37500000});
  expect(result.forecast?.projectedSoon).toBe(true);expect(result.forecast!.lowMinor).toBeGreaterThan(37500000);expect(result.forecast!.highMinor).toBeGreaterThanOrEqual(result.forecast!.lowMinor);
 });
 it('includes current-month sales in the recent sales-velocity estimate',()=>{
  const older=Array.from({length:6},(_,i)=>sale('m'+i,100,'2026-'+String(i+3).padStart(2,'0')+'-10T00:00:00Z'));
  const prior=report(older,{thresholdMinor:20000}),current=report([...older,sale('today',2000)],{thresholdMinor:20000});
  expect(prior.forecast?.projectedSoon).toBe(false);expect(current.forecast?.projectedSoon).toBe(true);expect(current.forecast!.highMinor).toBeGreaterThan(prior.forecast!.highMinor);
 });
 it('states why a forecast is unavailable for short or incomplete history',()=>{
  expect(report([sale('young',10000,'2026-09-01T00:00:00Z')]).forecastUnavailableReason).toBe('insufficient_history');
  expect(report([sale('older',10000,'2026-08-01T00:00:00Z')],{gaps:[{code:'unknown',label:'Review',count:1,amountMinor:1}]}).forecastUnavailableReason).toBe('coverage_incomplete');
 });
 it('never returns VAT activation instructions or treats100% as automatic registration',()=>{
  const result=report([sale('large',20000)]);expect(result).not.toHaveProperty('enableVat');expect(result).not.toHaveProperty('registrationConfirmed');
 });
});
