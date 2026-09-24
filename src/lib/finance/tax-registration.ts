import {checkedFinanceBigInt,checkedFinanceInteger,sumFinanceMoney} from './calculations';

/** One central default; an explicitly approved policy may override it. Never enables VAT. */
export const DEFAULT_REGISTRATION_THRESHOLD_MINOR=37500000;
export type TaxSupplyEvent={sourceKey:string;origin:'invoice'|'payment'|'order';kind:'supply'|'credit'|'reversal';classification:'standard'|'zero'|'exempt'|'out_of_scope'|'capital_asset';netMinor:number;at:string;isTest?:boolean;originalSourceKey?:string;reversesSourceKey?:string};
export type TaxRegistrationGap={code:string;label:string;count:number;amountMinor:number|null};
export type TaxRegistrationReport={
 updatedAt:string;window:{start:string;endInclusive:string};completedMonths:{start:string;endExclusive:string;totalMinor:number};
 thresholdMinor:number;confirmedTotalMinor:number;percentBps:number;remainingMinor:number;alert:'normal'|'70'|'85'|'95'|'100';
 confirmedSupplyCount:number;excludedTestCount:number;coverage:{complete:boolean;gaps:TaxRegistrationGap[]};
 forecast:{lowMinor:number;highMinor:number;monthsObserved:number;observedDays:number;projectedSoon:boolean}|null;
 forecastUnavailableReason:'coverage_incomplete'|'insufficient_history'|null;
};
const offset=3*3600000;
function time(value:string):number {const result=typeof value==='string'?Date.parse(value):NaN;if(!Number.isFinite(result))throw Error('tax_registration_date_invalid');return result;}
function localMonth(now:Date,months=0):number {const local=new Date(now.getTime()+offset);return Date.UTC(local.getUTCFullYear(),local.getUTCMonth()+months,1)-offset;}
function shiftedYear(now:Date,years:number):number {
 const local=new Date(now.getTime()+offset),year=local.getUTCFullYear()+years,month=local.getUTCMonth();
 const day=Math.min(local.getUTCDate(),new Date(Date.UTC(year,month+1,0)).getUTCDate());
 return Date.UTC(year,month,day,local.getUTCHours(),local.getUTCMinutes(),local.getUTCSeconds(),local.getUTCMilliseconds())-offset;
}
export function registrationThreshold(value:unknown=DEFAULT_REGISTRATION_THRESHOLD_MINOR):number {
 if(typeof value!=='number'||!Number.isSafeInteger(value)||value<=0)throw Error('tax_registration_threshold_invalid');return value;
}
/** Calendar arithmetic uses Asia/Riyadh's fixed UTC+3 offset, not365 days or calendar YTD. */
export function taxRegistrationWindow(now:Date){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error('tax_registration_date_invalid');
 return {start:new Date(shiftedYear(now,-1)).toISOString(),endInclusive:now.toISOString(),completedStart:new Date(localMonth(now,-12)).toISOString(),completedEnd:new Date(localMonth(now)).toISOString()};
}
/** Inputs are explicitly classified supplies; this function never classifies payments or GMV. */
export function calculateTaxRegistration(input:{now:Date;events:TaxSupplyEvent[];thresholdMinor?:number;gaps:TaxRegistrationGap[]}):TaxRegistrationReport {
 const {now}=input,window=taxRegistrationWindow(now),thresholdMinor=registrationThreshold(input.thresholdMinor),unique=new Map<string,TaxSupplyEvent>();
 for(const event of input.events){
  checkedFinanceInteger(event.netMinor);
  if(typeof event.sourceKey!=='string'||!event.sourceKey||event.sourceKey.length>191||!['invoice','payment','order'].includes(event.origin)||!['supply','credit','reversal'].includes(event.kind)||!['standard','zero','exempt','out_of_scope','capital_asset'].includes(event.classification))throw Error('tax_registration_source_invalid');
  const at=new Date(time(event.at)).toISOString();if(time(at)>now.getTime())continue;
  const normalized={...event,at},prior=unique.get(event.sourceKey);
  const signature=(e:TaxSupplyEvent)=>JSON.stringify([e.kind,e.classification,e.netMinor,e.at,!!e.isTest,e.originalSourceKey??null,e.reversesSourceKey??null]);
  if(prior&&signature(prior)!==signature(normalized))throw Error('tax_registration_source_conflict');
  if(!prior||event.origin==='invoice')unique.set(event.sourceKey,normalized);
 }
 const rank={supply:0,credit:1,reversal:2},events=[...unique.values()].sort((a,b)=>time(a.at)-time(b.at)||rank[a.kind]-rank[b.kind]);
 const supplies=new Map<string,TaxSupplyEvent>(),credited=new Map<string,number>(),credits=new Map<string,TaxSupplyEvent>(),reversed=new Set<string>();
 const movements:{at:number;amount:number;isSupply:boolean}[]=[];let excludedTestCount=0;
 for(const event of events){
  if(event.isTest){excludedTestCount++;continue;}
  if(event.kind==='supply')supplies.set(event.sourceKey,event);
  else{
   const source=supplies.get(event.originalSourceKey||'');
   if(!source||source.classification!==event.classification)throw Error('tax_registration_adjustment_invalid');
   const balance=credited.get(source.sourceKey)||0;
   if(event.kind==='credit'){
    const next=sumFinanceMoney([balance,event.netMinor]);if(next>source.netMinor)throw Error('tax_registration_adjustment_invalid');
    credited.set(source.sourceKey,next);credits.set(event.sourceKey,event);
   }else{
    const credit=credits.get(event.reversesSourceKey||'');
    if(!credit||credit.originalSourceKey!==source.sourceKey||credit.netMinor!==event.netMinor||reversed.has(credit.sourceKey)||event.netMinor>balance)throw Error('tax_registration_adjustment_invalid');
    reversed.add(credit.sourceKey);credited.set(source.sourceKey,balance-event.netMinor);
   }
  }
  if(['standard','zero'].includes(event.classification))movements.push({at:time(event.at),amount:event.netMinor*(event.kind==='credit'?-1:1),isSupply:event.kind==='supply'});
 }
 const total=(from:number,to:number,inclusive=false)=>sumFinanceMoney(movements.filter(x=>x.at>=from&&(inclusive?x.at<=to:x.at<to)).map(x=>x.amount));
 const confirmedTotalMinor=total(time(window.start),now.getTime(),true),positive=Math.max(0,confirmedTotalMinor);
 const percentBps=checkedFinanceBigInt(BigInt(positive)*10000n/BigInt(thresholdMinor));
 const alert:TaxRegistrationReport['alert']=percentBps>=10000?'100':percentBps>=9500?'95':percentBps>=8500?'85':percentBps>=7000?'70':'normal';
 const gaps=input.gaps.map(gap=>{checkedFinanceInteger(gap.count);if(gap.amountMinor!==null)checkedFinanceInteger(gap.amountMinor,true);return {...gap};});
 let forecast:TaxRegistrationReport['forecast']=null;
 const first=movements.find(x=>x.isSupply),complete=!gaps.length;
 const day=86400000,history=first?now.getTime()-first.at:0;
 if(complete&&first&&history>=30*day){
  const nextYear=BigInt(shiftedYear(now,1)-now.getTime());
  // Compare observed30/90-day rates; a young business uses only its actual observed history.
  const estimates=[30,90].map(days=>{
   const from=Math.max(first.at,now.getTime()-days*day),duration=BigInt(now.getTime()-from);
   const numerator=BigInt(Math.max(0,total(from,now.getTime(),true)))*nextYear;
   return checkedFinanceBigInt((numerator+duration/2n)/duration);
  });
  const older=first.at<localMonth(now,-5);
  if(older){
   estimates.push(checkedFinanceBigInt(BigInt(Math.max(0,total(localMonth(now,-6),localMonth(now))))*2n));
   estimates.push(checkedFinanceBigInt(BigInt(Math.max(0,total(localMonth(now,-3),localMonth(now))))*4n));
  }
  const highMinor=Math.max(...estimates);
  forecast={lowMinor:Math.min(...estimates),highMinor,monthsObserved:older?6:Math.floor(Math.min(history,90*day)/(30*day)),observedDays:Math.floor(Math.min(history,90*day)/day),projectedSoon:highMinor>=thresholdMinor};
 }
 return {updatedAt:now.toISOString(),window:{start:window.start,endInclusive:window.endInclusive},completedMonths:{start:window.completedStart,endExclusive:window.completedEnd,totalMinor:total(time(window.completedStart),time(window.completedEnd))},thresholdMinor,confirmedTotalMinor,percentBps,remainingMinor:Math.max(0,thresholdMinor-positive),alert,confirmedSupplyCount:movements.filter(x=>x.isSupply&&x.at>=time(window.start)).length,excludedTestCount,coverage:{complete,gaps},forecast,forecastUnavailableReason:forecast?null:complete?'insufficient_history':'coverage_incomplete'};
}
