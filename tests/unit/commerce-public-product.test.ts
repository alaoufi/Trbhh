import {beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({query:vi.fn(),ready:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:{$queryRaw:state.query}}));
vi.mock('@/lib/commerce/schema',()=>({assertCommerceSchemaReady:state.ready}));
import {readPublicCommerceProduct} from '@/lib/commerce/public-product';
const row={id:20n,title:'<b>مطرقة اختبار</b>',price_minor:1000,stock_available:10,stock_reserved:1,images:['http://unsafe.test/x.webp','https://images.example/a.webp','/media/b.webp'],description:'<script>bad()</script> وصف صحيح',brand:'علامة',options:[{name:'اللون'}],variants:[{externalId:'variant-4',name:'أحمر',publicPriceMinor:1200,quantity:5,available:true,options:{اللون:'أحمر'}}],available:1,quantity:8,featured:1,source_id:8n};
describe('public commerce product filtering',()=>{
 beforeEach(()=>{vi.resetAllMocks();state.ready.mockResolvedValue(undefined);state.query.mockResolvedValue([row]);});
 it('returns only sanitized customer-facing product data and available variants',async()=>{const product=await readPublicCommerceProduct(20n);expect(product).toMatchObject({id:'20',title:'مطرقة اختبار',priceMinor:1000,stock:5,images:['https://images.example/a.webp','/media/b.webp'],description:'وصف صحيح',brand:'علامة',requiresVariantSelection:true,variants:[{key:'variant-4',name:'أحمر',priceMinor:1200,stock:5}]});expect(JSON.stringify(product)).not.toMatch(/supplier|cost|margin|external_id|commerce_product/i);});
 it('hides products with options when no verified available variant exists',async()=>{state.query.mockResolvedValue([{...row,variants:'[]'}]);await expect(readPublicCommerceProduct(20n)).resolves.toBeNull();});
 it('hides unsourced products without stock and refuses invalid identifiers',async()=>{state.query.mockResolvedValue([{...row,source_id:null,options:'[]',variants:'[]',stock_available:0}]);await expect(readPublicCommerceProduct(20n)).resolves.toBeNull();await expect(readPublicCommerceProduct(0n)).resolves.toBeNull();});
});
