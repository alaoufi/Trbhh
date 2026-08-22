import { describe, expect, test } from 'vitest';
import { isSaudiRegistrationPhone, normalizeSaudiRegistrationPhone, registrationRouteForPhone } from '@/lib/phone-registration';

describe('Saudi registration phone policy', () => {
  test('canonicalizes supported Saudi representations', () => {
    expect(normalizeSaudiRegistrationPhone('+966 50 123 4567')).toBe('0501234567');
    expect(normalizeSaudiRegistrationPhone('00966501234567')).toBe('0501234567');
    expect(normalizeSaudiRegistrationPhone('501234567')).toBe('0501234567');
  });

  test('routes international numbers to manual review', () => {
    expect(isSaudiRegistrationPhone('00213667214296')).toBe(false);
    expect(registrationRouteForPhone('00213667214296')).toBe('international-request');
  });
});
