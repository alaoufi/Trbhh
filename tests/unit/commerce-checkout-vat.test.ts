import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {ApprovedFiscalPolicy} from '@/lib/finance/fiscal-policy';
const mock=vi.hoisted(()=>({config:vi.fn(),product:vi.fn(),policy:vi.fn()}));
vi.mock('next/link',()=>({default:({href,children,...props}:{href:string;children:unknown;[key:string]:unknown})=>createElement('a',{href,...props},children as never)}));
vi.mock('@/lib/commerce/settings',()=>({getCommerceConfig:mock.config}));
vi.mock('@/lib/commerce/public-product',()=>({readPublicCommerceProduct:mock.product}));
vi.mock('@/lib/finance/fiscal-policy',()=>({readApprovedFiscalPolicy:mock.policy}));
vi.mock('@/lib/prisma',()=>({prisma:{}}));
vi.mock('next/navigation',()=>({notFound:()=>{throw Error('not_found');}}));
import CommerceProductPage from '@/app/shop/[id]/page';
function policy(enabled:boolean,basis:'inclusive'|'exclusive'='inclusive'):ApprovedFiscalPolicy{return{id:'1',requestId:'2',at:'2026-01-01T00:00:00.000Z',effectiveFrom:'2026-01-01',issuer:{name:'Fixture issuer',address:'Riyadh',taxNumber:enabled?'300000000000003':''},vatBps:1500,policyReference:'fixture-policy',calculationPolicy:{version:2,priceBasis:basis,itemScope:'uniform_catalog',shippingPriceBasis:basis,shippingVatBps:1500,discountTreatment:'none',rounding:'line_half_up',policyRollover:'hold_for_review',automationDelegateId:'9',vatControl:{enabled,registrationConfirmed:enabled,registrationEffectiveFrom:enabled?'2026-01-01':null,registrationThresholdMinor:37500000}}};}
const product={id:'7',title:'سلعة تجريبية',priceMinor:1025,stock:4,images:[],description:'',brand:null,options:[],variants:[],requiresVariantSelection:false,featured:false};
const render=async()=>renderToStaticMarkup(await CommerceProductPage({params:Promise.resolve({id:'7'})}));
beforeEach(()=>{vi.clearAllMocks();mock.config.mockResolvedValue({enabled:true,purchasingEnabled:false,paymentsEnabled:false,shippingFeeMinor:125,text:{shippingTerms:'شروط تجريبية',unavailable:'الشراء غير متاح'}});mock.product.mockResolvedValue(product);mock.policy.mockResolvedValue(policy(false));});
describe('commerce product page VAT and purchase gate',()=>{
 it.each(['inclusive','exclusive'] as const)('does not claim VAT is included or add it to display when central VAT is OFF (%s)',async basis=>{mock.policy.mockResolvedValue(policy(false,basis));const saved=JSON.stringify(policy(false,basis)),html=await render();expect(html).toContain('10.25');expect(html).not.toContain('شامل الضريبة');expect(html).not.toContain('قبل الضريبة');expect(html).toContain('رسوم التوصيل الحالية:');expect(html).toContain('الشراء والدفع غير متاحين حاليًا');expect(html).toContain('disabled=""');expect(JSON.stringify(policy(false,basis))).toBe(saved);});
 it.each(['inclusive','exclusive'] as const)('labels the approved tax price basis only when VAT is enabled (%s)',async basis=>{mock.policy.mockResolvedValue(policy(true,basis));const html=await render();expect(html).toContain(basis==='inclusive'?'شامل الضريبة':'قبل الضريبة');expect(html).toContain('الشراء والدفع غير متاحين حاليًا');expect(html).toContain('disabled=""');});
 it('keeps the product readable while a missing tax policy does not activate purchasing',async()=>{mock.policy.mockRejectedValue(Error('finance_tax_policy_missing'));const html=await render();expect(html).toContain('سلعة تجريبية');expect(html).not.toContain('قبل الضريبة');expect(html).toContain('الشراء والدفع غير متاحين حاليًا');expect(html).toContain('disabled=""');});
 it('hides products when public commerce is disabled',async()=>{mock.config.mockResolvedValue({enabled:false,purchasingEnabled:false,paymentsEnabled:false,text:{}});await expect(render()).rejects.toThrow('not_found');expect(mock.product).not.toHaveBeenCalled();});
});
