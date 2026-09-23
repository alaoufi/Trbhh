import type {CalculatedFiscalLineV2,FiscalCalculationPolicy,FiscalLineV2} from './types';
import {checkedFinanceBigInt,checkedFinanceInteger,sumFinanceMoney} from './calculations';

export function validateCalculationPolicy(value:unknown):FiscalCalculationPolicy {
 const p=value as FiscalCalculationPolicy;
 if(!p||typeof p!=='object'||Array.isArray(p)||p.version!==2||!['inclusive','exclusive'].includes(p.priceBasis)||p.itemScope!=='uniform_catalog'||!['inclusive','exclusive'].includes(p.shippingPriceBasis)||!Number.isSafeInteger(p.shippingVatBps)||p.shippingVatBps<0||p.shippingVatBps>10000||!['none','before_tax'].includes(p.discountTreatment)||p.rounding!=='line_half_up'||p.policyRollover!=='hold_for_review'||typeof p.automationDelegateId!=='string'||! /^[1-9]\d{0,14}$/.test(p.automationDelegateId))throw new Error('finance_calculation_policy_invalid');
 return {version:2,priceBasis:p.priceBasis,itemScope:p.itemScope,shippingPriceBasis:p.shippingPriceBasis,shippingVatBps:p.shippingVatBps,discountTreatment:p.discountTreatment,rounding:p.rounding,policyRollover:p.policyRollover,automationDelegateId:p.automationDelegateId};
}

/** Positive integer rational rounding; the approved mode is explicitly per-line half-up. */
export function roundFiscalRatio(numerator:bigint,denominator:bigint):number {
 if(numerator<0n||denominator<=0n)throw new Error('finance_ratio_invalid');
 return checkedFinanceBigInt((2n*numerator+denominator)/(2n*denominator));
}
export function fiscalTotalsV2(lines:CalculatedFiscalLineV2[]){
 return {lines,netMinor:sumFinanceMoney(lines.map(x=>x.netMinor)),vatMinor:sumFinanceMoney(lines.map(x=>x.vatMinor)),totalMinor:sumFinanceMoney(lines.map(x=>x.grossMinor))};
}
/** Prices and discounts retain their approved basis; inclusive prices are never inverted through V1. */
export function calculateFiscalLinesV2(input:readonly FiscalLineV2[]){
 if(!input.length||input.length>201||new Set(input.map(x=>x.key)).size!==input.length)throw new Error('finance_fiscal_lines_invalid');
 const lines=input.map(line=>{
  const quantity=checkedFinanceInteger(line.quantity),unit=checkedFinanceInteger(line.unitPriceMinor),discount=checkedFinanceInteger(line.discountMinor),rate=checkedFinanceInteger(line.vatBps);
  if(!quantity||quantity>10000||rate>10000||typeof line.key!=='string'||!line.key||line.key.length>80||typeof line.title!=='string'||!line.title.trim()||!['inclusive','exclusive'].includes(line.priceBasis)||!['product','shipping'].includes(line.component)||(line.component==='shipping')!==(line.key==='shipping')||(line.component==='shipping'&&quantity!==1))throw new Error('finance_fiscal_lines_invalid');
  if(line.supplierMinor!==undefined)checkedFinanceInteger(line.supplierMinor);
  if((line.supplierId===undefined)!==(line.supplierMinor===undefined)||(line.supplierId!==undefined&&!/^[1-9]\d{0,14}$/.test(line.supplierId))||(line.component==='shipping'&&line.supplierId!==undefined))throw new Error('finance_supplier_snapshot_difference');
  const base=BigInt(quantity)*BigInt(unit)-BigInt(discount);
  if(base<0n)throw new Error('finance_discount_exceeds_line');
  checkedFinanceBigInt(base);
  const vatMinor=roundFiscalRatio(base*BigInt(rate),BigInt(line.priceBasis==='inclusive'?10000+rate:10000));
  const netMinor=line.priceBasis==='inclusive'?checkedFinanceBigInt(base-BigInt(vatMinor)):checkedFinanceBigInt(base);
  const grossMinor=checkedFinanceBigInt(BigInt(netMinor)+BigInt(vatMinor));
  return {...line,netMinor,vatMinor,grossMinor};
 });
 return fiscalTotalsV2(lines);
}
