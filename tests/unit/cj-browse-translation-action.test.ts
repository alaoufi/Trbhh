import {beforeEach,describe,expect,it,vi} from 'vitest';

const state=vi.hoisted(()=>({keys:new Set<string>(),list:vi.fn(),detail:vi.fn(),translate:vi.fn(),write:vi.fn(),audit:vi.fn(),refresh:vi.fn()}));
vi.mock('next/navigation',()=>({redirect:(url:string)=>{throw Error('redirect:'+url);}}));
vi.mock('next/cache',()=>({revalidatePath:state.refresh}));
vi.mock('@/lib/access-control/guards',()=>({requireAccess:async(module:string,action:string)=>{if(!state.keys.has(`${module}:${action}`))throw Error('access_denied');return {uid:9};},hasAccess:vi.fn()}));
vi.mock('@/lib/auth',()=>({getSession:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:{cj_products:{findMany:state.write}}}));
vi.mock('@/lib/cj/client',()=>({listProductsPage:state.list,getProduct:state.detail,getCategories:vi.fn()}));
vi.mock('@/lib/cj/translate',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/cj/translate')>(),translateManyCached:state.translate,translateToArabic:vi.fn(),learnTranslation:state.write}));
vi.mock('@/lib/cj/audit',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/cj/audit')>(),auditCjChange:state.audit}));
vi.mock('@/lib/audit',()=>({logAdmin:vi.fn()}));
vi.mock('@/lib/cj/pricing',()=>({defaultMarginBps:vi.fn(),setDefaultMarginBps:state.write}));
vi.mock('@/lib/cj/sync',()=>({cjSyncSettings:vi.fn(),saveCjSyncSettings:state.write,syncCjCatalog:state.write}));
vi.mock('@/lib/cj/import',()=>({importCjProductByPid:state.write}));
vi.mock('@/lib/cj/mapping',()=>({removeCjProductById:state.write,setCjProductNameAr:state.write,setCjProductHidden:state.write,setCjProductPriceOverride:state.write,getCjProductById:state.write,listUntranslatedCjProducts:state.write,updateCjReview:state.write,setCjProductStatus:state.write,setCjProductDescriptionAr:state.write,setCjProductCategory:state.write,cjProductOrderCount:state.write}));
vi.mock('@/lib/cj/orders/store',()=>({createOrder:state.write,getOrderById:state.write,transitionOrder:state.write,setOrderTracking:state.write}));
vi.mock('@/lib/cj/translate-warm',()=>({warmCjTranslations:state.write,refreshCjMedia:state.write}));
vi.mock('@/lib/cj/storefront',()=>({cjStorefrontPublic:vi.fn(),setCjStorefrontPublic:state.write}));
vi.mock('@/lib/cj/access',()=>({cjProductCapabilities:vi.fn()}));
vi.mock('@/lib/cj/agents',()=>({getAgent:vi.fn(),defaultAgentWeeklyQuota:vi.fn(),upsertAgent:state.write,setDefaultAgentWeeklyQuota:state.write,setAgentActive:state.write,assignProductAgent:state.write,unassignProductAgent:state.write}));
import {translateCjBrowsePage} from '@/app/admin/suppliers/cj/actions';

const product=(index:number)=>({pid:`PID-${index}`,productName:`Source product ${index}`,categoryName:`Source category ${index}`});
function form(values:Record<string,string|undefined>={}){const out=new FormData();for(const [key,value] of Object.entries({page:'2',q:'private-query',cat:'CAT_2',back:'/admin/suppliers/cj/browse?page=2',...values}))if(value!==undefined)out.set(key,value);return out;}
beforeEach(()=>{
  vi.clearAllMocks();state.keys=new Set(['products:view','products:edit']);
  state.list.mockResolvedValue({ok:true,data:{items:[product(1)],total:1,pageNum:2,pageSize:24}});
  state.detail.mockResolvedValue({ok:true,data:{pid:'PID-1',productName:'Source detail',categoryName:'Detail category',variants:[{variantName:'Blue Large'}]}});
  state.translate.mockImplementation(async(names:string[])=>new Map(names.map(name=>[name,'ترجمة محفوظة'])));state.audit.mockResolvedValue(undefined);
});

describe('explicit CJ browse translation action',()=>{
  it.each([[],['products:view'],['products:edit'],['integrations:view','integrations:manage_settings']].map(keys=>({keys})))('rejects insufficient grants $keys before supplier or translation calls',async({keys})=>{
    state.keys=new Set(keys);await expect(translateCjBrowsePage(form())).rejects.toThrow('access_denied');
    expect(state.list).not.toHaveBeenCalled();expect(state.detail).not.toHaveBeenCalled();expect(state.translate).not.toHaveBeenCalled();expect(state.write).not.toHaveBeenCalled();expect(state.audit).not.toHaveBeenCalled();
  });
  it('re-fetches the exact current page with a fixed24-item limit and ignores posted source text',async()=>{
    await expect(translateCjBrowsePage(form({texts:'ATTACKER CONTENT',productName:'INJECTED'}))).rejects.toThrow('redirect:/admin/suppliers/cj/browse?page=2&page_translation=complete');
    expect(state.list).toHaveBeenCalledExactlyOnceWith(2,24,{productName:'private-query',categoryId:'CAT_2'});
    expect(state.translate).toHaveBeenCalledExactlyOnceWith(['Source product 1','Source category 1'],48);
    expect(state.write).not.toHaveBeenCalled();expect(state.detail).not.toHaveBeenCalled();expect(state.refresh).toHaveBeenCalledWith('/admin/suppliers/cj/browse');
    const audit=state.audit.mock.calls[0];expect(audit.slice(0,3)).toEqual([9,'products','browse-translation']);
    expect(audit[4]).toMatchObject({requested:2,available:2,queryFingerprint:expect.stringMatching(/^[0-9a-f]{24}$/)});
    expect(JSON.stringify(audit)).not.toMatch(/private-query|Source product|Source category|ATTACKER|INJECTED/);
  });
  it('caps an oversized upstream page and the source set at48 exact full names',async()=>{
    state.list.mockResolvedValue({ok:true,data:{items:Array.from({length:60},(_,i)=>product(i)),total:60}});
    await expect(translateCjBrowsePage(form())).rejects.toThrow('page_translation=complete');
    const [names,max]=state.translate.mock.calls[0];expect(names).toHaveLength(48);expect(max).toBe(48);
    expect(names).toContain('Source product 23');expect(names).not.toContain('Source product 24');expect(state.write).not.toHaveBeenCalled();
  });
  it('can translate chosen current-page detail names within the same48-missing-name budget',async()=>{
    await expect(translateCjBrowsePage(form({detail:'PID-1'}))).rejects.toThrow('page_translation=complete');
    expect(state.detail).toHaveBeenCalledExactlyOnceWith('PID-1');expect(state.translate.mock.calls[0][0]).toEqual(['Source product 1','Source category 1','Source detail','Detail category','Blue Large']);
    expect(state.write).not.toHaveBeenCalled();
  });
  it('retains bounded detail names on a full page and advances across repeated actions without false completion',async()=>{
    state.list.mockResolvedValue({ok:true,data:{items:Array.from({length:60},(_,i)=>product(i)),total:60}});
    state.detail.mockResolvedValue({ok:true,data:{pid:'PID-1',productName:'Source detail',categoryName:'Detail category',variants:Array.from({length:100},(_,i)=>({variantName:`Detail variant ${i}`}))}});
    const saved=new Map<string,string>();
    state.translate.mockImplementation(async(names:string[],budget:number)=>{
      for(const name of names.filter(name=>!saved.has(name)).slice(0,budget))saved.set(name,'ترجمة محفوظة');
      return new Map(names.filter(name=>saved.has(name)).map(name=>[name,saved.get(name)!]));
    });
    await expect(translateCjBrowsePage(form({detail:'PID-1'}))).rejects.toThrow('page_translation=partial');
    expect(state.audit.mock.calls[0][4]).toMatchObject({requested:98,available:48});
    await expect(translateCjBrowsePage(form({detail:'PID-1'}))).rejects.toThrow('page_translation=partial');
    expect(state.audit.mock.calls[1][4]).toMatchObject({requested:98,available:96});
    await expect(translateCjBrowsePage(form({detail:'PID-1'}))).rejects.toThrow('page_translation=complete');
    expect(state.audit.mock.calls[2][4]).toMatchObject({requested:98,available:98});
    for(const[names,budget]of state.translate.mock.calls){expect(names).toHaveLength(98);expect(names).toContain('Detail variant 47');expect(names).not.toContain('Detail variant 48');expect(names).not.toContain('Source product 24');expect(budget).toBe(48);}
    expect(state.write).not.toHaveBeenCalled();
  });
  it.each([{page:'0'},{page:'1.5'},{page:'10001'},{page:'2x'},{q:'x'.repeat(101)},{cat:'bad/id'},{detail:'../secret'}])('rejects invalid page/filter input %j before fetching',async input=>{
    await expect(translateCjBrowsePage(form(input))).rejects.toThrow('page_translation=invalid');expect(state.list).not.toHaveBeenCalled();expect(state.translate).not.toHaveBeenCalled();
  });
  it('normalizes an external return URL to the existing local fallback',async()=>{
    await expect(translateCjBrowsePage(form({back:'https://evil.example/'}))).rejects.toThrow('redirect:/admin/suppliers/cj/browse?page_translation=complete');
  });
  it('reports a partial saved result without claiming all names were translated',async()=>{
    state.translate.mockResolvedValue(new Map([['Source product 1','منتج']]));
    await expect(translateCjBrowsePage(form())).rejects.toThrow('page_translation=partial');expect(state.audit.mock.calls[0][4]).toMatchObject({requested:2,available:1});
  });
  it.each(['provider','translation','audit'])('returns only static safe feedback after %s failure',async failure=>{
    if(failure==='provider')state.list.mockRejectedValue(Error('PRIVATE credential details'));
    if(failure==='translation')state.translate.mockRejectedValue(Error('PRIVATE database details'));
    if(failure==='audit')state.audit.mockRejectedValue(Error('PRIVATE audit details'));
    await expect(translateCjBrowsePage(form())).rejects.toThrow('redirect:/admin/suppliers/cj/browse?page=2&page_translation=unavailable');expect(state.write).not.toHaveBeenCalled();
  });
});
