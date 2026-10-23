import {expect,it} from 'vitest';
import sql from '../../scripts/local-ai/public-product-select.cjs';
it('excludes all CJ linked products from shared public SQL regardless of readiness',()=>{
 expect(sql).toContain('AND NOT EXISTS (SELECT 1 FROM cj_products cj_private WHERE cj_private.commerce_product_id=cp.id)');
});
