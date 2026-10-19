import {describe,it,expect,vi,beforeEach} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {Children,isValidElement} from 'react';
const fixture=vi.hoisted(()=>({product:{id:1,cj_product_id:'p1',name:'منتج',name_ar:'منتج',source_description:'وصف المنتج',trbhh_category:'أحذية',agent_user_id:null} as Record<string,unknown>,others:[] as unknown[],staff:true,preview:{cjSourceId:null as number|null,title:'سلعة معتمدة',images:[],href:'/cj/approved/1',priceMinor:1000,stock:1,description:'وصف معتمد'}}));
vi.mock('next/navigation',()=>({notFound:()=>{throw new Error('not-found')},redirect:()=>{throw new Error('redirect')}}));
vi.mock('@/lib/cj/approved-catalog',()=>({getApprovedPreview:async()=>fixture.preview}));
vi.mock('@/lib/auth',()=>({getSession:async()=>({uid:1})}));
vi.mock('@/lib/cj/access',()=>({cjProductCapabilities:async()=>({})}));
vi.mock('@/lib/cj/agents',()=>({getAgent:async()=>null,agentContactLinks:()=>null}));
vi.mock('@/lib/cj/mapping',()=>({cjProductOrderCount:async()=>0,getStorefrontCjProduct:async()=>fixture.product,getVerifiedCjVariants:()=>[],listStorefrontCjProducts:async()=>fixture.others,parseCjDetails:()=>null}));
vi.mock('@/lib/cj/storefront',()=>({cjStorefrontView:async()=>({isStaff:fixture.staff,isPublic:false}),cjImg:(v:unknown)=>v,cjProductImages:()=>[]}));
vi.mock('@/lib/cj/translate',()=>({translateManyForDisplay:async()=>new Map()}));
vi.mock('@/lib/cj/variant-display-server',()=>({translateVariantOptions:async()=>({})}));
vi.mock('@/lib/cj/option-metadata-server',()=>({enrichCjOptionMetadata:async()=>[]}));
vi.mock('@/lib/cj/size-chart-server',()=>({readCjSizeChart:async()=>null}));
vi.mock('@/lib/data',()=>({getCategories:async()=>[],getSubCategories:async()=>[]}));
vi.mock('@/components/share-buttons',()=>({ShareButtons:()=>null}));
vi.mock('@/components/cj/product-reference',()=>({ProductReference:()=>null}));
vi.mock('@/components/cj/product-gallery',()=>({CjProductGallery:()=>null}));
vi.mock('@/components/cj/cj-text',()=>({CjText:()=>null}));
vi.mock('@/components/cj/product-description',()=>({CjProductDescription:({text}:{text:string})=>text}));
vi.mock('@/components/cj/product-card',()=>({CjProductCard:()=>null}));
vi.mock('@/components/cj/category-ref-picker',()=>({CategoryRefPicker:()=>null}));
vi.mock('@/components/cj/cart-controls',()=>({CartLink:()=>null}));
vi.mock('@/components/cj/purchase-panel',()=>({CjPurchasePanel:()=>null}));
vi.mock('@/components/cj/submit-button',()=>({SubmitButton:()=>null}));
vi.mock('@/components/size-reference-guide',()=>({SizeReferenceGuide:()=>null}));
vi.mock('@/app/admin/suppliers/cj/actions',()=>({saveCjStorefrontEdit:()=>{},hideCjStorefront:()=>{},deleteCjStorefront:()=>{}}));
import CjStoreProductPage from '@/app/cj/[id]/page';
import ApprovedPreviewPage from '@/app/cj/approved/[id]/page';
async function renderPage(){return renderToStaticMarkup(await CjStoreProductPage({params:Promise.resolve({id:'1'}),searchParams:Promise.resolve({})}));}
describe('CJ product section navigation',()=>{
 beforeEach(()=>{fixture.staff=true;fixture.preview.cjSourceId=null;fixture.product.trbhh_category='أحذية';fixture.product.source_description='وصف المنتج';fixture.others=[];});
 it('links only to rendered sections and gives details the full page width',async()=>{
  const page=await CjStoreProductPage({params:Promise.resolve({id:'1'}),searchParams:Promise.resolve({})});
  const sections=Children.toArray(page.props.children).filter(isValidElement);
  expect(sections.some(section=>(section.props as {id?:string}).id==='cj-specs')).toBe(true);
  expect(sections.some(section=>(section.props as {id?:string}).id==='cj-description')).toBe(true);
  const html=renderToStaticMarkup(page);
  expect(html).toContain('href="#cj-specs"');expect(html).toContain('href="#cj-description"');
  const targets=[...html.matchAll(/href="#(cj-[^"]+)"/g)].map(match=>match[1]);
  expect(targets).toContain('cj-guarantees');
  for(const target of targets)expect(html).toContain(`id="${target}"`);
  expect(html).not.toContain('lg:row-span-2');expect(html).not.toContain('lg:row-start-2');
  expect(html).toMatch(/<section[^>]*id="cj-specs"[^>]*scroll-mt/);
 });
 it('omits navigation to absent optional content',async()=>{
  fixture.product.trbhh_category=null;fixture.product.source_description='';
  const html=await renderPage();
  expect(html).not.toContain('href="#cj-specs"');expect(html).not.toContain('href="#cj-description"');expect(html).not.toContain('href="#cj-related"');
 });
 it('includes related navigation only when related products exist',async()=>{
  fixture.others=[{id:2}];const html=await renderPage();
  expect(html).toContain('href="#cj-related"');expect(html).toContain('id="cj-related"');
 });
 it('renders approved preview navigation without purchase controls',async()=>{
  const html=renderToStaticMarkup(await ApprovedPreviewPage({params:Promise.resolve({id:'1'})}));
  expect(html).toContain('href="#cj-approved-description"');expect(html).toContain('id="cj-approved-description"');
  expect(html).not.toContain('id="cj-buy"');expect(html).not.toContain('<form');
 });
 it('preserves approved preview access and source redirection',async()=>{
  fixture.staff=false;await expect(ApprovedPreviewPage({params:Promise.resolve({id:'1'})})).rejects.toThrow('not-found');
  fixture.staff=true;fixture.preview.cjSourceId=1;
  await expect(ApprovedPreviewPage({params:Promise.resolve({id:'1'})})).rejects.toThrow('redirect');
 });
 it('preserves the private staff access boundary',async()=>{
  fixture.staff=false;await expect(renderPage()).rejects.toThrow('not-found');
 });
});
