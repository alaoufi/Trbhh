/** Strict form parsing: never coerce blank, exponent, negative or repeated IDs. */
export function settlementSelection(values: FormDataEntryValue[]): string[] {
  if (!values.length || values.length > 20) throw Error('selection');
  const ids = values.map(value => {
    if (typeof value !== 'string' || !/^[1-9]\d{0,19}$/.test(value) || BigInt(value) > 18446744073709551615n) throw Error('selection');
    return value;
  });
  if (new Set(ids).size !== ids.length) throw Error('selection');
  return ids;
}
export function settlementWaitHours(value: FormDataEntryValue | null): number {
  if (typeof value !== 'string' || !/^\d{1,3}$/.test(value)) throw Error('wait');
  const hours = Number(value);
  if (hours < 1 || hours > 168) throw Error('wait');
  return hours;
}
export function settlementPaymentUrl(url: unknown, expires: unknown, now = Date.now()): string | null {
  if (typeof url !== 'string') return null;
  const time = expires instanceof Date ? expires.getTime() : typeof expires === 'string' ? Date.parse(expires) : NaN;
  if (!Number.isFinite(time) || time <= now) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'www.cjdropshipping.com' || parsed.port || parsed.username || parsed.password || parsed.pathname !== '/mine/payment' || parsed.hash) return null;
    const entries = [...parsed.searchParams.entries()];
    if (entries.length !== 1 || entries[0][0] !== 'pid' || !/^[A-Za-z0-9_-]{1,200}$/.test(entries[0][1])) return null;
    return parsed.href;
  } catch { return null; }
}
export function settlementExpectedAmount(value: FormDataEntryValue | null): number {
  if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value)) throw Error('amount');
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount > 2147483647) throw Error('amount');
  return amount;
}
