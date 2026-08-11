/** Exact SAR money helpers. Amounts are always stored and calculated as halalas. */

function normalizeDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace('٫', '.');
}

/** Parses a positive SAR decimal string into integer halalas without floats. */
export function parseSarToHalalas(raw: string): number | null {
  const match = normalizeDigits(raw).trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] || '').padEnd(2, '0'));
  if (!Number.isSafeInteger(whole) || whole > Math.floor((Number.MAX_SAFE_INTEGER - fraction) / 100)) return null;
  return whole * 100 + fraction;
}

/** Formats an integer halala amount as a fixed two-decimal SAR value. */
export function formatHalalas(amount: number): string {
  if (!Number.isSafeInteger(amount)) return '0.00';
  const sign = amount < 0 ? '-' : '';
  const absolute = Math.abs(amount);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
}

/** Prorates the unused period exactly and rounds up one halala in the member's favour. */
export function refundableHalalas(amount: number, startsAt: Date, endsAt: Date, cancelledAt: Date): number {
  const totalMs = endsAt.getTime() - startsAt.getTime();
  if (!Number.isSafeInteger(amount) || amount <= 0 || !Number.isSafeInteger(totalMs) || totalMs <= 0) return 0;
  const remainingMs = Math.min(totalMs, Math.max(0, endsAt.getTime() - cancelledAt.getTime()));
  if (remainingMs === 0) return 0;

  const numerator = BigInt(amount) * BigInt(remainingMs);
  const denominator = BigInt(totalMs);
  const roundedUp = (numerator + denominator - 1n) / denominator;
  return Math.min(amount, Number(roundedUp));
}
