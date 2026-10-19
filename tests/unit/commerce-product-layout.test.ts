import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
vi.mock('@/app/shop/actions',()=>({remindRestockAction:async()=>{}}));
import {CommerceProductDetail} from '@/components/commerce/product-detail';
import type {PublicCommerceProduct} from '@/lib/commerce/public-product';
const product:PublicCommerceProduct={id:'42',title:'منتج اختبار',priceMinor:1200,stock:7,images:[],description:'وصف حقيقي',brand:'علامة',options:['المقاس: M، XL'],variants:[],requiresVariantSelection:false,featured:false,saudiShippingAvailable:true,deliveryEstimate:null,weightLabel:null,bundledShipping:false};
function render(changes:Partial<PublicCommerceProduct>={},similar:PublicCommerceProduct[]=[]){return renderToStaticMarkup(createElement(CommerceProductDetail,{product:{...product,...changes},similar,shippingFeeMinor:null,priceBasis:null,purchasingEnabled:false,shippingTerms:''}));}
describe('commerce detail layout',()=>{
 it('keeps the size guide in the purchase panel and offers real section targets',()=>{
  const html=render({},[product]);
  expect(html.indexOf('جدول معادلة المقاسات')).toBeLessThan(html.indexOf('</main>'));
  expect(html).toMatch(/جدول معادلة المقاسات[\s\S]*شراء الآن · غير متاح/);
  for(const id of ['description','specifications','shipping','returns','related']){expect(html).toContain(`href="#product-${id}"`);expect(html).toContain(`id="product-${id}"`);}
 });
 it('keeps exactly one size guide available with and without stock',()=>{
  for(const stock of [0,3]){
   const html=render({stock});
   expect(html.match(/data-size-reference="general"/g)||[]).toHaveLength(1);
   expect(html.indexOf('data-size-reference="general"')).toBeLessThan(html.indexOf('</main>'));
  }
 });
 it('omits navigation to absent descriptions, specifications and similar products',()=>{
  const html=render({description:'',brand:null,options:[]});
  expect(html).not.toContain('href="#product-description"');expect(html).not.toContain('href="#product-specifications"');expect(html).not.toContain('href="#product-related"');
 });
 it('preserves actual stock, restock state and disabled purchasing',()=>{
  expect(render({stock:3})).toContain('متوفر · الكمية المتاحة 3');
  const empty=render({stock:0});expect(empty).toContain('نفد المخزون');expect(empty).not.toContain('data-add-commerce-cart');
  expect(render()).toContain('الشراء والدفع غير متاحين حاليًا.');expect(render()).toMatch(/<button[^>]*disabled=""[^>]*>شراء الآن/);
 });
 it('renders true variant prices and stocks with required selection preserved',()=>{
  const variant={key:'m',vid:'VID-M',sku:'SKU-M',name:'M',options:['M'],attributes:{Size:'M'},image:null,priceMinor:1700,stock:2,originalPriceMinor:null,shippingMinor:null,deliveryEstimate:null};
  const html=render({requiresVariantSelection:true,variants:[variant,{...variant,key:'xl',name:'XL',options:['XL'],priceMinor:2500,stock:6}]});
  expect(html).toContain('يبدأ من');expect(html).toContain('17.00');expect(html).toContain('M — المتاح 2');expect(html).toContain('XL — المتاح 6');expect(html).toMatch(/data-add-commerce-cart[^>]*disabled=""/);
 });
});
