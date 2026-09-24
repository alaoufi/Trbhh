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
  if ('code' in error && typeof error.code === 'string' && /^P\d{4}$/.test(error.code)) return 'database_error';
  return 'unknown_error';
}
