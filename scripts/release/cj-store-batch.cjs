'use strict';
const {buildPlan,connectionIdentitiesMatch,connectionsMatch}=require('./cj-store-connect.cjs');
const {execFile}=require('node:child_process');
const SHOP='2609231037543532300',BASE='https://developers.cjdropshipping.com/api2.0/v1';
function parseBatchIds(requested){
 if(!/^[1-9]\d{0,15}(?:,[1-9]\d{0,15}){0,23}$/.test(requested))throw Error('batch_ids');
 const ids=requested.split(',');if(new Set(ids).size!==ids.length)throw Error('batch_duplicate_ids');
 return ids;
}
async function main({execute=execFile,fetchApi=fetch,emit=value=>console.log(JSON.stringify(value)),pace=1200}={}){
 const ids=parseBatchIds(process.env.CJ_STORE_BATCH_IDS||'');
 if(process.env.SUPPLIER_ALLOW_LIVE_ORDERS!=='false'||(process.env.CJ_API_BASE||BASE).replace(/\/+$/,'')!==BASE||!process.env.CJ_API_KEY)throw Error('configuration');
 const url=new URL(process.env.DATABASE_URL);if(url.protocol!=='mysql:')throw Error('database_protocol');
 const sql="SELECT JSON_OBJECT('id',CAST(id AS CHAR),'cj_product_id',cj_product_id,'hidden',hidden,'details_json',details_json) FROM cj_products ORDER BY id; SELECT JSON_OBJECT('k',k,'v',v) FROM site_settings WHERE k IN ('commerce_purchasing_enabled','commerce_payments_enabled','commerce_enabled');";
 const output=await new Promise((resolve,reject)=>execute('mysql',['--protocol=TCP','--host='+url.hostname,'--port='+(url.port||3306),'--user='+decodeURIComponent(url.username),'--database='+decodeURIComponent(url.pathname.slice(1)),'--batch','--raw','--skip-column-names','--connect-timeout=10','--execute='+sql],{env:{...process.env,MYSQL_PWD:decodeURIComponent(url.password)},timeout:20000,maxBuffer:16*1024*1024},(error,stdout)=>error?reject(Error('database_read_failed')):resolve(stdout)));
 const rows=output.trim().split('\n').map(line=>JSON.parse(line));
 if(rows.some(r=>r.k&&!['0','false',null].includes(r.v)))throw Error('live_sales_enabled');
 const products=ids.map(id=>rows.find(r=>r.id===id));if(products.some(p=>!p||p.hidden!==0))throw Error('batch_product_unavailable');
 let token,last=0,lastResponse=null;const results=[],writes=[];
 async function api(route,method='GET',body){
  const root=route.split('?')[0];
  const reads=['/shop/getShops','/product/query','/product/variant/query','/product/stock/getInventoryByPid','/product/conn/connection','/shop/product/queryDetail'];
  const posts=['/authentication/getAccessToken','/logistic/freightCalculate','/store/product/saveProduct','/store/product/saveVariantBatch','/product/conn/connection'];
  if(!(method==='GET'?reads:posts).includes(root))throw Error('endpoint_blocked');
  const delay=pace-(Date.now()-last);if(delay>0)await new Promise(r=>setTimeout(r,delay));last=Date.now();
  lastResponse={endpoint:root,method,http:null,code:null};
  const res=await fetchApi(BASE+route,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json',...(token?{'CJ-Access-Token':token}:{})},...(body?{body:JSON.stringify(body)}:{})});
  lastResponse.http=res.status;
  const env=await res.json();lastResponse.code=env.code;if(!res.ok||!(env.code===200||(root==='/shop/getShops'&&env.code===0))||env.success===false||env.result===false||!(env.success===true||env.result===true))throw Error('api_rejected');
  if(method==='POST'&&(root.startsWith('/store/')||root==='/product/conn/connection')){const receipt={endpoint:root,requestId:env.requestId||null,productId:body.id||body.platformProductId||body.variants?.[0]?.productId};writes.push(receipt);emit({event:'metadata_response',...receipt});}
  return env.data;
 }
 const auth=await api('/authentication/getAccessToken','POST',{apiKey:process.env.CJ_API_KEY});token=auth?.accessToken;if(typeof token!=='string'||!token)throw Error('auth_response');
 const shops=await api('/shop/getShops');if(!Array.isArray(shops))throw Error('shops_response');
 for(const row of products){
  let sourceEvidence=null,metadataAttempted=false;
  try{
   const suffix='?pid='+encodeURIComponent(row.cj_product_id);
   const product=await api('/product/query'+suffix),variants=await api('/product/variant/query'+suffix),stock=await api('/product/stock/getInventoryByPid'+suffix);
   if(!Array.isArray(variants)||!variants.length)throw Error('variants_response');
   const warehouses=stock.inventories||[];
   sourceEvidence={warehouses:warehouses.map(w=>({areaId:w.areaId,countryCode:w.countryCode})),quotes:[]};
   const countries=[...new Set(warehouses.filter(w=>Number.isSafeInteger(w.areaId)&&w.areaId>0&&/^[A-Z]{2}$/.test(w.countryCode)).map(w=>w.countryCode))].sort((a,b)=>a==='CN'?-1:b==='CN'?1:0);
   if(!countries.length)throw Error('warehouse_unverified');
   let plan;
   for(const country of countries){
    const quoted=await api('/logistic/freightCalculate','POST',{startCountryCode:country,endCountryCode:'SA',zip:'11564',products:[{vid:variants[0].vid,quantity:1}]});
    const routes=Array.isArray(quoted)?quoted:quoted?.freightList||quoted?.list||[];
    sourceEvidence.quotes.push({sourceCountryCode:country,routeCount:routes.length});
    try{plan=buildPlan(shops,row,product,variants,warehouses,routes,{sourceCountryCode:country});break;}catch(error){if(error.message!=='route_unverified')throw error;}
   }
   if(!plan)throw Error('route_unverified');
   const query='/product/conn/connection?shopId='+SHOP+'&platformProductId='+plan.product.id+'&page=1&pageSize=100';
   let connection=await api(query);if(!Array.isArray(connection?.list))throw Error('connections_response');
   let created=false;
   if(!connectionIdentitiesMatch(connection.list,plan.connection)){
    if(connection.list.length)throw Error('existing_connection_conflict');
    const detail=await api('/shop/product/queryDetail?shopId='+SHOP+'&platformProductIds='+plan.product.id);
    if(!Array.isArray(detail)||detail.length)throw Error('existing_product_requires_reconciliation');
    emit({event:'connection_intent',productId:plan.product.id,variants:variants.length,pricesOmitted:true,inventoryOmitted:true});
    metadataAttempted=true;
    if(await api('/store/product/saveProduct','POST',plan.product)!==true)throw Error('product_save_unverified');
    const saved=await api('/store/product/saveVariantBatch','POST',plan.batch);
    if(!Array.isArray(saved)||saved.length!==plan.batch.variants.length||plan.batch.variants.some(v=>!saved.some(s=>s.id===v.id&&s.productId===v.productId&&s.saveSuccess===true)))throw Error('variant_save_unverified');
    if(await api('/product/conn/connection','POST',plan.connection)!==true)throw Error('connection_write_unverified');
    created=true;connection=await api(query);
   }
   if(!connectionIdentitiesMatch(connection?.list,plan.connection))throw Error('connection_readback_failed');
   const result={id:row.id,platformProductId:plan.product.id,identityVerified:true,routingVerified:connectionsMatch(connection.list,plan.connection),connectedVariants:connection.list.length,created};results.push(result);emit({event:'metadata_identity_verified',...result});
  }catch(error){const result={id:row.id,identityVerified:false,error:/^[a-z_]+$/.test(error.message)?error.message:'operation_failed',lastResponse,sourceEvidence,metadataAttempted};results.push(result);emit({event:'metadata_product_failed',...result});if(metadataAttempted)break;}
 }
 const failed=results.some(r=>!r.identityVerified)||results.length!==ids.length;
 const report={event:'cj_batch_completed',ok:!failed,shopId:SHOP,requested:ids.length,processed:results.length,results,writes,purchasePerformed:false,customerQuoteApproved:false,routingTestZip:'11564',pricesWritten:false,inventoryWritten:false,retryPolicy:'read_existing_identifiers_before_any_write'};emit(report);if(failed)process.exitCode=1;return report;
}
module.exports={parseBatchIds,main};
if(require.main===module)main().catch(error=>{console.error(JSON.stringify({event:'cj_batch_failed',error:/^[a-z_]+$/.test(error.message)?error.message:'operation_failed'}));process.exitCode=1;});
