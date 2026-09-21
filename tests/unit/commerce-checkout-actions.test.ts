import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  user: vi.fn(), config: vi.fn(), gateway: vi.fn(), attempt: vi.fn(),
  area: vi.fn(), region: vi.fn(), country: vi.fn(), createOrder: vi.fn(),
  redirect: vi.fn((url: string): never => { throw new Error(`redirect:${url}`); }),
}));
vi.mock('@/lib/auth', () => ({ requireUser: state.user }));
vi.mock('@/lib/auth-security', () => ({ takeSecurityAttempt: state.attempt }));
vi.mock('@/lib/commerce/settings', () => ({ getCommerceConfig: state.config }));
vi.mock('@/lib/commerce/runtime', () => ({ getCommerceGateway: state.gateway }));
vi.mock('@/lib/commerce/orders', () => ({ createOrder: state.createOrder }));
vi.mock('@/lib/prisma', () => ({ prisma: {
  areas: { findUnique: state.area }, cities: { findUnique: state.region }, countries: { findUnique: state.country },
} }));
vi.mock('next/navigation', () => ({ redirect: state.redirect }));
// Keep the real phone normalization, settings defaults and Saudi-area validator.
import { commerceConfigFromRows } from '@/lib/commerce/config';
import { createCommerceOrder } from '@/app/shop/actions';
import { prisma } from '@/lib/prisma';

function config() {
  return commerceConfigFromRows([
    { k: 'commerce_enabled', v: '1' }, { k: 'commerce_payments_enabled', v: '1' }, { k: 'commerce_purchasing_enabled', v: '1' },
    { k: 'commerce_shipping_fee_sar', v: '15' }, { k: 'commerce_shipping_terms', v: 'Fixture shipping terms' },
    { k: 'commerce_checkout_error_text', v: 'Fixture invalid checkout' },
    { k: 'commerce_location_error_text', v: 'Fixture invalid Saudi location' },
    { k: 'commerce_rate_limit_text', v: 'Fixture rate limited' },
  ]);
}
function form() {
  const fd = new FormData();
  for (const [key, value] of Object.entries({
    productId: '17', quantity: '2', phone: '0501234567', area_id: '31', city_id: '7',
    terms: '1', requestKey: 'fixture-checkout-request-001', name: '  Fixture Member  ',
    address: '  Fixture street, building 4  ', postalCode: '12345',
  })) fd.set(key, value);
  return fd;
}
async function expectFormError(fd: FormData, error: string) {
  const before = [...fd.entries()];
  const previous = { error: 'Previous error' };
  await expect(createCommerceOrder(previous, fd)).resolves.toEqual({ error });
  expect(state.redirect).not.toHaveBeenCalled();
  expect([...fd.entries()]).toEqual(before);
  expect(previous).toEqual({ error: 'Previous error' });
}

