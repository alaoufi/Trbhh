import type {FiscalSnapshotV2,CalculatedFiscalLineV2,FinanceReturnPayload} from './types';
import {sumFinanceMoney} from './calculations';
import {fiscalTotalsV2,roundFiscalRatio} from './fiscal-v2';

export type PriorV2={kind:'credit_note'|'debit_note';snapshot:FiscalSnapshotV2};
export function buildReturnSnapshotV2(original:FiscalSnapshotV2,prior:PriorV2[],payload:FinanceReturnPayload):FiscalSnapshotV2 {
 if(!payload.lines.length||new Set(payload.lines.map(x=>x.key)).size!==payload.lines.length)throw new Error('finance_return_invalid');
 const lines=payload.lines.map(selection=>{
  const source=original.lines.find(x=>x.key===selection.key);
  if(!source||!Number.isSafeInteger(selection.quantity)||selection.quantity<1)throw new Error('finance_return_invalid');
  const credited=(field:'quantity'|'grossMinor'|'vatMinor'|'discountMinor'|'supplierMinor')=>sumFinanceMoney(prior.flatMap(note=>note.snapshot.lines.filter(x=>x.key===source.key).map(x=>(note.kind==='credit_note'?1:-1)*(x[field]??0))));
  const left=source.quantity-credited('quantity');
  if(selection.quantity>left||left<=0)throw new Error('finance_note_exceeds_original');
  const portion=(remaining:number)=>roundFiscalRatio(BigInt(remaining)*BigInt(selection.quantity),BigInt(left));
  const remainingGross=source.grossMinor-credited('grossMinor'),remainingVat=source.vatMinor-credited('vatMinor');
  const grossMinor=portion(remainingGross);
  // Allocate the saved VAT within the saved gross, never recalculate tax on a return.
  const vatMinor=remainingGross===0?0:roundFiscalRatio(BigInt(remainingVat)*BigInt(grossMinor),BigInt(remainingGross));
  const result:CalculatedFiscalLineV2={...source,quantity:selection.quantity,discountMinor:portion(source.discountMinor-credited('discountMinor')),grossMinor,vatMinor,netMinor:grossMinor-vatMinor};
  if(source.supplierMinor!==undefined)result.supplierMinor=portion(source.supplierMinor-credited('supplierMinor'));
  return result;
 });
 const totals=fiscalTotalsV2(lines);
 return {...original,...totals,paidMinor:totals.totalMinor,derivation:'source_allocation'};
}
