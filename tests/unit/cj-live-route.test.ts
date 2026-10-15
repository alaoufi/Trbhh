import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({session:vi.fn(),access:vi.fn(),product:vi.fn(),inventory:vi.fn(),verify:vi.fn(),zip:vi.fn(),row:vi.fn(),pricing:vi.fn()}));
vi.mock('@/lib/auth',()=>({getSession:state.session}));
vi.mock('@/lib/access-control/guards',()=>({hasAccess:state.access}));
vi.mock('@/lib/cj/client',()=>({getProduct:state.product,getInventoryByPid:state.inventory}));
vi.mock('@/lib/cj/availability',()=>({verifyCjVariantForSaudi:state.verify}));
vi.mock('@/lib/cj/verified-pricing',()=>({readVerifiedCjPricing:state.pricing}));
vi.mock('@/lib/cj/destination',()=>({getCjDestinationZip:state.zip}));
vi.mock('@/lib/cj/mapping',()=>({getStorefrontCjProduct:state.row}));
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-13T00:00:00Z'));
  vi.resetModules();vi.clearAllMocks();state.session.mockResolvedValue({uid:9});state.access.mockResolvedValue(true);
  state.zip.mockResolvedValue('11564');state.row.mockResolvedValue({hidden:0,cj_product_id:'p',margin_bps:4000,other_costs_minor:200,sale_price_override_minor:null});
  state.pricing.mockResolvedValue({usdToSarX100:375,marginBps:3000});
  state.product.mockResolvedValue({ok:true,data:{variants:[{vid:'v',variantSellPrice:5}]}});
  state.verify.mockResolvedValue({status:'available',vid:'v',stockQuantity:4,salePriceMinor:1875,checkedAt:'2026-10-13T00:00:00Z',shippingOptions:[{priceMinor:700,additionalMinor:100,deliveryDays:'7-12'}]});
});
afterEach(()=>{vi.useRealTimers();});
const req=(suffix='')=>new Request('https://trbhh.sa/api/cj/live?pid=p'+suffix);
describe('CJ live display endpoint',()=>{
  it('reuses a verified display for 30 seconds, then fetches again, without hiding its check time',async()=>{const {GET}=await import('@/app/api/cj/live/route');await GET(req());vi.advanceTimersByTime(29000);const cached=await (await GET(req())).json();expect(cached.checkedAt).toBe('2026-10-13T00:00:00Z');expect(state.verify).toHaveBeenCalledTimes(1);vi.advanceTimersByTime(1001);await GET(req());expect(state.verify).toHaveBeenCalledTimes(2);});
  it('separates actors and changes to the current pricing settings',async()=>{const {GET}=await import('@/app/api/cj/live/route');await GET(req());state.session.mockResolvedValue({uid:10});await GET(req());state.pricing.mockResolvedValue({usdToSarX100:400,marginBps:3000});await GET(req());expect(state.verify).toHaveBeenCalledTimes(3);});
  it('reuses exact live PID inventory for the selected variant without mixing other variants',async()=>{state.product.mockResolvedValue({ok:true,data:{variants:[{vid:'v1',variantSellPrice:5},{vid:'v2',variantSellPrice:6}]}});const inventory=[{vid:'v1',countryCode:'CN',cjInventoryQuantity:1},{vid:'v2',countryCode:'CN',cjInventoryQuantity:7}];state.inventory.mockResolvedValue({ok:true,data:inventory});const {GET}=await import('@/app/api/cj/live/route');await GET(req());const deps=state.verify.mock.calls[0][3];expect(state.verify.mock.calls[0][1].vid).toBe('v2');expect(await deps.getInventoryByVid('v2')).toEqual({ok:true,data:[inventory[1]]});expect(state.inventory).toHaveBeenCalledTimes(1);});
  it('hides all numbers without a verified destination and never queries CJ',async()=>{
    state.zip.mockResolvedValue(undefined);const {GET}=await import('@/app/api/cj/live/route');
    expect(await (await GET(req())).json()).toEqual({status:'destination_required'});expect(state.product).not.toHaveBeenCalled();
  });
  it('cannot bypass a missing owned destination with a client supplied postcode',async()=>{
    state.zip.mockResolvedValue(undefined);const {GET}=await import('@/app/api/cj/live/route');
    expect(await (await GET(req('&zip=23455'))).json()).toEqual({status:'destination_required'});expect(state.verify).not.toHaveBeenCalled();
  });
  it('hides all numbers rather than inventing FX or margin after a database failure',async()=>{
    state.pricing.mockRejectedValue(Error('database offline'));const {GET}=await import('@/app/api/cj/live/route');
    expect(await (await GET(req())).json()).toEqual({status:'unavailable'});expect(state.verify).not.toHaveBeenCalled();
  });
  it('uses the imported product pricing only when its identity matches the live PID',async()=>{
    const {GET}=await import('@/app/api/cj/live/route');await GET(req('&id=4'));
    expect(state.verify.mock.calls[0][5]).toEqual({marginBps:4000,otherCostsMinor:200,saleOverrideMinor:null});
    state.row.mockResolvedValue({hidden:0,cj_product_id:'other'});
    expect(await (await GET(req('&id=5'))).json()).toEqual({status:'unavailable'});
  });
  it('returns the exact verified price, shipping, stock and timestamp',async()=>{
    const {GET}=await import('@/app/api/cj/live/route');const response=await GET(req());
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({priceMinor:1875,shipMinor:800,totalMinor:2675,stock:4,vid:'v',quantity:1,checkedAt:'2026-10-13T00:00:00Z'});
  });
  it('coalesces duplicate reads and bypasses a settled snapshot on explicit refresh',async()=>{
    const {GET}=await import('@/app/api/cj/live/route');await Promise.all([GET(req()),GET(req())]);expect(state.verify).toHaveBeenCalledTimes(1);
    await GET(req('&refresh=1'));expect(state.verify).toHaveBeenCalledTimes(2);
  });
  it('never caches transient failures and separates Saudi destination quotes',async()=>{
    const {GET}=await import('@/app/api/cj/live/route');state.verify.mockResolvedValueOnce({status:'freight_error'});
    expect((await (await GET(req())).json()).status).toBe('freight_error');
    await GET(req());state.zip.mockResolvedValue('23455');await GET(req());expect(state.verify).toHaveBeenCalledTimes(3);
    expect(state.verify.mock.calls[2][6]).toBe('23455');
  });
  it.each([401,403])('rejects unauthorized or insufficient access before calling CJ (%s)',async status=>{
    if(status===401)state.session.mockResolvedValue(null);else state.access.mockResolvedValue(false);
    const {GET}=await import('@/app/api/cj/live/route');expect((await GET(req())).status).toBe(status);expect(state.product).not.toHaveBeenCalled();
  });
});
