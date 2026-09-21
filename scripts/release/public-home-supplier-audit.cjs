'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const IDS=['6','9','10'];
function check(ok){if(!ok)throw Error('concurrent_supplier_audit_rejected');}
function input(directory){
  check(directory==='/root/trbhh-release-backups/audit-35626587686'&&fs.realpathSync(directory)===directory);
  const load=name=>JSON.parse(fs.readFileSync(path.join(directory,name)));
  const old=load('forensic-supplier-baseline.json'),current=load('forensic-supplier-current.json');
  const before=load('supplier-before.json'),after=load('supplier-after.json');
  const proof=require('/root/trbhh-release-tools/6b9ad47c6ace6cc7a7c25fc0d04947a5eaece2fb/supplier-preservation-proof.cjs');
  const forensic=require(path.join(directory,'public-home-supplier-forensics.cjs')).compare(old,current,before,after,proof);
  const changes=forensic.changes.filter(row=>row.protectedChangedColumns.length);
  check(JSON.stringify(changes.map(row=>row.productId).sort())===JSON.stringify([...IDS].sort()));
  for(const row of changes)check(JSON.stringify([...row.protectedChangedColumns].sort())===JSON.stringify(['commerce_product_id','selling_price_minor','unit_cost_minor'].sort()));
  const fields=['public_price_minor','unit_cost_minor','selling_price_minor','commerce_product_id','active','visible','featured','revision','supplier_id','sku'];
  const project=(snapshot,id)=>{const row=snapshot.rows.find(item=>item.id===id);check(row);return Object.fromEntries(fields.map(name=>{const index=snapshot.columns.indexOf(name);check(index>=0);return[name,row.values[index]===null?null:Buffer.from(row.values[index],'hex').toString('utf8')];}));};
  const products=IDS.map(id=>({id,before:project(old,id),after:project(current,id)}));
  for(const product of products){check(product.before.commerce_product_id===null&&/^\d+$/.test(product.after.commerce_product_id));check(Number(product.after.revision)===Number(product.before.revision)+1);for(const field of ['active','visible','featured'])check(product.before[field]==='0'&&product.after[field]==='0');}
  const end=new Date(fs.statSync(path.join(directory,'supplier-after.json')).mtimeMs).toISOString();
  check(Date.parse(end)>=Date.parse('2026-09-21T16:44:40.000Z')&&Date.parse(end)<=Date.parse('2026-09-21T16:44:46.999Z'));
  return {start:load('before.json').observedAt,end,endWitness:'original failed-after supplier snapshot mtime; run 35627469399',products,evidenceHashes:Object.fromEntries(['before.json','supplier-before.json','supplier-after.json','forensic-supplier-baseline.json','forensic-supplier-current.json'].map(name=>[name,hash(fs.readFileSync(path.join(directory,name)))]))};
}
function number(value){if(value===null)return null;check(/^-?\d+$/.test(String(value)));return String(value);}
function verify(data,histories,logs,mappings,commerce){
  check(data&&JSON.stringify(data.products.map(row=>row.id))===JSON.stringify(IDS));
  const start=Date.parse(data.start),end=Date.parse(data.end);check(Number.isFinite(start)&&end>start&&end-start<30*60*1000);
  check(histories.length===3&&logs.length===3&&mappings.length===3&&commerce.length===3);
  const actorIds=[],times=[];
  const results=data.products.map(product=>{
    check(product.before.commerce_product_id===null&&/^\d+$/.test(product.after.commerce_product_id));
    check(Number(product.after.revision)===Number(product.before.revision)+1);
    for(const field of ['active','visible','featured'])check(product.before[field]==='0'&&product.after[field]==='0');
    const rows=histories.filter(row=>String(row.supplier_product_id)===product.id);check(rows.length===1);const h=rows[0],at=new Date(h.created_at).getTime();
    check(h.kind==='admin'&&h.actor_id!==null&&at>=start&&at<=end);actorIds.push(String(h.actor_id));times.push(at);
    const previous=product.before,current=product.after;
    for(const [field,value] of [['old_public_minor',previous.public_price_minor],['new_public_minor',current.public_price_minor],['old_cost_minor',previous.unit_cost_minor],['new_cost_minor',current.unit_cost_minor],['old_selling_minor',previous.selling_price_minor],['new_selling_minor',current.selling_price_minor]])check(number(h[field])===value);
    const note=`visible=0;active=0;selling=${current.selling_price_minor};cost=${current.unit_cost_minor}`;
    const audit=logs.filter(row=>row.action==='ضبط منتج مورد'&&row.target===product.id&&String(row.admin_id)===String(h.actor_id)&&row.note===note&&Math.abs(new Date(row.created_at).getTime()-at)<2000);check(audit.length===1);
    const goods=commerce.filter(row=>String(row.id)===current.commerce_product_id);check(goods.length===1&&goods[0].visible===0&&goods[0].enabled===0&&goods[0].approved===1&&number(goods[0].price_minor)===current.selling_price_minor);
    const source=mappings.filter(row=>String(row.product_id)===current.commerce_product_id);check(source.length===1&&String(source[0].supplier_id)===current.supplier_id&&source[0].supplier_sku===String(current.sku).slice(0,128)&&number(source[0].unit_cost_minor)===current.unit_cost_minor&&source[0].currency==='SAR');
    return {productId:product.id,auditedAt:new Date(at).toISOString(),adminActionMatches:true,matchingActorAndAuditTime:true,oldAndNewAmountsMatchPrivateEvidence:true,mappingMatches:true,commerceInvisibleAndDisabled:true,revisionAdvancedExactlyOnce:true};
  });
  check(new Set(actorIds).size===1);
  return {ok:true,operation:'existing manual supplier draft approval',products:results,sameActorAcrossProducts:true,operationSpanMilliseconds:Math.max(...times)-Math.min(...times),publishedAutomatically:false,sourceRowsLost:false,evidenceHashes:data.evidenceHashes};
}
function remaining(directory){
  const data=input(directory),load=name=>JSON.parse(fs.readFileSync(path.join(directory,name))),save=(name,value)=>fs.writeFileSync(path.join(directory,name),JSON.stringify(value)+'\n',{flag:'wx',mode:0o600});
  const tools='/root/trbhh-release-tools/6b9ad47c6ace6cc7a7c25fc0d04947a5eaece2fb',candidate='6b9ad47c6ace6cc7a7c25fc0d04947a5eaece2fb';
  const auditResult=load('supplier-admin-operation-review.json');
  check(auditResult.ok===true&&auditResult.sameActorAcrossProducts===true&&auditResult.publishedAutomatically===false&&auditResult.sourceRowsLost===false&&JSON.stringify(auditResult.evidenceHashes)===JSON.stringify(data.evidenceHashes));
  check(JSON.stringify(auditResult.products.map(row=>row.productId))===JSON.stringify(IDS));
  for(const row of auditResult.products)for(const key of ['adminActionMatches','matchingActorAndAuditTime','oldAndNewAmountsMatchPrivateEvidence','mappingMatches','commerceInvisibleAndDisabled','revisionAdvancedExactlyOnce'])check(row[key]===true);
  function run(command,args,source,output){
    const fd=output?fs.openSync(path.join(directory,output),'wx',0o600):null;
    let result;try{result=spawnSync(command,args,{input:source?fs.readFileSync(source):undefined,stdio:['pipe',fd??'pipe','pipe'],encoding:'utf8',timeout:300000,maxBuffer:8*1024*1024});}finally{if(fd!==null)fs.closeSync(fd);}
    check(!result.error&&result.status===0);return result.stdout?.trim();
  }
  check(run('git',['-C','/root/trbhh','rev-parse','HEAD'])===candidate);
  for(const [current,saved] of [['/root/trbhh/.env','environment.env'],['/root/trbhh/docker-compose.yml','docker-compose.yml'],['/root/trbhh/apps/android-twa/twa-manifest.json','runtime-twa-manifest.json']])check(fs.readFileSync(current).equals(fs.readFileSync(path.join(directory,saved))));
  run('docker',['exec','-i','trbhh-app','node','-','snapshot'],path.join(tools,'supplier-preservation-proof.cjs'),'supplier-final.json');
  const supplier=require(path.join(tools,'supplier-preservation-proof.cjs'));
  supplier.verify(load('supplier-after.json'),load('supplier-final.json'));
  const first=load('supplier-before.json'),reviewed=structuredClone(load('supplier-after.json'));
  reviewed.tables.supplier_products=structuredClone(first.tables.supplier_products);
  const reviewedResult=supplier.verify(first,reviewed);save('supplier-after-reviewed-admin.json',reviewed);save('supplier-reviewed-result.json',reviewedResult);
  save('supplier-admin-attestation.json',{format:'trbhh-reviewed-concurrent-supplier-admin-v1',backupId:'35626587686',baselineCommit:'1a2111ccd9a17c151a2f47cf793f3bddf4d0451f',targetCommit:candidate,exactProductIds:IDS,exactChangedProtectedColumns:['commerce_product_id','unit_cost_minor','selling_price_minor'],originalManifestsModified:false,sqlWrites:false,auditResultSha256:hash(fs.readFileSync(path.join(directory,'supplier-admin-operation-review.json'))),reviewedSupplierSha256:hash(fs.readFileSync(path.join(directory,'supplier-after-reviewed-admin.json'))),evidenceHashes:data.evidenceHashes});
  run('docker',['exec','-i','trbhh-app','node','-','snapshot'],path.join(tools,'database-proof.cjs'),'after.json');
  run('node',[path.join(tools,'database-proof.cjs'),'verify',path.join(directory,'before.json'),path.join(directory,'after.json')],null,'database-result.json');
  run('docker',['exec','-i','trbhh-app','node','-','verify-schema'],path.join(tools,'database-proof.cjs'),'auth-schema-result.json');
  run('docker',['inspect','trbhh-app'],null,'container-after.json');
  check(load('container-after.json')[0].Image==='sha256:265075ccb75ed76251c7dd87eba071826aaf5443ccbe7e3be473ecd07689d903');
  run('node',[path.join(tools,'verify-runtime.cjs'),path.join(directory,'container-before.json'),path.join(directory,'container-after.json'),'public_home'],null,'runtime-result.txt');
  for(const name of ['storage','legacy']){
    const mediaPath=fs.readFileSync(path.join(directory,name+'.path'),'utf8').trim();check(mediaPath==='/app/'+name);
    run('docker',['exec','-i','-u','0','trbhh-app','node','-','snapshot',mediaPath],path.join(tools,'media-proof.cjs'),name+'-after.json');
    run('node',[path.join(tools,'media-proof.cjs'),'verify',path.join(directory,name+'-before.json'),path.join(directory,name+'-after.json')],null,name+'-result.json');
  }
  for(const [name,expected] of Object.entries(data.evidenceHashes))check(hash(fs.readFileSync(path.join(directory,name)))===expected);
  save('POST_RELEASE_REVIEWED.json',{status:'verified-with-explicit-concurrent-admin-review',commit:candidate,backupRun:35626587686,deployRun:35627091667,afterWorkflowRun:35627469399,afterWorkflowConclusion:'failure: three concurrent manual hidden supplier draft mappings',supplierReview:'supplier-admin-attestation.json',originalManifestsPreserved:true,verifiedTables:load('database-result.json').comparedTables,storageEntries:load('storage-result.json').compared,legacyEntries:load('legacy-result.json').compared,runtimeAndAuthVerified:true,supplierPreservationReviewed:true,purchasingEnabled:false,paymentsEnabled:false,publicCommerceEnabled:false,reviewedAt:new Date().toISOString()});
  process.stdout.write(JSON.stringify({ok:true,reviewedSupplierProducts:IDS,comparedTables:load('database-result.json').comparedTables,storage:load('storage-result.json'),legacy:load('legacy-result.json'),runtimeImageVerified:true,originalManifestsPreserved:true,purchasingDisabled:true,paymentsDisabled:true,publicCatalogDisabled:true})+'\n');
}
async function audit(db,data){return db.$transaction(async tx=>{
  const start=new Date(data.start),end=new Date(data.end);
  const histories=await tx.$queryRawUnsafe("SELECT supplier_product_id,actor_id,kind,old_public_minor,new_public_minor,old_cost_minor,new_cost_minor,old_selling_minor,new_selling_minor,created_at FROM supplier_price_history WHERE supplier_product_id IN (6,9,10) AND created_at>=? AND created_at<=? ORDER BY supplier_product_id,id",start,end);
  const logs=await tx.$queryRawUnsafe("SELECT admin_id,action,target,note,created_at FROM admin_log WHERE target IN ('6','9','10') AND action=? AND created_at>=? AND created_at<=? ORDER BY id",'ضبط منتج مورد',start,end);
  const ids=data.products.map(row=>row.after.commerce_product_id);check(ids.length===3&&ids.every(id=>/^\d+$/.test(id)));
  const commerce=await tx.$queryRawUnsafe('SELECT id,price_minor,approved,visible,enabled FROM commerce_products WHERE id IN (?,?,?)',...ids);
  const mappings=await tx.$queryRawUnsafe('SELECT product_id,supplier_id,supplier_sku,unit_cost_minor,currency FROM commerce_product_suppliers WHERE product_id IN (?,?,?)',...ids);
  return verify(data,histories,logs,mappings,commerce);
},{isolationLevel:'RepeatableRead',maxWait:30000,timeout:120000});}
async function main(){let db;try{
  if(process.argv[2]==='input'){process.stdout.write(Buffer.from(JSON.stringify(input(process.argv[3]))).toString('base64'));}
  else if(process.argv[2]==='audit'){const data=JSON.parse(Buffer.from(process.argv[3],'base64').toString());db=new(require('@prisma/client').PrismaClient)({log:[]});process.stdout.write(JSON.stringify(await audit(db,data))+'\n');}
  else if(process.argv[2]==='remaining')remaining(process.argv[3]);
  else check(false);
}catch{process.stderr.write('Concurrent admin-operation audit rejected; original evidence retained and values withheld.\n');process.exitCode=1;}finally{if(db)await db.$disconnect();}}
if(require.main===module||module.id==='[stdin]'&&process.argv[1]==='-')void main();
module.exports={verify};
