import { describe, expect, it } from 'vitest';
import {
  PRIVATE_ALRAJHI_DEFAULT_AMOUNT,
  PRIVATE_ALRAJHI_AMOUNT_INPUT_LANGUAGE,
  PRIVATE_ALRAJHI_PENDING_MESSAGE,
} from '../../src/app/admin/payments/private-topup/private-topup-form';

describe('private Al Rajhi form defaults', () => {
  it('uses 50 SAR and tells the operator not to close the page while pending', () => {
    expect(PRIVATE_ALRAJHI_DEFAULT_AMOUNT).toBe(50);
    expect(PRIVATE_ALRAJHI_AMOUNT_INPUT_LANGUAGE).toBe('en');
    expect(PRIVATE_ALRAJHI_PENDING_MESSAGE).toContain('لا تغلق الصفحة');
  });
});
