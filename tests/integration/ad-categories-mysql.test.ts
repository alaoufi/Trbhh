import {beforeAll,afterAll,beforeEach,describe,it,expect,vi} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const activation=createRequire(import.meta.url)('../../scripts/release/activate-categories.cjs');
import {CATEGORY_DDL} from '@/lib/ad-categories/schema';
const fixture=vi.hoisted(()=>({client:undefined as PrismaClient|undefined}));
vi.mock('@/lib/prisma',()=>({get prisma(){return fixture.client;}}));
vi.mock('@/lib/settings',()=>({getSetting:async(k:string,fallback:string)=>{const r=await fixture.client!.site_settings.findUnique({where:{k}});return r?.v??fallback;}}));
import {writeAdWithCategory,getPublicCategories} from '@/lib/ad-categories/service';
const enabled=process.env.CATEGORIES_DB_TESTS==='1';
let client:PrismaClient,admin:PrismaClient,created=false;
const f={key:'condition',label:'الحالة',type:'select',group:'المواصفات',required:true,visible:true,order:0,options:['جديد','مستعمل']};
function form(version='1'){const fd=new FormData();for(const [k,v] of Object.entries({category_id:'12',subcategory_id:'34',category_version:version,category_values:'{"condition":"جديد"}'}))fd.set(k,v);return fd;}
const base={title:'Fixture ad',detail:'Original details',price:50,adsType:'offer' as const,user_id:1n,city_id:1n,category_id:12n,video_path:'',adsSpecial:'no' as const,state:'active' as const};
const create=(fd=form())=>writeAdWithCategory(client,fd,(tx,s)=>tx.ads.create({data:{...base,...(s?{category_id:s.category_id,subcategory_id:s.subcategory_id}: {})}}));
describe.skipIf(!enabled)('real ad category MySQL integration',()=>{
  beforeAll(async()=>{
    const url=new URL(process.env.CATEGORIES_TEST_DATABASE_URL||'');
    if(url.protocol!=='mysql:'||url.hostname!=='127.0.0.1'||url.port!=='33309'||url.pathname!=='/trbhh_categories_test'||url.search||url.hash)throw new Error('Refusing non-isolated category database');
    client=new PrismaClient({datasourceUrl:url.href});fixture.client=client;url.pathname='/mysql';admin=new PrismaClient({datasourceUrl:url.href});
    await admin.$executeRawUnsafe('CREATE DATABASE trbhh_categories_test');created=true;
    const sql=execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','diff','--from-empty','--to-schema-datamodel','prisma/schema.prisma','--script'],{encoding:'utf8',env:{...process.env,DATABASE_URL:process.env.CATEGORIES_TEST_DATABASE_URL}});
    for(const table of ['ads','categories','sub_categories','site_settings','commerce_suppliers']){
      const ddl=sql.match(new RegExp('CREATE TABLE `'+table+'`[\\s\\S]*?;'))?.[0];if(!ddl)throw new Error('Missing fixture table');await client.$executeRawUnsafe(ddl);
    }
    for(const ddl of CATEGORY_DDL)await client.$executeRawUnsafe(ddl);
  });
  afterAll(async()=>{await client?.$disconnect();try{if(created)await admin.$executeRawUnsafe('DROP DATABASE trbhh_categories_test');}finally{await admin?.$disconnect();}});
  beforeEach(async()=>{
    for(const table of ['ad_category_values','ad_category_definitions','ads','sub_categories','categories','site_settings','commerce_suppliers'])await client.$executeRawUnsafe(`DELETE FROM ${table}`);
    await client.site_settings.create({data:{k:'categories_v2_enabled',v:'1'}});
    await client.categories.create({data:{id:12n,name:'سلع',photo_path:'',is_active:'yes'}});
    await client.sub_categories.create({data:{id:34n,category_id:12,name:'أثاث',active:1}});
    await client.$executeRaw`INSERT INTO ad_category_definitions VALUES (34,1,'goods',1,1,${JSON.stringify([f])})`;
  });
  it('creates and edits actual ads with matching values, preserves IDs and title during field projection',async()=>{
    const ad=await create();expect(ad.category_id).toBe(12n);
    const fd=form();fd.set('category_values','{"condition":"مستعمل"}');
    await writeAdWithCategory(client,fd,(tx)=>tx.ads.update({where:{id:ad.id},data:{detail:'Updated details'}}));
    const values=await client.ad_category_values.findUnique({where:{ad_id:ad.id}});expect(values?.values_json).toEqual({condition:'مستعمل'});
    expect((await getPublicCategories([ad.id])).get(Number(ad.id))?.categoryFields[0].value).toBe('مستعمل');
    expect((await client.ads.findUnique({where:{id:ad.id}}))?.title).toBe('Fixture ad');
  });
  it('operator activation twice preserves real old ads, definitions, values and protected settings',async()=>{
    const payload=activation.buildPayload();
    await create();
    await client.categories.update({where:{id:12n},data:{name:payload.templates[0].categoryName,is_active:'no'}});
    await client.sub_categories.update({where:{id:34n},data:{name:payload.templates[0].name,active:0}});
    await client.$executeRaw`UPDATE ad_category_definitions SET version=8 WHERE subcategory_id=34`;
    await client.site_settings.update({where:{k:'categories_v2_enabled'},data:{v:'0'}});
    await client.site_settings.createMany({data:[
      {k:'wallet_fixture',v:'untouched'},{k:'commerce_enabled',v:'0'},
      {k:'commerce_payments_enabled',v:'0'},{k:'commerce_notifications_enabled',v:'0'},
    ]});
    await client.$executeRaw`INSERT INTO commerce_suppliers (name) VALUES ('Untouched supplier')`;
    const before={
      ads:await client.ads.findMany(),values:await client.ad_category_values.findMany(),
      definitions:await client.ad_category_definitions.findMany(),suppliers:await client.commerce_suppliers.findMany(),
      settings:await client.site_settings.findMany({where:{k:{not:'categories_v2_enabled'}},orderBy:{k:'asc'}}),
    };
    const options={expectedDatabase:'trbhh_categories_test',baseline:'a'.repeat(40),backup:'123',backupVerified:true,payloadSha256:activation.sha256(JSON.stringify(payload))};
    const first=await activation.activate(client,payload,options);
    expect(first.definitionsAdded).toBe(payload.templates.length-1);expect(first.definitionsPreserved).toBe(1);
    const after={
      cats:await client.categories.findMany({orderBy:{id:'asc'}}),
      subs:await client.sub_categories.findMany({orderBy:{id:'asc'}}),
      definitions:await client.ad_category_definitions.findMany({orderBy:{subcategory_id:'asc'}}),
    };
    const second=await activation.activate(client,payload,options);
    expect(second).toMatchObject({categoriesAdded:0,subcategoriesAdded:0,definitionsAdded:0,protectedSettingsUnchanged:true});
    expect(await client.categories.findMany({orderBy:{id:'asc'}})).toEqual(after.cats);
    expect(await client.sub_categories.findMany({orderBy:{id:'asc'}})).toEqual(after.subs);
    expect(await client.ad_category_definitions.findMany({orderBy:{subcategory_id:'asc'}})).toEqual(after.definitions);
    expect(await client.ad_category_definitions.findUnique({where:{subcategory_id:34n}})).toEqual(before.definitions[0]);
    expect(await client.ads.findMany()).toEqual(before.ads);
    expect(await client.ad_category_values.findMany()).toEqual(before.values);
    expect(await client.commerce_suppliers.findMany()).toEqual(before.suppliers);
    expect(await client.site_settings.findMany({where:{k:{not:'categories_v2_enabled'}},orderBy:{k:'asc'}})).toEqual(before.settings);
    expect((await client.site_settings.findUnique({where:{k:'categories_v2_enabled'}}))?.v).toBe('1');
  });
  it('rejects stale schemas before touching an existing ad',async()=>{
    const ad=await create();await client.$executeRaw`UPDATE ad_category_definitions SET version=2 WHERE subcategory_id=34`;
    await expect(writeAdWithCategory(client,form(),tx=>tx.ads.update({where:{id:ad.id},data:{title:'bad'}}))).rejects.toThrow('تغيّر');
    expect((await client.ads.findUnique({where:{id:ad.id}}))?.title).toBe('Fixture ad');
  });
  it('rolls back ads.create if saving values fails',async()=>{
    await client.$executeRawUnsafe('ALTER TABLE ad_category_values ADD CONSTRAINT fixture_reject_values CHECK (definition_version > 100)');
    try{await expect(create()).rejects.toThrow();expect(await client.ads.count()).toBe(0);}finally{await client.$executeRawUnsafe('ALTER TABLE ad_category_values DROP CHECK fixture_reject_values');}
  });
  it('rejects hidden or mismatched subcategories and unknown options',async()=>{
    const fd=form();fd.set('category_values','{"condition":"forged"}');await expect(create(fd)).rejects.toThrow();
    await client.sub_categories.update({where:{id:34n},data:{active:0}});await expect(create()).rejects.toThrow('غير متاح');expect(await client.ads.count()).toBe(0);
  });
  it('jobs price policy and hidden optional fields project in a single batch',async()=>{
    const ad=await create();await client.$executeRaw`UPDATE ad_category_definitions SET kind='jobs',fields_json=${JSON.stringify([{...f,visible:false}])} WHERE subcategory_id=34`;
    expect((await getPublicCategories([ad.id])).get(Number(ad.id))).toMatchObject({priceEnabled:false,goodsEnabled:false,categoryFields:[]});
  });
  it('disabling after the form opened fails closed',async()=>{
    await client.site_settings.update({where:{k:'categories_v2_enabled'},data:{v:'0'}});
    await expect(create()).rejects.toThrow('إيقاف');expect(await client.ads.count()).toBe(0);
  });
  it.each(['legacy','hidden_subcategory','hidden_category','no_definition'] as const)('permits owner correction while preserving %s classification and values',async reason=>{
    const ad=await create();
    if(reason==='legacy')await client.ads.update({where:{id:ad.id},data:{subcategory_id:null}});
    if(reason==='hidden_subcategory')await client.sub_categories.update({where:{id:34n},data:{active:0}});
    if(reason==='hidden_category')await client.categories.update({where:{id:12n},data:{is_active:'no'}});
    if(reason==='no_definition')await client.ad_category_definitions.delete({where:{subcategory_id:34n}});
    const before=await client.ads.findUniqueOrThrow({where:{id:ad.id}});
    const values=await client.ad_category_values.findUnique({where:{ad_id:ad.id}});
    const fd=new FormData();fd.set('category_mode','preserve');
    const result=await writeAdWithCategory(client,fd,(tx,selection)=>{
      expect(selection).toBeNull();
      return tx.ads.update({where:{id:ad.id},data:{title:'Corrected title',phoneAllow:1}});
    },{adId:ad.id,memberId:1n});
    expect(result).toMatchObject({title:'Corrected title',phoneAllow:1,category_id:before.category_id,subcategory_id:before.subcategory_id,cat_reviewed:before.cat_reviewed});
    expect(await client.ad_category_values.findUnique({where:{ad_id:ad.id}})).toEqual(values);
  });
  it('does not accept preservation on create through a forged client adId',async()=>{
    const ad=await create();await client.sub_categories.update({where:{id:34n},data:{active:0}});
    const fd=new FormData();fd.set('category_mode','preserve');fd.set('adId',String(ad.id));
    await expect(create(fd)).rejects.toThrow();expect(await client.ads.count()).toBe(1);
  });
  it('checks locked ownership against server context and ignores forged member/ad IDs',async()=>{
    const ad=await create();await client.sub_categories.update({where:{id:34n},data:{active:0}});
    const fd=new FormData();fd.set('category_mode','preserve');fd.set('memberId','1');fd.set('adId',String(ad.id));
    const write=vi.fn();
    await expect(writeAdWithCategory(client,fd,write,{adId:ad.id,memberId:2n})).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
  });
  it.each(['category_id','subcategory_id','category_version','category_values'])('rejects classification payload %s accompanying preserve mode',async key=>{
    const ad=await create();await client.sub_categories.update({where:{id:34n},data:{active:0}});
    const fd=new FormData();fd.set('category_mode','preserve');fd.set(key,key==='category_values'?'{}':'99');
    const write=vi.fn();await expect(writeAdWithCategory(client,fd,write,{adId:ad.id,memberId:1n})).rejects.toThrow();expect(write).not.toHaveBeenCalled();
  });
  it('does not bypass required/version validation for an active configured classification',async()=>{
    const ad=await create();const fd=new FormData();fd.set('category_mode','preserve');
    const write=vi.fn();await expect(writeAdWithCategory(client,fd,write,{adId:ad.id,memberId:1n})).rejects.toThrow();expect(write).not.toHaveBeenCalled();
  });
  it('explicit reclassification of a legacy ad still requires current definition version',async()=>{
    const ad=await client.ads.create({data:base});
    const write=(tx:Parameters<Parameters<typeof writeAdWithCategory>[2]>[0],s:Parameters<Parameters<typeof writeAdWithCategory>[2]>[1])=>tx.ads.update({where:{id:ad.id},data:{category_id:s!.category_id,subcategory_id:s!.subcategory_id}});
    await expect(writeAdWithCategory(client,form('2'),write,{adId:ad.id,memberId:1n})).rejects.toThrow('تغيّر');
    await writeAdWithCategory(client,form(),write,{adId:ad.id,memberId:1n});
    expect((await client.ad_category_values.findUniqueOrThrow({where:{ad_id:ad.id}})).definition_version).toBe(1);
  });
  it('provides locked existing prices to avoid zeroing fields omitted by preservation form',async()=>{
    const ad=await client.ads.create({data:{...base,old_price:75,price_type:'rent',rent_period:'يومي',stock_state:2}});
    const fd=new FormData();fd.set('category_mode','preserve');fd.set('price','999');
    const updated=await writeAdWithCategory(client,fd,(tx,_selection,preserved)=>tx.ads.update({where:{id:ad.id},data:{title:'Correction',price:0,price_type:null,rent_period:null,old_price:0,stock_state:0,...preserved}}),{adId:ad.id,memberId:1n});
    expect(updated).toMatchObject({title:'Correction',price:50,price_type:'rent',rent_period:'يومي',old_price:75,stock_state:2});
  });
  it('rolls back a preservation callback that changes classification',async()=>{
    const ad=await client.ads.create({data:base});const fd=new FormData();fd.set('category_mode','preserve');
    await expect(writeAdWithCategory(client,fd,tx=>tx.ads.update({where:{id:ad.id},data:{title:'bad',subcategory_id:34}}),{adId:ad.id,memberId:1n})).rejects.toThrow();
    expect(await client.ads.findUniqueOrThrow({where:{id:ad.id}})).toMatchObject({title:base.title,subcategory_id:null});
  });
});
