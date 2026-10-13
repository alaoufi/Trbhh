'use strict';
// Read-only discovery. Credentials stay inside the existing production container.

const fs=require('node:fs');
// Runtime images contain mysql. Read-only CLI avoids the native Prisma engine
// silently ending an operator process before its awaited query returns.
async function readCatalogDatabase(){
 const {execFile}=require('node:child_process');
 const url=new URL(process.env.DATABASE_URL);
 if(url.protocol!=='mysql:')throw Error('database_protocol');
 const sql="SELECT JSON_OBJECT('id',CAST(id AS CHAR),'cj_product_id',cj_product_id,'name_ar',name_ar,'status',status,'hidden',hidden,'margin_bps',margin_bps,'last_sync_at',last_sync_at,'details_json',details_json) FROM cj_products ORDER BY id; SELECT JSON_OBJECT('k',k,'v',v) FROM site_settings WHERE k IN ('commerce_default_margin_bps','cj_usd_to_sar_x100','commerce_purchasing_enabled','commerce_payments_enabled','commerce_enabled');";
 const output=await new Promise((resolve,reject)=>execFile('mysql',['--protocol=TCP','--host='+url.hostname,'--port='+(url.port||'3306'),'--user='+decodeURIComponent(url.username),'--database='+decodeURIComponent(url.pathname.slice(1)),'--default-character-set=utf8mb4','--batch','--raw','--skip-column-names','--connect-timeout=10','--execute='+sql],{env:{...process.env,MYSQL_PWD:decodeURIComponent(url.password)},timeout:20000,maxBuffer:16*1024*1024},(error,stdout)=>error?reject(Error('database_read_failed')):resolve(stdout)));
 const rows=output.trim()?output.trim().split('\n').map(line=>JSON.parse(line)):[];
 return {catalog:rows.filter(row=>row.id!=null),settings:rows.filter(row=>row.k!=null)};
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
  const {catalog,settings}=await readCatalogDatabase();
  console.log(JSON.stringify({format:'trbhh-cj-catalog-v1',count:catalog.length,visible:catalog.filter(p=>p.hidden===0).length,products:catalog.map(({details_json,...p})=>({...p,variants:(JSON.parse(details_json||'{}').variants||[]).map(v=>({vid:v.vid,sku:v.variantSku}))}))},(_,v)=>typeof v==='bigint'?String(v):v));

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
module.exports={successfulRead};
if(require.main===module||(module.id==='[stdin]'&&process.argv[1]==='-'))void main();
