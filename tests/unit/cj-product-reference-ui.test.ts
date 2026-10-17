import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect,vi} from 'vitest';
import {ProductReference} from '@/components/cj/product-reference';
import {SupplierProductReferences} from '@/components/cj/supplier-product-references';
import {OrderVariantDetails} from '@/components/commerce/order-variant-details';
vi.stubGlobal('React',React);
describe('product reference presentation',()=>{
 it('shows a prominent copyable public number beside exact supplier identifiers',()=>{const html=renderToStaticMarkup(React.createElement(ProductReference,{id:281,pid:'pid-source',sku:'sku-source'}));expect(html).toContain('رقم المنتج في تربح:');expect(html).toContain('نسخ رقم المنتج 281');expect(html).toContain('pid-source');expect(html).toContain('sku-source');});
 it('links settlement items to the public product rather than the order or internal commerce ID',()=>{const html=renderToStaticMarkup(React.createElement(SupplierProductReferences,{products:[{storefrontProductId:'281',pid:'pid',vid:'vid',quantity:2}]}));expect(html).toContain('href="/cj/281"');expect(html).toContain('رقم المنتج لدى المورد:');expect(html).toContain('الكمية: 2');});
 it('retains the saved public and supplier references in customer order details',()=>{const html=renderToStaticMarkup(React.createElement(OrderVariantDetails,{value:{storefrontProductId:'281',pid:'supplier-pid',vid:'source-vid',sku:'source-sku',attributes:{اللون:'بنفسجي'}}}));for(const value of ['281','supplier-pid','source-vid','source-sku','بنفسجي'])expect(html).toContain(value);});
});
