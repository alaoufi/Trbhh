import {beforeEach,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({transaction:vi.fn(),raw:vi.fn(),write:vi.fn(),update:vi.fn(),redirect:vi.fn(),log:vi.fn(),version:1,exists:true}));
vi.mock('@/lib/roles',()=>({requireAction:async()=>({uid:1})}));
vi.mock('@/lib/prisma',()=>({prisma:{$transaction:state.transaction}}));
vi.mock('@/lib/redis',()=>({previewHashSet:vi.fn()}));
vi.mock('@/lib/settings',()=>({setSetting:vi.fn()}));
vi.mock('@/lib/data',()=>({bustAdCaches:vi.fn()}));
vi.mock('@/lib/error-log',()=>({logClientError:state.log}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('next/navigation',()=>({redirect:state.redirect}));
import {saveSubcategory} from '@/app/admin/categories/actions';
import {CATEGORY_SEED_TEMPLATES} from '@/lib/ad-categories/seed-templates';
import {changeFieldRequirement} from '@/lib/ad-categories/admin-presentation';
const field={key:'material',label:'المادة',type:'text',group:'',required:false,visible:true,order:0,options:[]};
function form(){const fd=new FormData();for(const [k,v] of Object.entries({id:'2',category_id:'1',version:'1',name:'سجاد',order:'0',kind:'goods',editor_section:'fields',fields_json:JSON.stringify([field])}))fd.set(k,v);return fd;}
beforeEach(()=>{
  vi.clearAllMocks();delete process.env.TRBHH_READ_ONLY_PREVIEW;state.exists=true;state.version=1;
  state.redirect.mockImplementation((url:string)=>{throw new Error('REDIRECT:'+url);});
  state.raw.mockImplementation(async(strings:TemplateStringsArray)=>{const sql=strings.join('');if(sql.includes('FROM categories'))return[{id:1n}];if(sql.includes('FROM sub_categories'))return[{category_id:1}];if(sql.includes('FROM ad_category_definitions'))return state.exists?[{version:state.version,fields_json:[field]}]:[];if(sql.includes('COUNT(*)'))return[{count:1n}];throw Error('Unexpected query');});
  state.transaction.mockImplementation(async fn=>fn({$queryRaw:state.raw,$executeRaw:state.write,sub_categories:{update:state.update}}));
});
it('returns the actual validation reason and Arabic field label without redirect or writes',async()=>{
  const fd=form();fd.set('fields_json',JSON.stringify([{...field,type:'select'}]));
  expect(await saveSubcategory(fd)).toMatchObject({error:{message:'أضف خيارات الحقل',fieldKey:'material',fieldLabel:'المادة'}});
  expect(state.transaction).not.toHaveBeenCalled();expect(state.redirect).not.toHaveBeenCalled();
});
it('rejects stale revisions with an actionable conflict and no overwrite',async()=>{
  state.version=2;
  expect(await saveSubcategory(form())).toMatchObject({error:{message:expect.stringContaining('مسؤول آخر')}});
  expect(state.write).not.toHaveBeenCalled();expect(state.update).not.toHaveBeenCalled();
});
it('saves the first definition when the admin submits the true persisted revision zero',async()=>{
  state.exists=false;const fd=form();fd.set('version','0');
  await expect(saveSubcategory(fd)).rejects.toThrow('REDIRECT:/admin/categories/subcategories/2/fields?saved=1');
  expect(state.write).toHaveBeenCalledTimes(2);
});
it('explains protected type changes instead of hiding the rule',async()=>{
  const fd=form();fd.set('fields_json',JSON.stringify([{...field,type:'number'}]));
  expect(await saveSubcategory(fd)).toMatchObject({error:{message:expect.stringContaining('لا يمكن تغيير نوع حقل مستخدم')}});
  expect(state.write).not.toHaveBeenCalled();
});
it.each(CATEGORY_SEED_TEMPLATES)('roundtrips $name and saves requirement/display changes without changing other fields',async template=>{
  state.exists=false;
  for(const mode of ['unchanged','required','optional','display'] as const){
    const fd=form();fd.set('version','0');fd.set('name',template.name);fd.set('kind',template.kind);
    fd.set('template_key',template.key);fd.set('listing_policy_json',JSON.stringify(template.listingPolicy));
    if(template.priceEnabled)fd.set('price_enabled','1');if(template.goodsEnabled)fd.set('goods_enabled','1');
    const fields=template.fields.map(field=>mode==='unchanged'?field:mode==='display'?{...field,showInCard:!field.showInCard}:changeFieldRequirement(field,mode));
    fd.set('fields_json',JSON.stringify(fields));
    await expect(saveSubcategory(fd)).rejects.toThrow('REDIRECT:/admin/categories/subcategories/2/fields?saved=1');
  }
});
