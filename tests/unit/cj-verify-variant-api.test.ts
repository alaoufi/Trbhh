import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({session:vi.fn(),access:vi.fn(),row:vi.fn(),details:vi.fn(),settings:vi.fn(),verify:vi.fn(),tax:vi.fn()}));
vi.mock('@/lib/auth',()=>({getSession:mock.session}));
vi.mock('@/lib/access-control/guards',()=>({hasAccess:mock.access}));
vi.mock('@/lib/cj/mapping',()=>({getStorefrontCjProduct:mock.row,parseCjDetails:mock.details}));
vi.mock('@/lib/cj/sync',()=>({cjSyncSettings:mock.settings}));
vi.mock('@/lib/cj/availability',()=>({verifyCjVariantForSaudi:mock.verify}));
vi.mock('@/lib/cj/tax-quote',()=>({quoteCjVat:mock.tax}));
import {POST} from '@/app/api/cj/products/[id]/verify-variant/route';

const origin='https://trbhh.sa',params=Promise.resolve({id:'4'});
const row={id:4,hidden:0,cj_product_id:'pid-1',other_costs_minor:10,margin_bps:3000,sale_price_override_minor:null};
const variant={vid:'blue-s',sku:'SKU-BS',name:'Black-XL',optionKey:'Color-Black-Size-XL',priceUsd:12,weight:100,attributes:{plug:'EU'}};
const available={status:'available',vid:'blue-s',sku:'SKU-BS',variantName:'Black-XL',optionKey:'Color-Black-Size-XL',stockQuantity:3,warehouses:[{id:'1',name:'CN',quantity:3,originCountry:'CN'}],supplierPriceMinor:4500,salePriceMinor:5863,shippingOptions:[{name:'Standard',priceMinor:750,additionalMinor:50,currency:'SAR',deliveryDays:'7-12',originCountry:'CN'}],checkedAt:'2026-09-24T00:00:00.000Z'};
function request(body:unknown={variantId:'blue-s',quantity:1},headers:Record<string,string>={}){return new Request(origin+'/api/cj/products/4/verify-variant',{method:'POST',headers:{Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json',...headers},body:JSON.stringify(body)});}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('NODE_ENV','production');mock.session.mockResolvedValue({uid:9});mock.access.mockResolvedValue(true);mock.row.mockResolvedValue(row);mock.details.mockReturnValue({variants:[variant]});mock.settings.mockResolvedValue({usdToSarX100:375});mock.verify.mockResolvedValue(available);mock.tax.mockResolvedValue({enabled:true,vatMinor:100,totalMinor:6763});});
afterEach(()=>vi.unstubAllEnvs());
describe('staff-only CJ exact-variant live check',()=>{
 it('validates current product option, live stock, freight and central tax without exposing source errors',async()=>{
  const response=await POST(request(),{params});const body=await response.json();expect(response.status).toBe(200);
  expect(body).toMatchObject({status:'available',vid:'blue-s',stockQuantity:3,shippingOptions:[{name:'Standard',vatEnabled:true,vatMinor:100,totalMinor:6763}]});
  expect(mock.verify).toHaveBeenCalledExactlyOnceWith('pid-1',expect.objectContaining({vid:'blue-s',variantSellPrice:12,variantSku:'SKU-BS'}),1,{},375,{otherCostsMinor:10,marginBps:3000,saleOverrideMinor:null});
  expect(mock.tax).toHaveBeenCalledExactlyOnceWith(5863,1,800);
 });
 it('requires an authenticated products:view grant',async()=>{
  mock.session.mockResolvedValueOnce(null);expect((await POST(request(),{params})).status).toBe(401);
  mock.access.mockResolvedValueOnce(false);expect((await POST(request(),{params})).status).toBe(403);
  expect(mock.verify).not.toHaveBeenCalled();
 });
 it('rejects invalid body, product and non-product VID before calling CJ',async()=>{
  expect((await POST(request({variantId:'other',quantity:1}),{params})).status).toBe(404);
  expect((await POST(request({variantId:'blue-s',quantity:0}),{params})).status).toBe(400);
  expect((await POST(request(),{params:Promise.resolve({id:'NaN'})})).status).toBe(400);
  expect(mock.verify).not.toHaveBeenCalled();
 });
 it.each(['inventory_error','freight_error','no_shipping','out_of_stock'] as const)('returns a safe disabled state on provider result %s',async status=>{
  mock.verify.mockResolvedValue({status,checkedAt:'2026-09-24T00:00:00.000Z',error:'private api key'});
  const response=await POST(request(),{params});const body=await response.json();expect(response.status).toBe(200);expect(body).toMatchObject({status});expect(JSON.stringify(body)).not.toContain('private api key');expect(mock.tax).not.toHaveBeenCalled();
 });
 it('rejects cross-origin requests',async()=>{
  expect((await POST(request(undefined,{Origin:'https://evil.example'}),{params})).status).toBe(403);expect(mock.verify).not.toHaveBeenCalled();
 });
});
