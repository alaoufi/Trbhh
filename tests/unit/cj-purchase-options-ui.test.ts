import {describe,it,expect,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('@/components/cj/cart-controls',()=>({useTrialCart:()=>({items:[],ready:true,save:vi.fn(),latest:()=>[]}),CartLink:()=>null}));
vi.mock('@/components/cj/cj-text',()=>({CjText:()=>null}));
import {CjPurchasePanel} from '@/components/cj/purchase-panel';
const base={productId:281,productPid:'pid',productName:'حذاء',accountId:1,isStaff:true};
const variant=(vid:string,key:string)=>({vid,variantSku:'SKU'+vid,variantName:key,variantKey:key,optionSchema:['Color','Size'],variantSellPrice:1,variantWeight:470,variantImage:null});
describe('readable purchase attributes before any cart insertion',()=>{
 it('renders separate color and size fields and starts disabled',()=>{
  const html=renderToStaticMarkup(createElement(CjPurchasePanel,{...base,variants:[variant('v1','Purple-36'),variant('v2','Purple-37')]}));
  expect(html).toContain('اختر اللون');expect(html).toContain('اختر المقاس');expect(html).toContain('بنفسجي');expect(html).toContain('disabled=""');
 });
 it('never renders a purchasable technical SKU fallback',()=>{
  const html=renderToStaticMarkup(createElement(CjPurchasePanel,{...base,variants:[variant('v1','SKU12345')]}));
  expect(html).toContain('بيانات خيارات المورد غير مكتملة أو ملتبسة');expect(html).not.toContain('الخيار المتاح');expect(html).toContain('disabled=""');
 });
});
