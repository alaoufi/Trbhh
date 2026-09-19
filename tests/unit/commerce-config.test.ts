import { describe, expect, it } from 'vitest';
import { commerceConfigFromRows, commerceReadiness, COMMERCE_DEFAULTS } from '@/lib/commerce/config';

const rows = (values: Record<string, string>) => Object.entries(values).map(([k, v]) => ({ k, v }));

describe('commerce rollout gates', () => {
  it('defaults to disabled without repurposing wallet or OTP switches', () => {
    const cfg = commerceConfigFromRows(rows({ otp_enabled: '1', pay_enabled: '1' }));
    expect(cfg.enabled).toBe(false);
    expect(cfg.paymentsEnabled).toBe(false);
    expect(cfg.notificationsEnabled).toBe(false);
  });

  it('enables only explicit literal flags', () => {
    const cfg = commerceConfigFromRows(rows({ commerce_enabled: 'true', commerce_payments_enabled: 'yes' }));
    expect(cfg.enabled).toBe(false);
    expect(cfg.paymentsEnabled).toBe(false);
    expect(commerceConfigFromRows(rows({ commerce_enabled: '1' })).enabled).toBe(true);
  });

  it('does not treat enabled settings as verified payment readiness', () => {
    const cfg = commerceConfigFromRows(rows({ commerce_enabled: '1', commerce_payments_enabled: '1' }));
    expect(commerceReadiness(cfg, { schemaReady: true, gatewayVerified: false })).toEqual({ ready: false, reason: 'gateway_unverified' });
    expect(commerceReadiness(cfg, { schemaReady: false, gatewayVerified: true })).toEqual({ ready: false, reason: 'schema_unavailable' });
    expect(commerceReadiness(cfg, { schemaReady: true, gatewayVerified: true })).toEqual({ ready: true, reason: null });
  });

  it('provides editable interface text and validated notification destinations', () => {
    const cfg = commerceConfigFromRows(rows({ commerce_title: 'متجر تربح', commerce_admin_phone: '+966 50 123 4567' }));
    expect(cfg.text.title).toBe('متجر تربح');
    expect(cfg.adminPhone).toBe('966501234567');
    expect(commerceConfigFromRows(rows({ commerce_admin_phone: '123' })).adminPhone).toBe(null);
    expect(COMMERCE_DEFAULTS.commerce_enabled).toBe('0');
  });
});
