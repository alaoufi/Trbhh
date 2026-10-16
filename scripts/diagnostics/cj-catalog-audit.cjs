// Read-only audit of EVERY imported product. No order/payment/reserve/token refresh.
'use strict';
const {createDecipheriv}=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const ORIGIN='https://developers.cjdropshipping.com/api2.0/v1';
const allowed=new Set(['/product/query','/product/variant/query','/product/stock/getInventoryByPid','/logistic/freightCalculate']);
const identity=v=>String(v??'').trim();
const number=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const parse=v=>typeof v==='string'?JSON.parse(v):v;
function variant(v){return {vid:identity(v.vid??v.variantId??v.id),sku:identity(v.variantSku??v.sku),name:identity(v.variantNameEn??v.variantName??v.nameEn??v.nameen??v.variantKey),key:identity(v.variantKey??v.variantKeyEn??v.variantProperty),price:number(v.variantSellPrice??v.sellPrice??v.sellprice),weight:number(v.variantWeight??v.weight)};}
function storedVariant(v){return {vid:identity(v.vid),sku:identity(v.sku),name:identity(v.name),key:identity(v.optionKey),price:number(v.priceUsd),weight:number(v.weight)};}
function unwrap(data){if(data?.code===1600200)throw Error('cj_quota_or_auth_stop');if(data?.code!==200||!(data.result===true||data.success===true))throw Error('cj_read_rejected');return data.data;}
function compareVariants(saved,live){
 const issues=[];const seen=new Set();const byId=new Map(live.map(variant).map(v=>[v.vid,v]));
 if(byId.size!==live.length||byId.has(''))issues.push({issue:'live_vid_invalid_or_duplicate'});
 for(const raw of saved){const s=storedVariant(raw),v=byId.get(s.vid);if(!s.vid||seen.has(s.vid)){issues.push({vid:s.vid,issue:'stored_vid_invalid_or_duplicate'});continue;}seen.add(s.vid);
  if(!v){issues.push({vid:s.vid,issue:'variant_missing_at_cj'});continue;}
  for(const field of ['sku','name','key','price','weight'])if(s[field]!==v[field])issues.push({vid:s.vid,issue:`${field}_changed`});
  if(!v.sku||v.price===null||v.price<=0)issues.push({vid:s.vid,issue:'invalid_live_sku_or_price'});
 }
 for(const vid of byId.keys())if(!seen.has(vid))issues.push({vid,issue:'variant_missing_in_trbhh'});
 return issues;
}
async function auditProduct(row,api,zip){
 const issues=[];const details=parse(row.details_json)||{};const saved=Array.isArray(details.variants)?details.variants:[];
 const product=await api('/product/query','GET',{pid:row.cj_product_id});
 if(identity(product?.pid??product?.productId??product?.id)!==identity(row.cj_product_id))throw Error('live_pid_mismatch');
 let variants=Array.isArray(product.variants)?product.variants:Array.isArray(product.stanProducts)?product.stanProducts:null;
 if(!variants)variants=await api('/product/variant/query','GET',{pid:row.cj_product_id});
 if(!Array.isArray(variants))throw Error('variants_shape');
 issues.push(...compareVariants(saved,variants));
 if(!saved.length)issues.push({issue:'stored_variants_missing'});
 if(identity(row.cj_sku)!==identity(product.productSku??product.sku))issues.push({issue:'source_product_sku_changed'});
 if(identity(row.source_description)!==identity(product.description))issues.push({issue:'source_description_changed'});
 if(identity(row.name)!==identity(product.productNameEn??product.productName??product.nameEn))issues.push({issue:'source_title_changed'});
 if(!/[\u0600-\u06ff]/.test(row.name_ar||''))issues.push({issue:'arabic_title_missing'});
 if(!/[\u0600-\u06ff]/.test(row.display_description_ar||''))issues.push({issue:'arabic_description_missing'});
 const inv=await api('/product/stock/getInventoryByPid','GET',{pid:row.cj_product_id});
 if(!Array.isArray(inv?.variantInventories))throw Error('inventory_shape');
 const inventory=new Map(inv.variantInventories.map(g=>[identity(g.vid),g.inventory]));
 const observations=[];
 for(const raw of variants){const v=variant(raw);const entries=inventory.get(v.vid);
  if(!Array.isArray(entries)){issues.push({vid:v.vid,issue:'inventory_unverified'});continue;}
  const stockRows=entries.map(e=>({country:identity(e.countryCode).toUpperCase(),quantity:number(e.totalInventory??e.storageNum??e.totalInventoryNum)}));
  if(stockRows.some(e=>e.quantity===null||e.quantity<0||!Number.isSafeInteger(e.quantity))){issues.push({vid:v.vid,issue:'inventory_invalid'});continue;}
  const quantity=stockRows.reduce((n,e)=>n+e.quantity,0);const origins=[...new Set(stockRows.filter(e=>e.quantity>0&&/^[A-Z]{2}$/.test(e.country)).map(e=>e.country))];
  if(quantity===0){observations.push({vid:v.vid,stock:0,shipping:'not_quoted_out_of_stock'});continue;}
  if(!origins.length){issues.push({vid:v.vid,issue:'stock_origin_unverified'});continue;}
  let routes=0;
  for(const origin of origins){const quotes=await api('/logistic/freightCalculate','POST',{startCountryCode:origin,endCountryCode:'SA',zip,products:[{vid:v.vid,quantity:1}]});
   if(!Array.isArray(quotes))throw Error('freight_shape');
   routes+=quotes.filter(q=>identity(q.logisticName??q.logisticAisle)&&number(q.logisticPrice)!==null&&number(q.logisticPrice)>=0).length;
  }
  if(!routes)issues.push({vid:v.vid,issue:'no_verified_shipping_to_destination'});
  observations.push({vid:v.vid,stock:quantity,shippingRoutes:routes});
 }
 return {event:'CJ_PRODUCT_AUDIT',id:String(row.id),pid:row.cj_product_id,storedVariants:saved.length,liveVariants:variants.length,issues,observations,observedAt:new Date().toISOString()};
}
function decryptToken(auth,key){
 const expiry=new Date(auth?.access_expires_at).getTime();
 if(!/^[a-f0-9]{64}$/i.test(key||'')||!Number.isFinite(expiry)||expiry<=Date.now())throw Error('stored_token_missing_or_expired');
 const [v,iv,tag,body,extra]=identity(auth?.sealed_tokens).split('.');if(v!=='v1'||!iv||!tag||!body||extra!==undefined)throw Error('stored_token_invalid');
 const d=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),Buffer.from(iv,'base64url'));d.setAAD(Buffer.from('cj:auth'));d.setAuthTag(Buffer.from(tag,'base64url'));
 const parsed=JSON.parse(Buffer.concat([d.update(Buffer.from(body,'base64url')),d.final()]).toString('utf8'));
 if(typeof parsed.accessToken!=='string'||!parsed.accessToken)throw Error('stored_token_invalid');return parsed.accessToken;
}
async function main(){
 const {PrismaClient}=require('@prisma/client');const db=new PrismaClient({log:[]});const started=Date.now();let calls=0,last=0,completed=0,failed=0,issues=0,total=0;const emit=x=>console.log(JSON.stringify(x));
 const zip=process.argv[2];if(!/^\d{5}$/.test(zip||''))throw Error('destination_zip_required');
 try{
  const commit=fs.readFileSync('/app/RELEASE_COMMIT','utf8').trim();
  const rows=await db.$queryRawUnsafe('SELECT id,cj_product_id,cj_sku,name,name_ar,source_description,display_description_ar,details_json FROM cj_products ORDER BY id');total=rows.length;
  const [auth]=await db.$queryRawUnsafe('SELECT sealed_tokens,access_expires_at FROM cj_auth WHERE id=1 LIMIT 1');const token=decryptToken(auth,process.env.SUPPLIER_TOKEN_ENCRYPTION_KEY);
  emit({event:'CJ_AUDIT_BEGIN',commit,total,zip,scope:'all_imported_rows_all_live_variants',writes:0,payments:0});
  const api=async(endpoint,method,params)=>{
   if(!allowed.has(endpoint)||method!==(endpoint==='/logistic/freightCalculate'?'POST':'GET'))throw Error('endpoint_not_readonly');
   if(calls>=20000||Date.now()-started>10800000)throw Error('audit_budget_exhausted');
   const memory=/MemAvailable:\s+(\d+)/.exec(fs.readFileSync('/proc/meminfo','utf8'));if(!memory||Number(memory[1])<4*1024*1024||os.loadavg()[0]>os.cpus().length*2)throw Error('resource_guard_stop');
   const gap=1500-(Date.now()-last);if(gap>0)await new Promise(r=>setTimeout(r,gap));last=Date.now();calls++;
   const url=new URL(ORIGIN+endpoint);if(method==='GET')for(const [k,v]of Object.entries(params))url.searchParams.set(k,String(v));
   const res=await fetch(url,{method,headers:{'CJ-Access-Token':token,'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(params)}:{}),signal:AbortSignal.timeout(20000),redirect:'error'});
   if(res.status===429||res.status===401||res.status===403)throw Error('cj_quota_or_auth_stop');
   if(!res.ok)throw Error('cj_read_failed');
   const reader=res.body?.getReader();if(!reader)throw Error('empty_response');const chunks=[];let size=0;for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>4*1024*1024){await reader.cancel();throw Error('response_too_large');}chunks.push(Buffer.from(value));}
   return unwrap(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  };
  let consecutiveFailures=0;
  for(const row of rows){try{const result=await auditProduct(row,api,zip);issues+=result.issues.length;emit(result);completed++;consecutiveFailures=0;}catch(e){if(['audit_budget_exhausted','resource_guard_stop','cj_quota_or_auth_stop'].includes(e.message))throw e;failed++;emit({event:'CJ_PRODUCT_UNVERIFIED',id:String(row.id),reason:'upstream_or_data_check_failed'});if(++consecutiveFailures>=3)throw Error('repeated_read_failure_stop');}}
  emit({event:'CJ_AUDIT_COMPLETE',total,completed,failed,issues,calls,allRowsChecked:completed+failed===total,structuralChecksPassed:total>0&&completed===total&&failed===0&&issues===0,paymentRoundTrip:'NOT_TESTED_NO_PAYMENT',sarCheckout:'NOT_EXERCISED_LIVE',imageContents:'NOT_VISUALLY_VERIFIED',variantAttributes:'NOT_COMPARED',translationSemantics:'NOT_REVIEWED_FOR_EVERY_PRODUCT',allDataVerified:false,seconds:Math.round((Date.now()-started)/1000)});
 }catch{emit({event:'CJ_AUDIT_INCOMPLETE',total,completed,failed,issues,calls,accepted:false,reason:'audit_stopped_safely_no_mutations'});process.exitCode=1;}finally{await db.$disconnect();}
}
module.exports={compareVariants,auditProduct,decryptToken,unwrap,main};
if(require.main===module)main().catch(()=>{console.error('CJ_AUDIT_START_FAILED');process.exitCode=1;});
