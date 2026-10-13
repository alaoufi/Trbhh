import {beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({session:vi.fn(),access:vi.fn(),product:vi.fn(),verify:vi.fn(),zip:vi.fn(),row:vi.fn(),pricing:vi.fn()}));
vi.mock('@/lib/auth',()=>({getSession:state.session}));
vi.mock('@/lib/access-control/guards',()=>({hasAccess:state.access}));
vi.mock('@/lib/cj/client',()=>({getProduct:state.product,getInventoryByPid:vi.fn()}));
vi.mock('@/lib/cj/availability',()=>({verifyCjVariantForSaudi:state.verify}));
vi.mock('@/lib/cj/verified-pricing',()=>({readVerifiedCjPricing:state.pricing}));
vi.mock('@/lib/cj/destination',()=>({getCjDestinationZip:state.zip}));
vi.mock('@/lib/cj/mapping',()=>({getStorefrontCjProduct:state.row}));
beforeEach(()=>{
  vi.resetModules();vi.clearAllMocks();state.session.mockResolvedValue({uid:9});state.access.mockResolvedValue(true);
  state.zip.mockResolvedValue('11564');state.row.mockResolvedValue({hidden:0,cj_product_id:'p',margin_bps:4000,other_costs_minor:200,sale_price_override_minor:null});
  state.pricing.mockResolvedValue({usdToSarX100:375,marginBps:3000});
  state.product.mockResolvedValue({ok:true,data:{variants:[{vid:'v',variantSellPrice:5}]}});
  state.verify.mockResolvedValue({status:'available',vid:'v',stockQuantity:4,salePriceMinor:1875,checkedAt:'2026-10-13T00:00:00Z',shippingOptions:[{priceMinor:700,additionalMinor:100,deliveryDays:'7-12'}]});
});
const req=(suffix='')=>new Request('https://trbhh.sa/api/cj/live?pid=p'+suffix);
describe('CJ live display endpoint',()=>{
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
