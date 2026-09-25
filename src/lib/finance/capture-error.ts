const knownCaptureErrors = new Set([
  'finance_capture_not_configured',
  'finance_capture_unauthorized',
  'finance_schema_not_ready',
  'finance_period_closed',
  'finance_amount_invalid',
  'finance_date_invalid',
  'finance_invoice_difference',
]);

/** A secret-authenticated worker may receive a stable error category, never raw exception text. */
export function financeCaptureErrorCategory(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown_error';
  if (knownCaptureErrors.has(error.message)) return error.message;
  if ('code' in error && typeof error.code === 'string' && /^P\d{4}$/.test(error.code)) {
    const code=error.code;
    if(code==='P2022'||code==='P2021'){
      const property=code==='P2022'?'column':'table';
      const meta='meta' in error&&error.meta&&typeof error.meta==='object'?error.meta as Record<string,unknown>:{};
      const raw=typeof meta[property]==='string'?meta[property]:'';
      const identifier=raw.split(/[.`]/).filter(Boolean).at(-1)||'';
      if(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(identifier))return `database_missing_${property}_${identifier.toLowerCase()}`;
      return `database_missing_${property}`;
    }
    return `database_${code.toLowerCase()}`;
  }
  return 'unknown_error';
}
