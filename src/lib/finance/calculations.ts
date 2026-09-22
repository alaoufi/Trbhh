import type {CalculatedFiscalLine, FiscalLine} from './types';

/** Report totals are not limited to an individual order's SQL INT column. */
export function checkedFinanceInteger(value:number, signed=false):number {
  if (!Number.isSafeInteger(value) || (!signed && value < 0)) throw new Error('Invalid finance integer');
  return value;
}

export function checkedFinanceBigInt(value:bigint):number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error('Finance amount overflow');
  return Number(value);
}

export function sumFinanceMoney(values:readonly number[]):number {
  return checkedFinanceBigInt(values.reduce((total,value)=>total+BigInt(checkedFinanceInteger(value,true)),0n));
}

export function calculateFiscalLines(lines: FiscalLine[]): {lines:CalculatedFiscalLine[];netMinor:number;vatMinor:number;totalMinor:number} {
  const calculated = lines.map(line=>{
    const quantity=checkedFinanceInteger(line.quantity);
    if (quantity === 0) throw new Error('Invalid quantity');
    const unit=checkedFinanceInteger(line.unitNetMinor);
    const discount=checkedFinanceInteger(line.discountMinor);
    const rate=checkedFinanceInteger(line.vatBps);
    if (rate > 10000) throw new Error('Invalid VAT basis points');
    if (line.supplierMinor !== undefined) checkedFinanceInteger(line.supplierMinor);
    const net=BigInt(quantity)*BigInt(unit)-BigInt(discount);
    if (net < 0n) throw new Error('Discount exceeds line amount');
    // Positive integer arithmetic: half a halala always rounds upward, per line.
    const vat=(net*BigInt(rate)+5000n)/10000n;
    return {...line,netMinor:checkedFinanceBigInt(net),vatMinor:checkedFinanceBigInt(vat),grossMinor:checkedFinanceBigInt(net+vat)};
  });
  return {lines:calculated,netMinor:sumFinanceMoney(calculated.map(x=>x.netMinor)),vatMinor:sumFinanceMoney(calculated.map(x=>x.vatMinor)),totalMinor:sumFinanceMoney(calculated.map(x=>x.grossMinor))};
}

export function formatFinanceMoney(minor:number):string {
  const value=BigInt(checkedFinanceInteger(minor,true));
  const absolute=value<0n?-value:value;
  const whole=(absolute/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,',');
  return `${value<0n?'−':''}${whole}.${(absolute%100n).toString().padStart(2,'0')} ر.س`;
}
