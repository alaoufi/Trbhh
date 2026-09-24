import {beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({products:vi.fn(),config:vi.fn(),gateway:vi.fn(),policy:vi.fn(),productQuote:vi.fn(),shippingQuote:vi.fn(),attempt:vi.fn()}));
vi.mock('@/lib/commerce/public-product',()=>({readPublicCommerceProducts:state.products}));
vi.mock('@/lib/commerce/settings',()=>({getCommerceConfig:state.config}));
vi.mock('@/lib/commerce/runtime',()=>({getCommerceGateway:state.gateway}));
vi.mock('@/lib/finance/fiscal-policy',()=>({readApprovedFiscalPolicy:state.policy}));
vi.mock('@/lib/finance/order-fiscal-snapshot',()=>({quoteFiscalProduct:state.productQuote,quoteFiscalShipping:state.shippingQuote}));
vi.mock('@/lib/auth-security',()=>({takeSecurityAttempt:state.attempt}));
vi.mock('@/lib/prisma',()=>({prisma:{}}));
import {POST} from '@/app/api/shop/cart/route';
const product={id:'20',title:'حذاء اختبار',priceMinor:1000,stock:8,images:['https://images.example/item.webp'],description:'',brand:null,options:['المقاس'],variants:[{key:'size-42',name:'42',options:['المقاس 42'],priceMinor:1200,stock:3}],requiresVariantSelection:true,featured:false};
async function send(body:unknown){return POST(new Request('https://trbhh.test/api/shop/cart',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));}
describe('commerce cart server quote',()=>{
 beforeEach(()=>{vi.resetAllMocks();state.products.mockResolvedValue(new Map([['20',product]]));state.config.mockResolvedValue({purchasingEnabled:false,enabled:true,paymentsEnabled:true,shippingFeeMinor:500,text:{shippingTerms:'known policy'}});state.gateway.mockResolvedValue({ready:true});state.policy.mockResolvedValue({});state.productQuote.mockImplementation((_policy:{},line:{quantity:number;unitPriceMinor:number})=>({netMinor:line.unitPriceMinor*line.quantity,vatMinor:0,grossMinor:line.unitPriceMinor*line.quantity}));state.shippingQuote.mockReturnValue({netMinor:500,vatMinor:0,grossMinor:500});state.attempt.mockResolvedValue(true);});
 it('rechecks selected variant price and stock and never enables purchasing while centrally OFF',async()=>{const response=await send({items:[{productId:'20',quantity:2,variantKey:'size-42'}]}),body=await response.json();expect(response.status).toBe(200);expect(body).toMatchObject({subtotalMinor:2400,discountMinor:0,shippingFeeMinor:500,shippingTotalMinor:500,totalMinor:2900,pricingVerified:true,checkoutReady:false,deliveryEstimate:null});expect(body.lines[0]).toMatchObject({variantName:'42',unitPriceMinor:1200,stock:3,available:true});expect(JSON.stringify(body)).not.toMatch(/supplierName|supplier_id|unit_cost|margin|cjProduct/i);});
 it('marks a stale or missing variant unavailable without substituting a different option',async()=>{const response=await send({items:[{productId:'20',quantity:1,variantKey:'wrong-key'}]}),body=await response.json();expect(body.lines[0].available).toBe(false);expect(state.productQuote).not.toHaveBeenCalled();});
 it('fails closed when quote request is invalid or rate limited',async()=>{expect((await send({items:[{productId:'0',quantity:1}]})).status).toBe(400);state.attempt.mockResolvedValue(false);expect((await send({items:[{productId:'20',quantity:1,variantKey:'size-42'}]})).status).toBe(429);expect(state.products).not.toHaveBeenCalled();});
});
