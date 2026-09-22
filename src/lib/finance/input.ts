import { checkedFinanceBigInt } from './calculations';
/** Exact decimal parsing: no floating point multiplication or silent rounding. */
export function parseFinanceSar(value:string):number {
  if(!/^(0|[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(value))throw new Error('finance_amount_invalid');
  const [major,minor='']=value.split('.');
  return checkedFinanceBigInt(BigInt(major)*100n+BigInt(minor.padEnd(2,'0')));
}
export function financeField(form:FormData,name:string):string {
  const value=form.get(name);
  if(typeof value!=='string')throw new Error('finance_input_invalid');
  return value.trim();
}
export function publicFinanceError(error:unknown):string {
  const value=error instanceof Error?error.message:'';
  return /^finance_[a-z_]{1,60}$/.test(value)?value:'finance_action_failed';
}
