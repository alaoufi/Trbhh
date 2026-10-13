import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ config: vi.fn(), readAuth: vi.fn(), writeAuth: vi.fn(), fetch: vi.fn() }));
vi.mock('@/lib/cj/config', () => ({ cjConfig: mock.config }));
vi.mock('@/lib/cj/store', () => ({ readCjAuth: mock.readAuth, writeCjAuth: mock.writeAuth }));
vi.mock('@/lib/commerce/settings', () => ({ getCommerceConfig: vi.fn() }));

const BASE = 'https://cj.example.test/api2.0/v1';
const NOW = new Date('2026-10-12T12:00:00Z');
const EXPIRY = new Date('2027-01-01T12:00:00Z');
const tokens = { accessToken: 'test-access-token', refreshToken: 'test-refresh-token' };

function reply(body: unknown, status = 200) {
  return { status, text: async () => JSON.stringify(body) };
}
function success(data: unknown) {
  return reply({ code: 200, result: true, success: true, data });
}
async function finish<T>(pending: Promise<T>): Promise<T> {
  // Exercise the real 1.1-second throttle without wall-clock delays.
  await vi.runAllTimersAsync();
  return pending;
}

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal('fetch', mock.fetch);
  mock.config.mockReturnValue({ base: BASE, email: '', apiKey: 'test-api-key', encryptionKey: 'a'.repeat(64), webhookSecret: '', configured: true });
  mock.readAuth.mockResolvedValue({ tokens, accessExpiresAt: EXPIRY, refreshExpiresAt: EXPIRY });
  mock.writeAuth.mockResolvedValue(undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('CJ authentication and verified connection', () => {
  it.each([undefined,null,'',' ',true,'0x10',-1,'invalid',1.001])('rejects invalid wallet amount %s rather than verifying zero',async(amount)=>{mock.fetch.mockResolvedValueOnce(success({amount}));const {getCjBalance}=await import('@/lib/cj/client');expect(await finish(getCjBalance())).toEqual({ok:false,error:'balance_response_invalid'});});
  it('preserves a legitimate exact zero wallet balance',async()=>{mock.fetch.mockResolvedValueOnce(success({amount:'0.00',freezeAmount:'1.00',noWithdrawalAmount:'2.00'}));const {getCjBalance}=await import('@/lib/cj/client');expect(await finish(getCjBalance())).toEqual({ok:true,data:{amountUsd:0,bonusUsd:2,frozenUsd:1}});});
  it('authenticates with the API key payload when no token is stored', async () => {
    mock.readAuth.mockResolvedValue(null);
    mock.fetch.mockResolvedValueOnce(success({ ...tokens, accessTokenExpiryDate: EXPIRY.toISOString() }))
      .mockResolvedValueOnce(success({ list: [], total: 0 }));
    const { listProductsPage } = await import('@/lib/cj/client');

    expect(await finish(listProductsPage(1, 1))).toMatchObject({ ok: true, data: { items: [], total: 0 } });
    expect(mock.fetch).toHaveBeenNthCalledWith(1, `${BASE}/authentication/getAccessToken`, expect.objectContaining({
      method: 'POST', body: JSON.stringify({ apiKey: 'test-api-key' }),
    }));
    expect(mock.writeAuth).toHaveBeenCalledWith(expect.objectContaining({ tokens }), 'a'.repeat(64));
  });

  it('falls back from a rejected refresh to the API key payload', async () => {
    mock.readAuth.mockResolvedValue({ tokens, accessExpiresAt: NOW, refreshExpiresAt: EXPIRY });
    mock.fetch.mockResolvedValueOnce(reply({ code: 1600003, result: false, success: false, message: 'Refresh token is failure' }))
      .mockResolvedValueOnce(success(tokens))
      .mockResolvedValueOnce(success({ list: [], total: 0 }));
    const { listProductsPage } = await import('@/lib/cj/client');

    expect(await finish(listProductsPage(1, 1))).toMatchObject({ ok: true });
    expect(mock.fetch).toHaveBeenNthCalledWith(1, `${BASE}/authentication/refreshAccessToken`, expect.objectContaining({ body: JSON.stringify({ refreshToken: tokens.refreshToken }) }));
    expect(mock.fetch).toHaveBeenNthCalledWith(2, `${BASE}/authentication/getAccessToken`, expect.objectContaining({ body: JSON.stringify({ apiKey: 'test-api-key' }) }));
  });

  it.each([
    ['error code', { code: 1600001, result: true, success: true }],
    ['result false', { code: 200, result: false, success: true }],
    ['success false', { code: 200, result: true, success: false }],
  ])('does not save tokens from an authentication envelope with %s', async (_label, envelope) => {
    mock.readAuth.mockResolvedValue(null);
    mock.fetch.mockResolvedValueOnce(reply({ ...envelope, data: tokens, message: 'Authentication failed' }));
    const { testConnection } = await import('@/lib/cj/client');

    expect(await finish(testConnection())).toMatchObject({ ok: false, error: 'Authentication failed' });
    expect(mock.writeAuth).not.toHaveBeenCalled();
    expect(mock.fetch).toHaveBeenCalledTimes(1);
  });

  it('checks a cached token with an authenticated one-item product read before reporting connected', async () => {
    mock.fetch.mockResolvedValueOnce(success({ list: [], total: 0 }));
    const { testConnection } = await import('@/lib/cj/client');

    expect(await finish(testConnection())).toEqual({ ok: true, data: { connected: true, email: '', accessTokenExpiresAt: EXPIRY.toISOString() } });
    expect(mock.fetch).toHaveBeenCalledExactlyOnceWith(`${BASE}/product/list?pageNum=1&pageSize=1`, expect.objectContaining({
      method: 'GET', headers: expect.objectContaining({ 'CJ-Access-Token': tokens.accessToken }),
    }));
    expect(mock.writeAuth).not.toHaveBeenCalled();
  });

  it.each([
    ['error code', { code: 1600001, result: true, success: true, data: { list: [] } }],
    ['result false', { code: 200, result: false, success: true, data: { list: [] } }],
    ['success false', { code: 200, result: true, success: false, data: { list: [] } }],
    ['missing success marker', { code: 200, data: { list: [] } }],
    ['missing envelope', { list: [] }],
    ['null body', null],
  ])('rejects a cached-token read with %s', async (_label, envelope) => {
    mock.fetch.mockResolvedValueOnce(reply(envelope));
    const { testConnection } = await import('@/lib/cj/client');
    expect(await finish(testConnection())).toMatchObject({ ok: false });
  });

  it.each([null, {}, [], { list: null }, { list: {} }])('rejects malformed connection data: %j', async (data) => {
    mock.fetch.mockResolvedValueOnce(success(data));
    const { testConnection } = await import('@/lib/cj/client');
    expect(await finish(testConnection())).toMatchObject({ ok: false, error: 'cj_invalid_response' });
  });

  it('rejects a non-JSON response from the authenticated read', async () => {
    mock.fetch.mockResolvedValueOnce({ status: 200, text: async () => '<html>Gateway error</html>' });
    const { testConnection } = await import('@/lib/cj/client');
    expect(await finish(testConnection())).toMatchObject({ ok: false });
  });

  it('propagates a rejected cached token without claiming the connection works', async () => {
    mock.fetch.mockResolvedValueOnce(reply({ code: 1600001, result: false, success: false, message: 'Authentication failed' }, 401));
    const { testConnection } = await import('@/lib/cj/client');
    expect(await finish(testConnection())).toEqual({ ok: false, error: 'Authentication failed', status: 401 });
  });

  it('rejects CJ error codes for normal product reads too', async () => {
    mock.fetch.mockResolvedValueOnce(reply({ code: 1600200, success: false, message: 'Too Many Requests', data: { list: [] } }));
    const { listProductsPage } = await import('@/lib/cj/client');
    expect(await finish(listProductsPage())).toEqual({ ok: false, error: 'Too Many Requests', status: 200 });
  });
});

describe('CJ inventory identity', () => {
  it('reads current tracking API and selects only the requested identity', async () => {
    mock.fetch.mockResolvedValueOnce(success([{trackingNumber:'OTHER',trackingStatus:'Delivered'}, {trackingNumber:'T1',logisticName:'CJPacket',trackingStatus:'In transit',lastMileCarrier:'Local carrier',lastTrackNumber:'LAST1'}]));
    const {getTracking}=await import('@/lib/cj/client');
    expect(await finish(getTracking('T1'))).toMatchObject({ok:true,data:{trackNumber:'T1',trackStatus:'In transit',lastMileCarrier:'Local carrier',lastTrackNumber:'LAST1'}});
    expect(mock.fetch).toHaveBeenCalledWith(`${BASE}/logistic/trackInfo?trackNumber=T1`,expect.anything());
  });
  it('rejects unrelated tracking results instead of attributing another delivery', async () => {
    mock.fetch.mockResolvedValueOnce(success([{trackingNumber:'OTHER',trackingStatus:'Delivered'}]));
    const {getTracking}=await import('@/lib/cj/client');
    expect(await finish(getTracking('T1'))).toEqual({ok:false,error:'cj_tracking_identity_unavailable'});
  });
  it('preserves numeric and string warehouse IDs, variant association, and areaEn in PID inventory', async () => {
    mock.fetch.mockResolvedValueOnce(success({ variantInventories: [
      { vid: 'V1', inventory: [{ areaId: 1, areaEn: 'China', countryCode: 'CN', totalInventory: 12 }, { areaId: 'US-2', areaEn: 'United States', totalInventory: 3 }] },
      { vid: 'V2', inventory: [{ areaId: 0, areaEn: 'Other', totalInventory: 4 }] },
    ] }));
    const { getInventoryByPid } = await import('@/lib/cj/client');
    const result = await finish(getInventoryByPid('PID1'));
    expect(result).toMatchObject({ ok: true, data: [
      { vid: 'V1', areaId: '1', areaName: 'China', countryCode: 'CN', storageNum: 12 },
      { vid: 'V1', areaId: 'US-2', areaName: 'United States', storageNum: 3 },
      { vid: 'V2', areaId: '0', areaName: 'Other', storageNum: 4 },
    ] });
    expect(mock.fetch).toHaveBeenCalledWith(`${BASE}/product/stock/getInventoryByPid?pid=PID1`, expect.anything());
  });

  it('preserves numeric storageAreaId on VID inventory and rejects invalid warehouse IDs', async () => {
    mock.fetch.mockResolvedValueOnce(success([
      { vid: 'V1', storageAreaId: 42 }, { vid: 'V1', areaId: {} }, { vid: 'V1', areaId: null }, { vid: 'V1', areaId: true },
    ]));
    const { getInventoryByVid } = await import('@/lib/cj/client');
    expect(await finish(getInventoryByVid('V1'))).toMatchObject({ ok: true, data: [
      { vid: 'V1', areaId: '42' }, { vid: 'V1', areaId: null }, { vid: 'V1', areaId: null }, { vid: 'V1', areaId: null },
    ] });
  });
});