describe('commerce checkout action request boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.redirect.mockImplementation((url: string): never => { throw new Error(`redirect:${url}`); });
    state.user.mockResolvedValue({ uid: 42 });
    state.config.mockResolvedValue(config());
    state.gateway.mockResolvedValue({ ready: true });
    state.attempt.mockResolvedValue(true);
    state.area.mockResolvedValue({ id: 31n, city_id: 7, name: 'الخرج' });
    state.region.mockResolvedValue({ id: 7n, country_id: 1, name: 'الرياض' });
    state.country.mockResolvedValue({ id: 1, name: 'السعودية', key: '966' });
    state.createOrder.mockResolvedValue({ id: 901n });
  });

  it('rate limits the authenticated member before location lookup or order creation, without redirecting', async () => {
    state.attempt.mockResolvedValue(false);
    const fd = form(); fd.set('memberId', '999');
    await expectFormError(fd, config().text.rateLimit);
    expect(state.attempt).toHaveBeenCalledExactlyOnceWith('commerce-order:42', 6);
    expect(state.area).not.toHaveBeenCalled(); expect(state.region).not.toHaveBeenCalled();
    expect(state.country).not.toHaveBeenCalled(); expect(state.createOrder).not.toHaveBeenCalled();
  });

  it.each([
    ['productId', '0'], ['productId', '17 OR 1=1'], ['productId', '1234567890123456'],
    ['quantity', '0'], ['quantity', '-1'], ['quantity', '1.5'], ['quantity', '10000'],
    ['phone', '+971501234567'], ['phone', ''], ['area_id', '0'], ['area_id', '3.1'],
    ['city_id', '0'], ['city_id', '7 OR 1=1'], ['terms', ''], ['terms', 'true'],
  ])('returns editable form state for invalid %s=%s before DB lookups', async (key, value) => {
    const fd = form(); fd.set(key, value);
    await expectFormError(fd, config().text.checkoutError);
    expect(state.area).not.toHaveBeenCalled(); expect(state.region).not.toHaveBeenCalled();
    expect(state.createOrder).not.toHaveBeenCalled();
  });

  it('rejects a real area paired with a different region despite forged Saudi labels', async () => {
    state.area.mockResolvedValue({ id: 31n, city_id: 8, name: 'مدينة أخرى' });
    const fd = form(); fd.set('country', 'SA'); fd.set('country_id', '1'); fd.set('city', 'الرياض');
    await expectFormError(fd, config().text.locationError);
    expect(state.area).toHaveBeenCalledExactlyOnceWith({ where: { id: 31n } });
    expect(state.region).toHaveBeenCalledExactlyOnceWith({ where: { id: 7n } });
    expect(state.createOrder).not.toHaveBeenCalled();
  });

  it('rejects a foreign region using its database country, ignoring a forged Saudi country ID', async () => {
    state.region.mockResolvedValue({ id: 7n, country_id: 2, name: 'Foreign region' });
    state.country.mockResolvedValue({ id: 2, name: 'United Arab Emirates', key: '971' });
    const fd = form(); fd.set('country', 'SA'); fd.set('country_id', '1');
    await expectFormError(fd, config().text.locationError);
    expect(state.country).toHaveBeenCalledExactlyOnceWith({ where: { id: 2 } });
    expect(state.createOrder).not.toHaveBeenCalled();
  });

  it.each(['area', 'region', 'country'] as const)('returns location state for a missing %s', async missing => {
    state[missing].mockResolvedValue(null);
    await expectFormError(form(), config().text.locationError);
    expect(state.createOrder).not.toHaveBeenCalled();
    if (missing === 'region') expect(state.country).not.toHaveBeenCalled();
  });

  it.each(['invalid_shipping', 'invalid_identifier', 'product_unavailable', 'request_conflict'])('returns form state when the order service rejects %s', async reason => {
    state.createOrder.mockRejectedValue(new Error(reason));
    await expectFormError(form(), config().text.checkoutError);
    expect(state.createOrder).toHaveBeenCalledTimes(1);
  });

  it('uses trusted Saudi location, authenticated member and server shipping fee, then redirects only after success', async () => {
    const fd = form();
    for (const [key, value] of Object.entries({ memberId: '999', country: 'US', country_id: '999', city: 'Forged city', shippingFeeMinor: '0', price: '1' })) fd.set(key, value);
    await expect(createCommerceOrder(null, fd)).rejects.toThrow('redirect:/account/orders/901');
    expect(state.createOrder).toHaveBeenCalledExactlyOnceWith(prisma, {
      memberId: 42n, requestKey: 'fixture-checkout-request-001', items: [{ productId: 17n, quantity: 2 }],
      shipping: { name: 'Fixture Member', phone: '+966501234567', addressLine: 'Fixture street, building 4', city: 'الخرج', postalCode: '12345', country: 'SA' },
    }, { shippingFeeMinor: 1500 });
    expect(state.redirect).toHaveBeenCalledExactlyOnceWith('/account/orders/901');
  });

  it('requires authentication before consuming quota or creating an order', async () => {
    state.user.mockRejectedValue(new Error('authentication_required'));
    await expect(createCommerceOrder(null, form())).rejects.toThrow('authentication_required');
    expect(state.attempt).not.toHaveBeenCalled(); expect(state.createOrder).not.toHaveBeenCalled();
  });
});
