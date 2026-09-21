import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({requireAction:vi.fn(),schema:vi.fn(),load:vi.fn(),detail:vi.fn(),review:vi.fn(),approve:vi.fn(),updateSale:vi.fn(),hide:vi.fn(),remove:vi.fn(),revalidate:vi.fn()}));
vi.mock('@/lib/roles',()=>({requireAction:mocks.requireAction}));
vi.mock('@/lib/prisma',()=>({prisma:{}}));
vi.mock('@/lib/suppliers/schema',()=>({assertSupplierSchemaReady:mocks.schema}));
vi.mock('@/lib/suppliers/catalog-admin',()=>({loadCatalog:mocks.load,loadCatalogDetail:mocks.detail,reviewCatalogSelection:mocks.review,approveCatalogSelection:mocks.approve,updateCatalogProductSale:mocks.updateSale,hideCatalogProduct:mocks.hide,removeCatalogProduct:mocks.remove}));
vi.mock('next/cache',()=>({revalidatePath:mocks.revalidate}));
import {searchProducts,productDetails,reviewProducts,approveProducts,updateProductSale,hideProduct,removeProduct} from '@/app/admin/suppliers/catalog/actions';
beforeEach(()=>{vi.clearAllMocks();mocks.requireAction.mockResolvedValue({uid:7});mocks.schema.mockResolvedValue(undefined);});
describe('supplier catalog action boundary',()=>{
 it.each([
  ()=>searchProducts({query:'',supplierKey:'',page:1}),()=>productDetails('p_1'),
  ()=>reviewProducts([{key:'p_1',revision:1}]),()=>approveProducts({token:'x',confirmed:true,products:[]}),
  ()=>updateProductSale({key:'p_1',revision:1,mode:'source',selling:''}),
  ()=>hideProduct({key:'p_1',revision:1}),()=>removeProduct({key:'p_1',revision:1,confirmed:true}),
 ])('denies authorization before schema or catalog access',async run=>{
  mocks.requireAction.mockRejectedValueOnce(Error('forbidden'));
  await expect(run()).rejects.toThrow('forbidden');expect(mocks.schema).not.toHaveBeenCalled();
  for(const fn of [mocks.load,mocks.detail,mocks.review,mocks.approve,mocks.updateSale,mocks.hide,mocks.remove])expect(fn).not.toHaveBeenCalled();
 });
 it('requires edit permission even when a viewer can load the catalog',async()=>{
  mocks.requireAction.mockImplementation(async(_service,action)=>{if(action==='edit')throw Error('forbidden');return {uid:7};});
  await expect(reviewProducts([{key:'p_1',revision:1}])).rejects.toThrow('forbidden');
  await expect(approveProducts({token:'x',confirmed:true,products:[]})).rejects.toThrow('forbidden');
  await expect(updateProductSale({key:'p_1',revision:1,mode:'source',selling:''})).rejects.toThrow('forbidden');
  await expect(hideProduct({key:'p_1',revision:1})).rejects.toThrow('forbidden');
  await expect(removeProduct({key:'p_1',revision:1,confirmed:true})).rejects.toThrow('forbidden');expect(mocks.schema).not.toHaveBeenCalled();
 });
 it('returns only whitelisted failure messages and does not invalidate on failed approval',async()=>{
  mocks.approve.mockRejectedValue(Error('private token or SQL details'));
  const result=await approveProducts({token:'x',confirmed:true,products:[]});expect(result.error).toBeTruthy();expect(result.error).not.toContain('private');expect(mocks.revalidate).not.toHaveBeenCalled();
 });
 it('whitelists removal history failures without leaking internals',async()=>{
  mocks.remove.mockRejectedValue(Error('catalog_remove_history'));
  await expect(removeProduct({key:'p_1',revision:1,confirmed:true})).resolves.toEqual({error:'لا يمكن حذف المنتج لأن له سجل طلبات أو حجوزات. استخدم «إخفاء من تربح» بدلًا من الحذف.'});
  expect(mocks.revalidate).not.toHaveBeenCalled();
 });
});
