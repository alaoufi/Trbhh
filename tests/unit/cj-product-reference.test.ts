import {describe,it,expect} from 'vitest';
import {supplierQuoteReferences} from '@/lib/cj/product-reference';
import {supplierProductReferences} from '@/lib/cj/fulfillment/provider';
import type {Commitment} from '@/lib/cj/fulfillment/worker';
const line={productId:'999',storefrontProductId:'281',pid:'supplier-12',vid:'variant-34',quantity:2};
describe('stable product reference across supplier transactions',()=>{
 it('sends the public product number in documented supplier fields without changing exact variant/quantity',()=>{
 const c={supplierReference:'order-123',lines:[line]} as unknown as Commitment;
 expect(supplierProductReferences(c)).toEqual([{vid:'variant-34',quantity:2,storeProductId:'281',storeLineItemId:'order-123-281-0'}]);
 });
 it('never substitutes internal commerce IDs for old orders',()=>{const {storefrontProductId,...old}=line;expect(supplierQuoteReferences({lines:[old]})[0].storefrontProductId).toBeNull();expect(supplierProductReferences({supplierReference:'old',lines:[old]} as unknown as Commitment)).toEqual([{vid:'variant-34',quantity:2}]);});
 it('rejects a malformed outbound reference before API transmission',()=>{expect(()=>supplierProductReferences({supplierReference:'o',lines:[{...line,storefrontProductId:'281;bad'}]} as unknown as Commitment)).toThrow('supplier_product_reference_invalid');});
 it('reads stored settlement references and quantities without inventing missing IDs',()=>{expect(supplierQuoteReferences(JSON.stringify({lines:[line]}))).toEqual([{storefrontProductId:'281',pid:'supplier-12',vid:'variant-34',quantity:2}]);expect(supplierQuoteReferences('{')).toEqual([]);expect(supplierQuoteReferences({lines:[{...line,vid:'<script>'}]})).toEqual([]);});
});
