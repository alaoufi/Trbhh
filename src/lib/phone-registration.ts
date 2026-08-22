/** Saudi-only public registration policy. Stored form is always 05XXXXXXXX. */
export function normalizeSaudiRegistrationPhone(input: string): string | null {
  const digits = (input || '').replace(/\D/g, '');
  const local = digits.startsWith('00966') ? `0${digits.slice(5)}`
    : digits.startsWith('966') ? `0${digits.slice(3)}`
    : digits.startsWith('5') ? `0${digits}`
    : digits;
  return /^05\d{8}$/.test(local) ? local : null;
}

export function isSaudiRegistrationPhone(input: string): boolean {
  return normalizeSaudiRegistrationPhone(input) !== null;
}

export function registrationRouteForPhone(input: string): 'saudi-otp' | 'international-request' {
  return isSaudiRegistrationPhone(input) ? 'saudi-otp' : 'international-request';
}

export function isInternationalReviewDecision(value: string): value is 'approve' | 'reject' {
  return value === 'approve' || value === 'reject';
}
