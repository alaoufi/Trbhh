import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
const read=(p:string)=>fs.readFileSync(p,'utf8');
describe('shared product zoom coverage',()=>{
 it.each(['src/components/cj/product-gallery.tsx','src/components/ad-gallery.tsx','src/components/commerce/product-detail.tsx'])('uses shared magnifier for %s',p=>{expect(read(p)).toContain('ProductImageZoom');expect(read(p)).toContain('<ProductImageZoom');});
 it('retains CJ product measurements beside the size selector',()=>{const code=read('src/components/cj/purchase-panel.tsx');expect(code).toContain("group.label==='المقاس'");expect(code).toContain('CjSizeChartTable');});
});
