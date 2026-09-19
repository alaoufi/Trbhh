/** Commerce amounts are nonnegative integer halalas, bounded by MySQL INT. */
export const MAX_MONEY_MINOR = 2147483647;
export function checkedMoney(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_MONEY_MINOR) throw new Error('invalid_money');
  return value;
}
export function parseSar(value: string): number {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(value)) throw new Error('invalid_money');
  const [whole, fraction = ''] = value.split('.');
  return checkedMoney(Number(whole) * 100 + Number(fraction.padEnd(2, '0')));
}
export function formatSar(value: number): string {
  checkedMoney(value);
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')}`;
}
export function lineTotal(unitMinor: number, quantity: number): number {
  checkedMoney(unitMinor);
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 10000) throw new Error('invalid_quantity');
  return checkedMoney(unitMinor * quantity);
}
export function sumMoney(values: readonly number[]): number {
  return values.reduce((total, value) => checkedMoney(total + checkedMoney(value)), 0);
}
