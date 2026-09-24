import {beforeEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({row:vi.fn()}));
vi.mock('@/lib/cj/mapping',()=>({getStorefrontCjProduct:mock.row}));
vi.mock('@/lib/cj/storefront',()=>({cjImg:(value:string)=>value,cjProductImages:(row:{image:string})=>row.image?[row.image]:[]}));
import {quoteCjTrialCart} from '@/lib/cj/trial-quote';
const product=(id=4)=>({id,hidden:0,name:'Source',name_ar:'سلعة',image:'https://example.test/item.jpg',currency:'SAR',sale_price_minor:1049,sale_price_override_minor:null,supplier_cost_minor:777,agent_user_id:99n,cj_product_id:'private-pid'});
beforeEach(()=>{vi.clearAllMocks();mock.row.mockImplementation(async(id:number)=>product(id));});
describe('saved CJ trial quote',()=>{
  it('uses current saved override and returns exact allowlisted fields only',async()=>{
    mock.row.mockResolvedValue({...product(),sale_price_override_minor:1099});
    expect(await quoteCjTrialCart([{id:4,qty:3}])).toEqual({currency:'SAR',lines:[{id:4,qty:3,title:'سلعة',image:'https://example.test/item.jpg',unitMinor:1099,currency:'SAR',totalMinor:3297}],totalMinor:3297,rejected:[]});
    expect(mock.row).toHaveBeenCalledExactlyOnceWith(4,false);
  });
  it('refreshes saved prices and combines repeated IDs before reading',async()=>{
    const first=await quoteCjTrialCart([{id:4,qty:1},{id:4,qty:2}]);expect(first.totalMinor).toBe(3147);expect(mock.row).toHaveBeenCalledTimes(1);
    mock.row.mockResolvedValue({...product(),sale_price_override_minor:1501});expect((await quoteCjTrialCart([{id:4,qty:3}])).totalMinor).toBe(4503);
  });
  it.each([null,{...product(),hidden:1},{...product(),id:7}])('removes unavailable, hidden or mismatched saved parents',async row=>{
    mock.row.mockResolvedValue(row);expect(await quoteCjTrialCart([{id:4,qty:1}])).toEqual({currency:'SAR',lines:[],totalMinor:0,rejected:[{id:4,reason:'unavailable'}]});
  });
  it.each([{sale_price_minor:0},{sale_price_minor:-1},{sale_price_minor:1.1},{sale_price_minor:NaN},{sale_price_minor:Infinity},{sale_price_minor:2147483648},{sale_price_override_minor:0},{currency:'USD'}])('excludes invalid amounts/currency rather than inventing a price %#',async patch=>{
    mock.row.mockResolvedValue({...product(),...patch});const quote=await quoteCjTrialCart([{id:4,qty:1}]);expect(quote.lines).toEqual([]);expect(quote.rejected).toEqual([{id:4,reason:'invalid_price'}]);
  });
  it('rejects cart overflow while never fetching CJ or creating an order',async()=>{
    mock.row.mockImplementation(async(id:number)=>({...product(id),sale_price_minor:2147483647}));
    await expect(quoteCjTrialCart([{id:4,qty:1},{id:5,qty:1}])).rejects.toThrow('invalid_total');
  });
  it.each(['javascript:alert(1)','http://example.test/photo.jpg','https://user:secret@example.test/photo.jpg'])('omits unsafe image URLs %s',async image=>{
    mock.row.mockResolvedValue({...product(),image});expect((await quoteCjTrialCart([{id:4,qty:1}])).lines[0].image).toBe(null);
  });
  it('validates before reading saved rows',async()=>{
    await expect(quoteCjTrialCart([{id:4,qty:1,unitMinor:1}])).rejects.toThrow('invalid_cart');expect(mock.row).not.toHaveBeenCalled();
  });
  it('does not substitute the raw supplier title when Arabic is missing',async()=>{
    mock.row.mockResolvedValue({...product(),name_ar:'',name:'Supplier source title'});
    expect((await quoteCjTrialCart([{id:4,qty:1}])).lines[0].title).toBe('منتج بانتظار ترجمة الاسم');
  });
});
