'use strict';
const SHOP='2609231037543532300',PID='2610090314401607200',ROW=247n;
function connectionIdentitiesMatch(lines,target){
 return Array.isArray(lines)&&lines.length===target.variantList.length&&new Set(lines.map(l=>l.platformVariantId)).size===lines.length&&target.variantList.every(v=>lines.some(l=>String(l.shopId)===target.shopId&&l.platformProductId===target.platformProductId&&l.platformVariantId===v.platformVariantId&&l.cjVariantId===v.cjVariantId&&l.cjProductId===target.cjProductId));
}
function connectionsMatch(lines,target){
 return connectionIdentitiesMatch(lines,target)&&lines.every(l=>Number(l.defaultArea)===target.defaultArea&&l.logistics===target.logistics&&l.sourceCountryCode===target.sourceCountryCode&&l.targetCountryCode===target.targetCountryCode);
}
function buildPlan(shops,row,product,variants,warehouses,routes,{sourceCountryCode='CN'}={}){
 const shop=shops.find(s=>String(s.id)===SHOP);
 if(!shop||shop.name!=='Trbhh'||shop.status!==1||shop.type!=='api')throw Error('shop_identity');
 if(!row||row.hidden!==0||!/^[1-9]\d{0,15}$/.test(String(row.id))||!/^[A-Za-z0-9_-]{1,64}$/.test(row.cj_product_id)||String(product.pid)!==row.cj_product_id)throw Error('product_identity');
 const saved=JSON.parse(row.details_json||'{}').variants||[];
 if(!Array.isArray(variants)||!variants.length||variants.length!==saved.length||variants.some(v=>!saved.some(s=>s.vid===v.vid))||new Set(variants.map(v=>v.vid)).size!==variants.length)throw Error('variant_identity');
 if(!/^[A-Z]{2}$/.test(sourceCountryCode))throw Error('country_unverified');
 const sourceCountry=new Intl.DisplayNames(['en'],{type:'region'}).of(sourceCountryCode);
 if(!sourceCountry||sourceCountry===sourceCountryCode||sourceCountryCode==='ZZ')throw Error('country_unverified');
 const origin=warehouses.find(w=>w.countryCode===sourceCountryCode&&Number.isSafeInteger(w.areaId)&&w.areaId>0);
 const valid=routes.filter(r=>typeof r.logisticName==='string'&&r.logisticName&&/^[0-9]+(?:\.[0-9]+)?$/.test(String(r.logisticPrice))&&Number.isFinite(Number(r.logisticPrice))).sort((a,b)=>Number(a.logisticPrice)-Number(b.logisticPrice));
 if(!origin)throw Error('warehouse_unverified');
 if(!valid.length)throw Error('route_unverified');
 let image=product.productImage;try{if(typeof image==='string'&&image.startsWith('['))image=JSON.parse(image)[0];}catch{throw Error('image_invalid');}
 const reviewedOss=new Set(['cj-product-center.oss-accelerate.aliyuncs.com','cc-west-usa.oss-us-west-1.aliyuncs.com','cc-west-eu.oss-eu-central-1.aliyuncs.com','cc-west-uk.oss-eu-west-1.aliyuncs.com']);
 const safeImage=value=>{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||(!/(^|\.)cjdropshipping\.(com|cn)$/.test(u.hostname)&&!reviewedOss.has(u.hostname)))throw Error('image_invalid');return u.href;};
 const productId='trbhh-cj-'+String(row.id);
 const lines=variants.map(v=>{
  if(!/^[A-Za-z0-9_-]{1,40}$/.test(v.vid)||typeof v.variantSku!=='string'||!v.variantSku)throw Error('variant_invalid');
  return {id:productId+'-'+v.vid,productId,title:v.variantNameEn||v.variantName||v.variantSku,sku:v.variantSku,image:safeImage(v.variantImage||image)};
 });
 return {product:{id:productId,shopId:SHOP,title:product.productNameEn||product.productName,image:safeImage(image)},batch:{shopId:SHOP,variants:lines},connection:{shopId:SHOP,defaultArea:origin.areaId,logistics:valid[0].logisticName,cjProductId:row.cj_product_id,platformProductId:productId,sourceCountryCode,sourceCountry,targetCountryCode:'SA',targetCountry:'Saudi Arabia',variantList:variants.map((v,i)=>({cjVariantId:v.vid,platformVariantId:lines[i].id}))}};
}
async function main(){
 const {PrismaClient}=require('@prisma/client'),db=new PrismaClient({log:[]});let last=0;
 const base='https://developers.cjdropshipping.com/api2.0/v1';
 const allowed=new Set(['/authentication/getAccessToken','/store/product/saveProduct','/store/product/saveVariantBatch','/product/conn/connection','/logistic/freightCalculate']);
 const readRoots=new Set(['/shop/getShops','/shop/product/queryDetail','/product/query','/product/variant/query','/product/stock/getInventoryByPid','/product/conn/connection']);
 const report={format:'cj-store-connection-v1',shopId:SHOP,productId:'trbhh-cj-247',writes:[],routingTestZip:'11564',customerQuoteApproved:false,purchasePerformed:false};
 let token;
 async function api(route,method='GET',body){
  const root=route.split('?')[0];if(method==='GET'?!readRoots.has(root):!allowed.has(root))throw Error('endpoint_blocked');
  const wait=1200-(Date.now()-last);if(wait>0)await new Promise(r=>setTimeout(r,wait));last=Date.now();
  const res=await fetch(base+route,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json',...(token?{'CJ-Access-Token':token}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const env=await res.json();
  if(!res.ok||![0,200].includes(env.code)||env.success===false||env.result===false||!(env.success===true||env.result===true))throw Error('api_rejected_'+root.replace(/\W/g,'_'));
  if(method==='POST'&&root.startsWith('/store/')||method==='POST'&&root==='/product/conn/connection'){report.writes.push({endpoint:root,requestId:env.requestId||null});console.log(JSON.stringify({event:'metadata_response',endpoint:root,requestId:env.requestId||null,code:env.code}));}
  return env.data;
 }
 try{
  if((process.env.CJ_API_BASE||base).replace(/\/+$/,'')!==base||!process.env.CJ_API_KEY)throw Error('configuration');
  const flags=await db.site_settings.findMany({where:{k:{in:['commerce_purchasing_enabled','commerce_payments_enabled','commerce_enabled']}},select:{v:true}});
  if(process.env.SUPPLIER_ALLOW_LIVE_ORDERS!=='false'||flags.some(r=>!['0','false',null].includes(r.v)))throw Error('live_sales_enabled');
  const auth=await api('/authentication/getAccessToken','POST',{apiKey:process.env.CJ_API_KEY});token=auth.accessToken;if(typeof token!=='string'||!token)throw Error('auth_response');
  const shops=await api('/shop/getShops');if(!Array.isArray(shops))throw Error('shops_response');
  const row=await db.cj_products.findUnique({where:{id:ROW}});
  const product=await api('/product/query?pid='+PID),variants=await api('/product/variant/query?pid='+PID),stock=await api('/product/stock/getInventoryByPid?pid='+PID);
  if(!Array.isArray(variants)||!variants.length)throw Error('variants_response');
  const routes=await api('/logistic/freightCalculate','POST',{startCountryCode:'CN',endCountryCode:'SA',zip:'11564',products:[{vid:variants[0].vid,quantity:1}]});
  const plan=buildPlan(shops,row,product,variants,stock.inventories||[],Array.isArray(routes)?routes:routes?.freightList||routes?.list||[]);
  const query='/product/conn/connection?shopId='+SHOP+'&platformProductId='+plan.product.id+'&page=1&pageSize=100';
  function match(data){if(!Array.isArray(data?.list))throw Error('connections_response');return data.list;}
  function exact(lines){return connectionsMatch(lines,plan.connection);}
  let connections=match(await api(query));
  if(connectionIdentitiesMatch(connections,plan.connection)&&!exact(connections)){
   console.log(JSON.stringify({...report,verified:false,identityVerified:true,routingVerified:false,connectedVariants:connections.length,retryPolicy:'existing_identity_preserved_no_metadata_write'}));
   process.exitCode=1;return;
  }
  if(connections.length&&!exact(connections))throw Error('existing_connection_conflict');
  if(!exact(connections)){
   const detail=await api('/shop/product/queryDetail?shopId='+SHOP+'&platformProductIds='+plan.product.id);
   if(!Array.isArray(detail))throw Error('detail_response');
   if(detail.length)throw Error('existing_product_requires_reconciliation');
   console.log(JSON.stringify({event:'connection_intent',shopId:SHOP,productId:plan.product.id,variants:plan.batch.variants.length,pricesOmitted:true}));
   if(await api('/store/product/saveProduct','POST',plan.product)!==true)throw Error('product_save_unverified');
   const saved=await api('/store/product/saveVariantBatch','POST',plan.batch);
   if(!Array.isArray(saved)||saved.length!==plan.batch.variants.length||plan.batch.variants.some(v=>!saved.some(s=>s.id===v.id&&s.productId===v.productId&&s.saveSuccess===true)))throw Error('variant_save_unverified');
   if(await api('/product/conn/connection','POST',plan.connection)!==true)throw Error('connection_write_unverified');
   connections=match(await api(query));
  }
  if(!exact(connections))throw Error('connection_readback_failed');
  console.log(JSON.stringify({...report,verified:true,connectedVariants:connections.length,logistics:plan.connection.logistics}));
 }catch(error){console.error(JSON.stringify({...report,verified:false,error:/^[a-z_]+$/.test(error.message)?error.message:'operation_failed',retryPolicy:'query_and_reconcile_before_any_retry'}));process.exitCode=1;}finally{await db.$disconnect();}
}
module.exports={buildPlan,connectionsMatch,connectionIdentitiesMatch};
if(require.main===module||(module.id==='[stdin]'&&process.argv[1]==='-'))void main();
