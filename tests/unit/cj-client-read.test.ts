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
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('CJ authentication and verified connection', () => {
  it('builds a named supplier chooser from actual supplier products, not platform names or invented ids',async()=>{
    mock.fetch.mockResolvedValueOnce(success({list:[{supplierId:'S2',supplierName:'Supplier Two'},{supplierId:'S2',supplierName:'Supplier Two'},{supplierId:'S1',supplierName:'Supplier One'},{supplierName:'Unknown ID'},{supplierId:'bad&id',supplierName:'Unsafe'},{supplierId:'EMPTY',supplierName:''}]}));
    const {getCjCatalogSuppliers}=await import('@/lib/cj/client');const result=await finish(getCjCatalogSuppliers());
    expect(result).toEqual({ok:true,data:[{id:'S1',name:'Supplier One'},{id:'S2',name:'Supplier Two'}]});
    const url=new URL(mock.fetch.mock.calls[0][0]);expect(url.searchParams.get('productType')).toBe('SUPPLIER_PRODUCT');expect(url.searchParams.get('pageSize')).toBe('200');
    expect(await getCjCatalogSuppliers()).toEqual(result);expect(mock.fetch).toHaveBeenCalledTimes(1);
  });
  it('does not turn supplier API failure into a fabricated supplier list',async()=>{mock.fetch.mockResolvedValueOnce(reply({result:false,code:1600100,message:'Unavailable'},503));const {getCjCatalogSuppliers}=await import('@/lib/cj/client');expect(await finish(getCjCatalogSuppliers())).toMatchObject({ok:false});});
  it('does not share supplier discovery across API accounts',async()=>{mock.fetch.mockResolvedValueOnce(success({list:[{supplierId:'S1',supplierName:'Supplier One'}]})).mockResolvedValueOnce(success({list:[]}));const {getCjCatalogSuppliers}=await import('@/lib/cj/client');expect(await finish(getCjCatalogSuppliers())).toMatchObject({ok:true,data:[{id:'S1'}]});mock.config.mockReturnValue({...mock.config(),apiKey:'another-account-key'});expect(await finish(getCjCatalogSuppliers())).toEqual({ok:true,data:[]});expect(mock.fetch).toHaveBeenCalledTimes(2);});
  it('queries the complete V2 catalog with filters and maps its nested paginated response',async()=>{
    mock.fetch.mockResolvedValueOnce(success({totalRecords:90,content:[{productList:[{id:'P1',nameEn:'Ring',sku:'SKU',bigImage:'https://example.com/ring.jpg',sellPrice:'2.50',threeCategoryName:'Rings'}]}]}));
    const {listBrowseProductsPage}=await import('@/lib/cj/client');
    const result=await finish(listBrowseProductsPage(2,24,{productName:'ring',categoryId:'CAT',filters:{minPrice:'2',platform:'tiktok',sort:'price_asc'}}));
    expect(result).toMatchObject({ok:true,data:{total:90,pageNum:2,items:[{pid:'P1',productName:'Ring',sellPrice:2.5,categoryName:'Rings'}]}});
    const url=new URL(mock.fetch.mock.calls[0][0]);expect(url.pathname).toContain('/product/listV2');expect(Object.fromEntries(url.searchParams)).toMatchObject({page:'2',size:'24',keyWord:'ring',categoryId:'CAT',startSellPrice:'2',zonePlatform:'tiktok',orderBy:'2',sort:'asc'});
  });
  it('rejects invalid catalog filters without network calls and malformed V2 data without inventing results',async()=>{
    const {listBrowseProductsPage}=await import('@/lib/cj/client');
    expect(await listBrowseProductsPage(1,24,{filters:{minPrice:'10',maxPrice:'1'}})).toMatchObject({ok:false});expect(mock.fetch).not.toHaveBeenCalled();
    mock.fetch.mockResolvedValueOnce(success({totalRecords:90,list:[]}));expect(await finish(listBrowseProductsPage(1,24))).toMatchObject({ok:false,error:'cj_invalid_response'});
  });
  it('uses the documented orderIds batch schema with at most 100 ids, and retries only a read limit',async()=>{
    mock.fetch.mockResolvedValueOnce(reply({code:1600200,result:false,message:'Too Many Requests'},429)).mockResolvedValueOnce(success([{orderId:'O1',orderNum:'R1'}]));
    const {getCjOrderDetailBatch}=await import('@/lib/cj/client');
    expect(await finish(getCjOrderDetailBatch(['O1']))).toEqual({ok:true,data:[{orderId:'O1',orderNum:'R1'}]});
    expect(mock.fetch.mock.calls[0][1].body).toBe(JSON.stringify({orderIds:['O1']}));
    expect(await getCjOrderDetailBatch(Array.from({length:101},(_,i)=>String(i)))).toMatchObject({ok:false});
    expect(mock.fetch).toHaveBeenCalledTimes(2);
  });
  it('also pauses already queued stock reads when the first request hits the account quota',async()=>{
    const sent:number[]=[];
    mock.fetch.mockImplementation(async()=>{sent.push(Date.now());return sent.length===1?reply({code:1600200,result:false,message:'Too Many Requests'},429):success([]);});
    const {getInventoryByVid}=await import('@/lib/cj/client');
    expect(await finish(Promise.all([getInventoryByVid('V1'),getInventoryByVid('V2')]))).toEqual([{ok:true,data:[]},{ok:true,data:[]}]);
    expect(sent).toHaveLength(3);
    expect(sent[1]-sent[0]).toBeGreaterThanOrEqual(1500);
    expect(sent[2]-sent[1]).toBeGreaterThanOrEqual(1100);
  });
  it('retries rate-limited stock reads with a pause, then accepts fresh stock',async()=>{
    mock.fetch.mockResolvedValueOnce(reply({code:1600200,result:false,message:'Too Many Requests'},429)).mockResolvedValueOnce(success([]));
    const {getInventoryByVid}=await import('@/lib/cj/client');
    expect(await finish(getInventoryByVid('VID'))).toEqual({ok:true,data:[]});
    expect(mock.fetch).toHaveBeenCalledTimes(2);
    expect(Date.now()-NOW.getTime()).toBeGreaterThanOrEqual(1500);
    expect(mock.fetch.mock.calls.every(([url])=>url===`${BASE}/product/stock/queryByVid?vid=VID`)).toBe(true);
  });
  it('retries freight calculation even when CJ returns its rate code with HTTP 200',async()=>{
    mock.fetch.mockResolvedValueOnce(reply({code:1600200,result:false,message:'Too Many Requests'})).mockResolvedValueOnce(success([]));
    const {calculateFreightToKSA}=await import('@/lib/cj/client');
    expect(await finish(calculateFreightToKSA([{vid:'VID',quantity:1}],'56357','CN'))).toEqual({ok:true,data:[]});
    expect(mock.fetch).toHaveBeenCalledTimes(2);
    expect(mock.fetch.mock.calls[0][1].body).toBe(mock.fetch.mock.calls[1][1].body);
  });
  it('stops after three rate-limited inventory attempts and fails closed',async()=>{
    mock.fetch.mockResolvedValue(reply({code:1600200,result:false,message:'Too Many Requests'},429));
    const {getInventoryByVid}=await import('@/lib/cj/client');
    expect(await finish(getInventoryByVid('VID'))).toEqual({ok:false,error:'Too Many Requests',status:429});
    expect(mock.fetch).toHaveBeenCalledTimes(3);
  });
  it.each(['/shopping/order/createOrderV3','/shopping/order/saveGenerateParentOrder','/shopping/pay/payBalanceV2'])('never retries financial transport %s after a rate limit',async path=>{
    for(const key of ['CJ_ALLOW_LIVE_ORDERS','CJ_FULFILLMENT_WORKER_ENABLED','CJ_LIVE_TRIAL_ENABLED'])vi.stubEnv(key,'true');
    const {getCommerceConfig}=await import('@/lib/commerce/settings');vi.mocked(getCommerceConfig).mockResolvedValue({purchasingEnabled:true} as never);
    mock.fetch.mockResolvedValue(reply({code:1600200,result:false,message:'Too Many Requests'},429));
    const {cjFulfillmentTransport}=await import('@/lib/cj/client');
    expect(await finish(cjFulfillmentTransport(path,{payType:3}))).toMatchObject({ok:false,status:429});
    expect(mock.fetch).toHaveBeenCalledTimes(1);
  });
  it('does not retry inventory network timeouts or authentication failures',async()=>{
    mock.fetch.mockRejectedValueOnce(Error('timeout')).mockResolvedValueOnce(reply({code:1600001,result:false,message:'Expired'},401));
    const {getInventoryByVid}=await import('@/lib/cj/client');
    expect(await finish(getInventoryByVid('VID'))).toMatchObject({ok:false,status:0});
    expect(mock.fetch).toHaveBeenCalledTimes(1);
    expect(await finish(getInventoryByVid('VID'))).toMatchObject({ok:false,status:401});
    expect(mock.fetch).toHaveBeenCalledTimes(2);
  });
  it('routes only the new private CJ unpaid transport through dedicated gates with shared supplier gate off',async()=>{
    vi.stubEnv('SUPPLIER_ALLOW_LIVE_ORDERS','false');for(const key of ['CJ_ALLOW_LIVE_ORDERS','CJ_FULFILLMENT_WORKER_ENABLED','CJ_LIVE_TRIAL_ENABLED'])vi.stubEnv(key,'true');
    const {getCommerceConfig}=await import('@/lib/commerce/settings');vi.mocked(getCommerceConfig).mockResolvedValue({purchasingEnabled:true} as never);mock.fetch.mockResolvedValueOnce(success({orderId:'fixture-unpaid'}));
    const client=await import('@/lib/cj/client');expect(await finish(client.cjFulfillmentTransport('/shopping/order/createOrderV3',{payType:3,orderNumber:'fixture-unpaid'}))).toEqual({ok:true,data:{orderId:'fixture-unpaid'}});expect(mock.fetch).toHaveBeenCalledTimes(1);expect(await client.createCjOrder({})).toEqual({ok:false,error:'cj_purchasing_disabled'});expect(mock.fetch).toHaveBeenCalledTimes(1);expect(process.env.SUPPLIER_ALLOW_LIVE_ORDERS).toBe('false');
  });
  it('cannot enable new CJ financial transport through the shared supplier gate alone',async()=>{
    vi.stubEnv('SUPPLIER_ALLOW_LIVE_ORDERS','true');vi.stubEnv('CJ_ALLOW_LIVE_ORDERS','false');vi.stubEnv('CJ_FULFILLMENT_WORKER_ENABLED','true');vi.stubEnv('CJ_LIVE_TRIAL_ENABLED','true');const {getCommerceConfig}=await import('@/lib/commerce/settings');vi.mocked(getCommerceConfig).mockResolvedValue({purchasingEnabled:true} as never);const {cjFulfillmentTransport}=await import('@/lib/cj/client');expect(await cjFulfillmentTransport('/shopping/order/createOrderV3',{payType:3})).toEqual({ok:false,error:'cj_fulfillment_disabled'});expect(mock.fetch).not.toHaveBeenCalled();
  });
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
  it('reads the supplier size chart by exact PID without product mutation',async()=>{mock.fetch.mockResolvedValueOnce(success({pid:'p',configured:false,chartData:null}));const {getCjSizeChart}=await import('@/lib/cj/client');expect(await finish(getCjSizeChart('p'))).toEqual({ok:true,data:{pid:'p',configured:false,baseVariantKey:null,rows:[]}});expect(mock.fetch.mock.calls[0][0]).toBe(BASE+'/product/sizeChart/query?pid=p');});
  it('preserves the product declared option schema for every variant',async()=>{mock.fetch.mockResolvedValueOnce(success({pid:'p',productNameEn:'Shoes',productKeyEn:'Color-Size',variants:[{vid:'v1',variantSku:'S1',variantKey:'Purple-US 12.5'}]}));const {getProduct}=await import('@/lib/cj/client');expect(await finish(getProduct('p'))).toMatchObject({ok:true,data:{optionSchema:['Color','Size'],variants:[{vid:'v1',optionSchema:['Color','Size'],variantKey:'Purple-US 12.5'}]}});});
  it('keeps structured option attributes and skips empty display aliases',async()=>{mock.fetch.mockResolvedValueOnce(success([{vid:'v1',variantSku:'S1',variantNameEn:'',variantName:'Purple 36',variantKey:'',variantKeyEn:'Purple-36',options:[{name:'Color',value:'Purple'},{name:'Size',value:'36'}]}]));const {getVariants}=await import('@/lib/cj/client');expect(await finish(getVariants('p'))).toMatchObject({ok:true,data:[{vid:'v1',variantName:'Purple 36',variantKey:'Purple-36',attributes:{options:[{name:'Color',value:'Purple'},{name:'Size',value:'36'}]}}]});});
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
