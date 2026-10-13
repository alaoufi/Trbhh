'use strict';
// Read-only discovery. Credentials stay inside the existing production container.

const fs=require('node:fs');
// Runtime images contain mysql. Keep operator reads bounded and independent of
// the application's generated Prisma model, and emit complete JSON evidence.
async function readCatalogDatabase(){
 const {execFile}=require('node:child_process');
 const url=new URL(process.env.DATABASE_URL);
 if(url.protocol!=='mysql:')throw Error('database_protocol');
 const sql="SELECT JSON_OBJECT('id',CAST(id AS CHAR),'cj_product_id',cj_product_id,'name_ar',name_ar,'status',status,'hidden',hidden,'margin_bps',margin_bps,'last_sync_at',last_sync_at,'details_json',details_json,'commerce_product_id',CAST(commerce_product_id AS CHAR)) FROM cj_products ORDER BY id; SELECT JSON_OBJECT('k',k,'v',v) FROM site_settings WHERE k IN ('commerce_default_margin_bps','cj_usd_to_sar_x100','commerce_purchasing_enabled','commerce_payments_enabled','commerce_enabled','commerce_gateway_enabled','cj_storefront_public','pay_mode','pay_provider','payment_electronic_enabled','payment_transfer_enabled'); SELECT JSON_OBJECT('cjRowId',CAST(cj.id AS CHAR),'requestedCommerceProductId',CAST(cj.commerce_product_id AS CHAR),'commerceProductId',CAST(cp.id AS CHAR),'approved',cp.approved,'visible',cp.visible,'enabled',cp.enabled,'currency',cp.currency,'priceMinor',cp.price_minor,'stockAvailable',cp.stock_available) FROM cj_products cj LEFT JOIN commerce_products cp ON cp.id=cj.commerce_product_id WHERE cj.commerce_product_id IS NOT NULL ORDER BY cj.id;";
 const output=await new Promise((resolve,reject)=>execFile('mysql',['--protocol=TCP','--host='+url.hostname,'--port='+(url.port||'3306'),'--user='+decodeURIComponent(url.username),'--database='+decodeURIComponent(url.pathname.slice(1)),'--default-character-set=utf8mb4','--batch','--raw','--skip-column-names','--connect-timeout=10','--execute='+sql],{env:{...process.env,MYSQL_PWD:decodeURIComponent(url.password)},timeout:20000,maxBuffer:16*1024*1024},(error,stdout)=>error?reject(Error('database_read_failed')):resolve(stdout)));
 const rows=output.trim()?output.trim().split('\n').map(line=>JSON.parse(line)):[];
 return {catalog:rows.filter(row=>row.id!=null),settings:rows.filter(row=>row.k!=null),mappings:rows.filter(row=>row.cjRowId!=null)};
}
function readinessReport(settings,env=process.env){
 const values=new Map(settings.map(row=>[row.k,row.v]));
 const flags=['commerce_enabled','commerce_payments_enabled','commerce_purchasing_enabled','commerce_gateway_enabled','cj_storefront_public','payment_electronic_enabled','payment_transfer_enabled'];
 const required=['ALRAJHI_TERMINAL_ID','ALRAJHI_TERMINAL_NAME','ALRAJHI_MERCHANT_ID','ALRAJHI_TERMINAL_ALIAS_NAME','ALRAJHI_TRANPORTAL_ID','ALRAJHI_TRANPORTAL_PASSWORD','ALRAJHI_TERMINAL_RESOURCE_KEY','ALRAJHI_PAYMENT_GATEWAY_URL','ALRAJHI_TRANPORTAL_GATEWAY_URL','DATABASE_PAYMENT_SECRET'];
 const fields=required.map(key=>({key,present:Boolean(env[key]?.trim())}));
 const mode=['sandbox','production'].includes(env.ALRAJHI_ENVIRONMENT)?env.ALRAJHI_ENVIRONMENT:'absent_or_invalid';
 const margin=values.get('commerce_default_margin_bps');
 return {format:'cj-readiness-audit-v1',readOnly:true,marginBps:/^\d{1,6}$/.test(margin||'')?Number(margin):null,settings:Object.fromEntries(flags.map(key=>[key,values.get(key)==='1'])),paymentMode:['test','live'].includes(values.get('pay_mode'))?values.get('pay_mode'):'absent_or_invalid',paymentProvider:/^[a-z_]{1,30}$/.test(values.get('pay_provider')||'')?values.get('pay_provider'):null,bank:{mode,fields,configured:mode!=='absent_or_invalid'&&fields.every(field=>field.present)},environment:Object.fromEntries(['SUPPLIER_ALLOW_LIVE_ORDERS','CJ_FULFILLMENT_WORKER_ENABLED','CJ_LIVE_TRIAL_ENABLED'].map(key=>[key,env[key]==='true']))};
}
function successfulRead(route,data){
 if(data?.result===false||data?.success===false)return false;
 if(data?.code===200&&(data.result===true||data.success===true))return true;
 // Observed shop gateway envelope; never accept code 0 for any other endpoint.
 return route==='/shop/getShops'&&data?.code===0&&data.success===true&&Array.isArray(data.data);
}
async function main(){
 const keepAlive=setInterval(()=>{},1000);
 let completed=false;
 process.on('exit',()=>{if(!completed){console.error(JSON.stringify({event:'cj_discovery_incomplete'}));process.exitCode=1;}});
 console.log(JSON.stringify({event:'catalog_audit_started',version:3}));
 let last=0;const calls=[];
 try{
  const {catalog,settings,mappings}=await readCatalogDatabase();
  console.log(JSON.stringify(readinessReport(settings)));
  console.log(JSON.stringify({format:'trbhh-cj-catalog-v1',count:catalog.length,visible:catalog.filter(p=>p.hidden===0).length,products:catalog.map(({details_json,...p})=>({...p,variants:(JSON.parse(details_json||'{}').variants||[]).map(v=>({vid:v.vid,sku:v.variantSku}))}))},(_,v)=>typeof v==='bigint'?String(v):v));
  console.log(JSON.stringify({format:'cj-commerce-mapping-audit-v1',readOnly:true,boundProducts:catalog.filter(row=>row.commerce_product_id!=null).length,missingTargets:mappings.filter(row=>row.commerceProductId==null).length,saleFlagsEnabled:mappings.filter(row=>row.approved===1&&row.visible===1&&row.enabled===1).length,mappings}));

  const base=(process.env.CJ_API_BASE||'https://developers.cjdropshipping.com/api2.0/v1').replace(/\/+$/,'');
  if(base!=='https://developers.cjdropshipping.com/api2.0/v1')throw Error('unexpected_destination');
  const key=process.env.CJ_API_KEY;if(!key)throw Error('missing_api_key');
  async function request(route,method='GET',body,token){
   const delay=1200-(Date.now()-last);if(delay>0)await new Promise(r=>setTimeout(r,delay));last=Date.now();
   const res=await fetch(base+route,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json',...(token?{'CJ-Access-Token':token}:{})},...(body?{body:JSON.stringify(body)}:{})});
   const data=await res.json();calls.push({route,http:res.status,code:data.code,result:data.result,success:data.success,responseKeys:Object.keys(data),message:String(data.message||data.msg||" ").replace(/https?:\/\/\S+|[A-Za-z0-9_@.-]{24,}/g,"[redacted]").slice(0,160)});
   if(!res.ok||!successfulRead(route,data))throw Error('cj_discovery_failed');
   return data.data;
  }
  const auth=await request('/authentication/getAccessToken','POST',{apiKey:key});
  if(typeof auth?.accessToken!=='string')throw Error('invalid_authentication');
  const shops=await request('/shop/getShops','GET',undefined,auth.accessToken);
  if(!Array.isArray(shops))throw Error('invalid_shop_list');
  const balance=await request('/shopping/pay/getBalance','GET',undefined,auth.accessToken);
  if(!balance||!/^\d+(?:\.\d+)?$/.test(String(balance.amount)))throw Error('balance_response');
  console.log(JSON.stringify({format:'cj-wallet-read-v1',readOnly:true,currency:'USD',amount:String(balance.amount),bonus:balance.noWithdrawalAmount==null?null:String(balance.noWithdrawalAmount),frozen:balance.freezeAmount==null?null:String(balance.freezeAmount)}));
  if(process.env.CJ_CATALOG_AUDIT==='true'){
   const audit=[];
   for(const row of catalog){
    try{
     const product=await request('/product/query?pid='+encodeURIComponent(row.cj_product_id),'GET',undefined,auth.accessToken);
     const variants=await request('/product/variant/query?pid='+encodeURIComponent(row.cj_product_id),'GET',undefined,auth.accessToken);
     const saved=JSON.parse(row.details_json||'{}').variants||[];
     const valid=String(product?.pid)===row.cj_product_id&&Array.isArray(variants)&&variants.length>0&&saved.length===variants.length&&new Set(variants.map(v=>v.vid)).size===variants.length&&saved.every(s=>variants.some(v=>v.vid===s.vid));
     const result={id:row.id,pid:row.cj_product_id,hidden:row.hidden,status:row.status,identityVerified:valid,localVariants:saved.length,sourceVariants:Array.isArray(variants)?variants.length:null,platformProductId:'trbhh-cj-'+row.id};
     audit.push(result);console.log(JSON.stringify({event:'catalog_product_audited',...result}));
    }catch{const result={id:row.id,pid:row.cj_product_id,identityVerified:false,error:'source_read_failed'};audit.push(result);console.log(JSON.stringify({event:'catalog_product_audited',...result}));}
   }
   const failed=audit.filter(row=>!row.identityVerified).length;
   console.log(JSON.stringify({format:'cj-catalog-source-audit-v1',readOnly:true,count:audit.length,identityVerified:audit.length-failed,failed,products:audit}));
  }
  const connections=await request('/product/conn/connection?shopId=2609231037543532300&platformProductId=trbhh-cj-247&page=1&pageSize=100','GET',undefined,auth.accessToken);
  console.log(JSON.stringify({format:'cj-connection-readback-v1',total:connections?.total,list:connections?.list?.map(l=>({shopId:l.shopId,platformProductId:l.platformProductId,platformVariantId:l.platformVariantId,cjProductId:l.cjProductId,cjVariantId:l.cjVariantId,defaultArea:l.defaultArea,logistics:l.logistics,sourceCountryCode:l.sourceCountryCode,targetCountryCode:l.targetCountryCode,keys:Object.keys(l)}))}));
  const row=catalog.find(p=>p.id==='247');
  if(!row||row.hidden!==0)throw Error('product_unavailable');
  const product=await request('/product/query?pid='+encodeURIComponent(row.cj_product_id),'GET',undefined,auth.accessToken);
  const variants=await request('/product/variant/query?pid='+encodeURIComponent(row.cj_product_id),'GET',undefined,auth.accessToken);
  const inventory=await request('/product/stock/getInventoryByPid?pid='+encodeURIComponent(row.cj_product_id),'GET',undefined,auth.accessToken);
  console.log(JSON.stringify({format:'cj-link-source-v1',product:{pid:product.pid,title:product.productNameEn||product.productName,image:product.productImage},variants:Array.isArray(variants)?variants.map(v=>({vid:v.vid,sku:v.variantSku,title:v.variantNameEn||v.variantName,image:v.variantImage,weight:v.variantWeight})):null,warehouses:inventory?.inventories?.map(v=>({areaId:v.areaId,areaEn:v.areaEn,countryCode:v.countryCode})),sampleInventory:inventory?.variantInventories?.slice(0,1)},(_,v)=>typeof v==='bigint'?String(v):v));
  console.log(JSON.stringify({format:'cj-store-discovery-v1',commit:fs.readFileSync('/app/RELEASE_COMMIT','utf8').trim(),authenticatedUserId:auth.userId==null?null:String(auth.userId),shops:shops.map(s=>({id:String(s.id),name:s.name,status:s.status,type:s.type})),product:row?{id:row.id,cjProductId:row.cj_product_id,hidden:row.hidden,variantCount:(JSON.parse(row.details_json||'{}').variants||[]).length}:null,settings,calls},(_,v)=>typeof v==='bigint'?String(v):v));
  completed=true;console.log(JSON.stringify({event:'cj_discovery_completed',ok:true,catalogCount:catalog.length}));
 }catch(error){console.error(JSON.stringify({ok:false,error:['unexpected_destination','missing_api_key','invalid_authentication','invalid_shop_list','database_read_failed'].includes(error.message)?error.message:'discovery_failed',calls}));process.exitCode=1;}finally{clearInterval(keepAlive);}
}
module.exports={successfulRead,readinessReport};
if(require.main===module||(module.id==='[stdin]'&&process.argv[1]==='-'))void main();
