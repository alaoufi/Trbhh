vi.mock('@/lib/cj/verified-pricing',()=>({readVerifiedCjPricing:async()=>({usdToSarX100:375,marginBps:3000})}));
import {beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({query:vi.fn(),ready:vi.fn(),semantic:vi.fn()}));
vi.mock('@/lib/ai/product-search',()=>({semanticProductSearch:state.semantic}));
vi.mock('@/lib/prisma',()=>({prisma:{$queryRaw:state.query}}));
vi.mock('@/lib/commerce/schema',()=>({assertCommerceSchemaReady:state.ready,COMMERCE_DDL:[]}));
import {readSimilarPublicCommerceProducts,readPublicCommerceProduct,searchPublicCommerceProducts,searchTrbhhProducts} from '@/lib/commerce/public-product';
const row={id:20n,title:'<b>مطرقة اختبار</b>',price_minor:1000,stock_available:10,stock_reserved:1,images:['http://unsafe.test/x.webp','https://images.example/a.webp','/media/b.webp'],description:'<script>bad()</script> وصف صحيح',brand:'علامة',options:[{name:'اللون',values:['أسود','أحمر']}],variants:[{externalId:'variant-4',name:'أسود / XL / 220V / EU',sku:'CJ-XL-BLK',publicPriceMinor:1200,quantity:5,available:true,image:'https://images.example/black-xl.webp',options:{Color:'Black',Size:'XL',Voltage:'220V',Plug:'EU',Material:'Steel'}}],available:1,quantity:8,featured:1,source_id:8n,cj_source_id:null,cj_availability_json:null,cj_details_json:null};
const cjProof=(vid='VID-1',stock=7)=>JSON.stringify({checkedAt:new Date().toISOString(),stockQuantity:stock,variants:[{vid,stockQuantity:stock,shippingOptions:[{name:'CJ Packet',priceMinor:1575,currency:'SAR',deliveryDays:'8-15 days',originCountry:'CN'}]}],shippingOptions:[{name:'CJ Packet',priceMinor:1575,currency:'SAR',deliveryDays:'8-15 days',originCountry:'CN'}]});
describe('public commerce product filtering',()=>{
 beforeEach(()=>{vi.resetAllMocks();state.ready.mockResolvedValue(undefined);state.query.mockResolvedValue([row]);});
 it('rehydrates semantic rank with fresh eligibility and suppresses unavailable candidates',async()=>{
  state.semantic.mockResolvedValue({mode:'semantic',ids:['21','20','22']});
  state.query.mockResolvedValue([{...row,id:20n},{...row,id:21n},{...row,id:22n,cj_source_id:1n,cj_availability_json:null}]);
  const result=await searchTrbhhProducts('drill');expect(result.mode).toBe('semantic');expect(result.products.map(p=>p.id)).toEqual(['21','20']);
  expect(state.query.mock.calls[0][0].sql).toContain('cp.approved=1 AND cp.visible=1 AND cp.enabled=1');
  expect(state.query.mock.calls[0][0].values).toEqual([21n,20n,22n]);
 });
 it('reports literal fallback with original query and no generated interpretations',async()=>{
  state.semantic.mockResolvedValue({mode:'fallback',ids:[]});
  expect((await searchTrbhhProducts('drill 18V')).mode).toBe('literal');
  expect(state.query.mock.calls[0][0].values).toEqual(['drill','drill','drill','18V','18V','18V',100]);
 });
 it('searches saved eligible products before the result limit using bound text parameters only',async()=>{
  const products=await searchPublicCommerceProducts('شي يرتب مطبخ', ['منظم مطبخ']);
  expect(products).toHaveLength(1);
  const query=state.query.mock.calls[0][0];
  expect(query.sql).toContain('cp.approved=1 AND cp.visible=1 AND cp.enabled=1');
  expect(query.sql).toContain('LOCATE(');expect(query.sql).not.toContain('منظم');
  expect(query.sql).toContain('sp.description');expect(query.sql).toContain('sp.brand');
  expect(query.sql).not.toContain('cp.description');expect(query.sql).not.toContain('cp.brand');
  expect(query.values).toContain('منظم');expect(query.values.at(-1)).toBe(100);
  expect(query.sql.indexOf('LOCATE(')).toBeLessThan(query.sql.lastIndexOf('LIMIT'));
 });
 it('does not search the entire catalog for an empty search phrase',async()=>{
  expect(await searchPublicCommerceProducts(' ',['منظم'])).toEqual([]);expect(state.query).not.toHaveBeenCalled();
 });
 it('returns only sanitized customer-facing product data and available variants',async()=>{const product=await readPublicCommerceProduct(20n);expect(product).toMatchObject({id:'20',title:'مطرقة اختبار',priceMinor:1000,stock:5,images:['https://images.example/a.webp','/media/b.webp'],description:'وصف صحيح',brand:'علامة',requiresVariantSelection:true,variants:[{key:'variant-4',name:'أسود / XL / 220V / EU',priceMinor:1200,stock:5}]});expect(JSON.stringify(product)).not.toMatch(/supplier|cost|margin|external_id|commerce_product/i);});
 it('retains every real provider option, SKU, and variant image dynamically without inventing a VID',async()=>{const product=await readPublicCommerceProduct(20n);expect(product?.variants[0]).toMatchObject({key:'variant-4',vid:null,sku:'CJ-XL-BLK',image:'https://images.example/black-xl.webp',attributes:{Color:'Black',Size:'XL',Voltage:'220V',Plug:'EU',Material:'Steel'}});expect(JSON.stringify(product)).not.toMatch(/supplier|cost|margin|external_id|commerce_product/i);});
 it('hides products with options when no verified available variant exists',async()=>{state.query.mockResolvedValue([{...row,variants:'[]'}]);await expect(readPublicCommerceProduct(20n)).resolves.toBeNull();});
 it('does not present an empty option definition as a selectable choice on ordinary products',async()=>{state.query.mockResolvedValue([{...row,source_id:null,variants:'[]',options:JSON.stringify([{name:'اللون',values:[]}])}]);await expect(readPublicCommerceProduct(20n)).resolves.toMatchObject({requiresVariantSelection:false,options:[]});});
 it('hides a product whose real choices exist but have no valid variants to select',async()=>{state.query.mockResolvedValue([{...row,source_id:null,variants:'[]',options:JSON.stringify([{name:'المقاس',values:['S','M']}])}]);await expect(readPublicCommerceProduct(20n)).resolves.toBeNull();});
 it('scenario 5: product with no stock is excluded, and invalid identifiers are rejected',async()=>{state.query.mockResolvedValue([{...row,source_id:null,options:'[]',variants:'[]',stock_available:0}]);await expect(readPublicCommerceProduct(20n)).resolves.toBeNull();await expect(readPublicCommerceProduct(0n)).resolves.toBeNull();});
 it('hides a CJ-linked commerce product without a valid Saudi stock and freight proof',async()=>{state.query.mockResolvedValue([{...row,cj_source_id:5n,cj_availability_json:null}]);await expect(readPublicCommerceProduct(20n)).resolves.toBeNull();});
 it('scenario 6: product with stock but no Saudi shipping quote is excluded',async()=>{state.query.mockResolvedValue([{...row,cj_source_id:5n,cj_availability_json:JSON.stringify({checkedAt:new Date().toISOString(),stockQuantity:7,shippingOptions:[]})}]);await expect(readPublicCommerceProduct(20n)).resolves.toBeNull();});
 it('hides a CJ product with product-level stock/shipping but no per-variant proof',async()=>{state.query.mockResolvedValue([{...row,cj_source_id:5n,cj_availability_json:JSON.stringify({checkedAt:new Date().toISOString(),stockQuantity:7,shippingOptions:[{name:'CJ Packet',priceUsd:4.2,deliveryDays:'8-15 days',originCountry:'CN'}]}),cj_details_json:JSON.stringify({weightMin:350,weightMax:420,variants:[{vid:'VID-1',name:'Black',sku:'S',priceUsd:2}]})}]);await expect(readPublicCommerceProduct(20n)).resolves.toBeNull();});
 it('returns a CJ-linked product only with a fresh per-VID stock and Saudi freight proof without exposing the carrier name',async()=>{state.query.mockResolvedValue([{...row,cj_source_id:5n,cj_availability_json:cjProof(),cj_details_json:JSON.stringify({weightMin:350,weightMax:420,variants:[{vid:'VID-1',name:'Black',sku:'S',priceUsd:2}]})}]);const product=await readPublicCommerceProduct(20n);expect(product).toMatchObject({saudiShippingAvailable:true,deliveryEstimate:'من 8 إلى 15 يوم',weightLabel:'350–420 غ',variants:[{vid:'VID-1',stock:7}]});expect(JSON.stringify(product)).not.toContain('CJ Packet');});
 it('builds CJ variants by VID only when the same VID has stock and its own shipping proof',async()=>{state.query.mockResolvedValue([{...row,cj_source_id:5n,cj_availability_json:cjProof('VID-1',2),cj_details_json:JSON.stringify({variants:[{vid:'VID-1',name:'Black XL',sku:'CJ-SKU-1',priceUsd:4,optionKey:'Color:Black; Size:XL; Voltage:220V; Plug:EU',attributes:{variantWeight:1200,length:30,width:20,height:10,variantImage:'https://images.example/black.webp',variantSellPrice:9.4}}]})}]);const product=await readPublicCommerceProduct(20n);expect(product?.variants).toHaveLength(1);expect(product?.variants[0]).toMatchObject({key:'VID-1',vid:'VID-1',sku:'CJ-SKU-1',image:'https://images.example/black.webp',attributes:{Color:'Black',Size:'XL',Voltage:'220V',Plug:'EU',variantWeight:'1200',length:'30',width:'20',height:'10'},priceMinor:1950,stock:2});});
 it('hides the entire CJ product when any listed variant lacks exact Saudi shipping proof',async()=>{state.query.mockResolvedValue([{...row,cj_source_id:5n,cj_availability_json:cjProof('VID-1',2),cj_details_json:JSON.stringify({variants:[{vid:'VID-1',name:'Black',sku:'S1',priceUsd:4},{vid:'VID-2',name:'Red',sku:'S2',priceUsd:5}]})}]);await expect(readPublicCommerceProduct(20n)).resolves.toBeNull();});
 // سلعة العضو الموثوق (بضاعته هو): لا مورّد ولا CJ — المخزون من commerce_products، والشحن مشمول بالإجمالي.
 const ownGoods={id:30n,title:'سلعة عضو',price_minor:6000,stock_available:10,stock_reserved:2,seller_type:'verified_member',images:['https://images.example/a.webp'],description:'وصف',brand:'',options:null,variants:null,available:null,quantity:null,featured:0,source_id:null,cj_source_id:null,cj_availability_json:null,cj_details_json:null};
 it('shows a verified-member own-goods product with stock from commerce_products and shipping bundled into the total',async()=>{state.query.mockResolvedValue([ownGoods]);const product=await readPublicCommerceProduct(30n);expect(product).toMatchObject({id:'30',priceMinor:6000,stock:8,bundledShipping:true,saudiShippingAvailable:true,requiresVariantSelection:false});});
 it('keeps a verified-member product visible at zero available stock (for the restock reminder) instead of hiding it',async()=>{state.query.mockResolvedValue([{...ownGoods,stock_reserved:10}]);const product=await readPublicCommerceProduct(30n);expect(product).toMatchObject({id:'30',stock:0,bundledShipping:true});});
 it('a non-own-goods product with zero stock stays hidden',async()=>{state.query.mockResolvedValue([{...ownGoods,seller_type:'trbhh',stock_reserved:10}]);await expect(readPublicCommerceProduct(30n)).resolves.toBeNull();});
});
it('uses source costs for each CJ variant instead of one stale parent price',async()=>{const proof=JSON.parse(cjProof());proof.variants.push({...proof.variants[0],vid:'VID-2'});proof.stockQuantity=14;state.query.mockResolvedValue([{...row,price_minor:1000,cj_source_id:5n,cj_availability_json:JSON.stringify(proof),cj_details_json:JSON.stringify({variants:[{vid:'VID-1',name:'Small',sku:'S1',priceUsd:4},{vid:'VID-2',name:'Large',sku:'S2',priceUsd:5}]})}]);const product=await readPublicCommerceProduct(20n);expect(product?.priceMinor).toBe(1950);expect(product?.variants.map(v=>v.priceMinor)).toEqual([1950,2438]);expect(JSON.stringify(product)).not.toMatch(/supplier|margin|cost/);});

it('keeps CJ recommendations on the same current pricing policy',async()=>{state.query.mockResolvedValue([{...row,cj_source_id:5n,cj_other_costs_minor:100,cj_availability_json:cjProof(),cj_details_json:JSON.stringify({variants:[{vid:'VID-1',name:'Black',sku:'S1',priceUsd:4}]})}]);const products=await readSimilarPublicCommerceProducts(21n);expect(products[0].variants[0].priceMinor).toBe(2080);expect(products[0].priceMinor).toBe(2080);});
