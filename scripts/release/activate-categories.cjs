#!/usr/bin/env node
'use strict';
/**
 * BUILD ONLY (checkout with dev dependencies):
 * node scripts/release/activate-categories.cjs build > category-seeds.json
 * APPLY ONLY after external baseline/backup/post-deploy preservation verification:
 * node activate-categories.cjs apply payload.json sha256 database baselineSHA backupId verified
 * No DDL, classification/backfill, payment writes, or supplier API calls.
 * The hash must come from the pinned trusted build, never from untrusted input.
 */
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {createHash}=require('node:crypto');
const {runInNewContext}=require('node:vm');
const sha256=value=>createHash('sha256').update(value).digest('hex');
function check(ok,code){if(!ok)throw new Error(code);}
function buildPayload(){
  const ts=require('typescript');
  const root=resolve(__dirname,'../..');
  const sources=['seed-templates.ts','validation.ts'].map(name=>readFileSync(resolve(root,'src/lib/ad-categories',name),'utf8'));
  const load=source=>{
    const exports={};
    const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    runInNewContext(compiled,{exports},{timeout:5000});
    return exports;
  };
  const seeds=load(sources[0]).CATEGORY_SEED_TEMPLATES;
  const validate=load(sources[1]).validateDefinition;
  return JSON.parse(JSON.stringify({format:'trbhh-category-activation-v1',sourceSha256:sha256(sources.join('\n')),templates:seeds.map(t=>({...t,fields:validate(t.fields)}))}));
}
const columns={
  categories:['id','name','photo_path','is_active','ordered'],
  sub_categories:['id','category_id','name','order','active'],
  ad_category_definitions:['subcategory_id','version','kind','price_enabled','goods_enabled','fields_json'],
  ad_category_values:['ad_id','subcategory_id','definition_version','values_json'],
  site_settings:['k','v'],commerce_suppliers:['id','api_enabled'],
};
async function activate(db,payload,options){
  check(options.backupVerified===true && /^[a-f0-9]{40}$/.test(options.baseline||'') && /^[A-Za-z0-9_-]{1,100}$/.test(options.backup||'') && /^[A-Za-z0-9_]{1,64}$/.test(options.expectedDatabase||'') && /^[a-f0-9]{64}$/.test(options.payloadSha256||''),'operator_gate');
  check(sha256(JSON.stringify(payload))===options.payloadSha256,'payload_hash');
  check(payload.format==='trbhh-category-activation-v1' && /^[a-f0-9]{64}$/.test(payload.sourceSha256||'') && Array.isArray(payload.templates) && payload.templates.length>0 && payload.templates.length<=100,'payload_invalid');
  const seen=new Set();
  for(const t of payload.templates){
    check(t && /^[a-z][a-z0-9_]{0,63}$/.test(t.key) && !seen.has(t.key) && typeof t.name==='string' && t.name.length>0 && t.name.length<=255 && typeof t.categoryName==='string' && t.categoryName.length>0 && t.categoryName.length<=255 && Array.isArray(t.fields) && t.fields.length<=80 && ['goods','property','jobs','service','livestock','plants'].includes(t.kind) && typeof t.priceEnabled==='boolean' && typeof t.goodsEnabled==='boolean','payload_invalid');
    seen.add(t.key);
  }
  return db.$transaction(async tx=>{
    const [identity]=await tx.$queryRawUnsafe('SELECT DATABASE() AS db');
    check(identity?.db===options.expectedDatabase,'database_mismatch');
    const tables=await tx.$queryRawUnsafe("SELECT TABLE_NAME AS t,ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()");
    const cols=await tx.$queryRawUnsafe("SELECT TABLE_NAME AS t,COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()");
    const pk=await tx.$queryRawUnsafe("SELECT TABLE_NAME AS t,COLUMN_NAME AS c FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND CONSTRAINT_NAME='PRIMARY'");
    for(const [table,names] of Object.entries(columns)){
      check(tables.some(t=>t.t===table && t.engine==='InnoDB') && names.every(name=>cols.some(c=>c.t===table && c.c===name)) && pk.filter(p=>p.t===table).length===1 && pk.some(p=>p.t===table && p.c===names[0]),'schema_not_ready');
    }
    const triggers=await tx.$queryRawUnsafe("SELECT EVENT_OBJECT_TABLE AS t FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()");
    check(!triggers.some(t=>['categories','sub_categories','ad_category_definitions','site_settings'].includes(t.t)),'unexpected_trigger');
    // Full locking reads serialize repeated activation despite legacy nonunique names.
    const cats=await tx.$queryRawUnsafe('SELECT id,name,is_active FROM categories FOR UPDATE');
    const subs=await tx.$queryRawUnsafe('SELECT id,name,category_id,active FROM sub_categories FOR UPDATE');
    const defs=await tx.$queryRawUnsafe('SELECT subcategory_id FROM ad_category_definitions FOR UPDATE');
    const settings=await tx.$queryRawUnsafe('SELECT k,v FROM site_settings ORDER BY k FOR UPDATE');
    const financialKeys=['commerce_enabled','commerce_payments_enabled','commerce_notifications_enabled'];
    check(settings.every(s=>!financialKeys.includes(s.k) || s.v==='0'),'commerce_not_off');
    const protectedSettings=rows=>sha256(JSON.stringify(rows.filter(s=>s.k!=='categories_v2_enabled').map(s=>[s.k,s.v]).sort((a,b)=>a[0].localeCompare(b[0]))));
    const beforeSettings=protectedSettings(settings);
    const apis=await tx.$queryRawUnsafe('SELECT id FROM commerce_suppliers WHERE api_enabled<>0 OR api_enabled IS NULL FOR UPDATE');
    check(apis.length===0,'supplier_api_not_off');
    const result={categoriesAdded:0,subcategoriesAdded:0,definitionsAdded:0,definitionsPreserved:0};
    for(const t of payload.templates){
      let matches=cats.filter(c=>c.name===t.categoryName);
      check(matches.length<=1,'ambiguous_category');
      let cat=matches[0];
      if(!cat){
        await tx.$executeRawUnsafe("INSERT INTO categories (name,photo_path,is_active,ordered) VALUES (?, '', 'yes', 0)",t.categoryName);
        const [id]=await tx.$queryRawUnsafe('SELECT LAST_INSERT_ID() AS id');
        cat={id:id.id,name:t.categoryName,is_active:'yes'};cats.push(cat);result.categoriesAdded++;
      }
      check(BigInt(cat.id)<=2147483647n,'category_id_overflow');
      matches=subs.filter(s=>BigInt(s.category_id)===BigInt(cat.id) && s.name===t.name);
      check(matches.length<=1,'ambiguous_subcategory');
      let sub=matches[0];
      if(!sub){
        await tx.$executeRawUnsafe('INSERT INTO sub_categories (category_id,name,`order`,active) VALUES (?, ?, 0, 1)',Number(cat.id),t.name);
        const [id]=await tx.$queryRawUnsafe('SELECT LAST_INSERT_ID() AS id');
        sub={id:id.id,category_id:Number(cat.id),name:t.name,active:1};subs.push(sub);result.subcategoriesAdded++;
      }
      check(BigInt(sub.id)<=2147483647n,'subcategory_id_overflow');
      if(!defs.some(d=>BigInt(d.subcategory_id)===BigInt(sub.id))){
        await tx.$executeRawUnsafe('INSERT INTO ad_category_definitions (subcategory_id,version,kind,price_enabled,goods_enabled,fields_json) VALUES (?,1,?,?,?,?)',sub.id,t.kind,Number(t.priceEnabled),Number(t.goodsEnabled),JSON.stringify(t.fields));
        defs.push({subcategory_id:sub.id});result.definitionsAdded++;
      }else result.definitionsPreserved++;
      await tx.$executeRawUnsafe("UPDATE categories SET is_active='yes' WHERE id=?",cat.id);
      await tx.$executeRawUnsafe('UPDATE sub_categories SET active=1 WHERE id=?',sub.id);
    }
    await tx.$executeRawUnsafe("INSERT INTO site_settings (k,v) VALUES ('categories_v2_enabled','1') ON DUPLICATE KEY UPDATE v='1'");
    const afterSettings=protectedSettings(await tx.$queryRawUnsafe('SELECT k,v FROM site_settings ORDER BY k FOR UPDATE'));
    check(beforeSettings===afterSettings,'protected_settings_changed');
    return {...result,protectedSettingsUnchanged:true,settingWriteAllowlist:['categories_v2_enabled']};
  },{isolationLevel:'Serializable',maxWait:10000,timeout:60000});
}
async function main(){
  const [mode,file,hash,database,baseline,backup,verified,...extra]=process.argv.slice(2);
  if(mode==='build' && !file){process.stdout.write(JSON.stringify(buildPayload()));return;}
  check(mode==='apply' && extra.length===0 && verified==='verified','operator_gate');
  const payload=JSON.parse(readFileSync(file,'utf8'));
  const {PrismaClient}=require('@prisma/client');
  const db=new PrismaClient({log:[]});
  try{process.stdout.write(JSON.stringify(await activate(db,payload,{payloadSha256:hash,expectedDatabase:database,baseline,backup,backupVerified:true}))+'\n');}
  finally{await db.$disconnect();}
}
module.exports={buildPayload,activate,sha256};
if(require.main===module || module.id==='[stdin]')main().catch(()=>{process.stderr.write('Category activation refused or rolled back; inspect gates without logging credentials.\n');process.exitCode=1;});
