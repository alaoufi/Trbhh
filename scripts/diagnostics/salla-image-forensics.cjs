'use strict';

/*
 * Read-only supplier image trace. It never refreshes OAuth, starts a sync, or
 * writes to the database. Tokens are decrypted only in memory and never logged.
 */
const {createDecipheriv}=require('node:crypto');
const {PrismaClient}=require('@prisma/client');

const db=new PrismaClient({log:[]});
const API='https://api.salla.dev/admin/v2';
function check(value,code){if(!value)throw Error(code);}
function key(raw){check(/^[a-fA-F0-9]{64}$/.test(raw||''),'encryption_key');return Buffer.from(raw,'hex');}
function openTokens(sealed,context,rawKey){
  const parts=String(sealed||'').split('.');check(parts.length===4&&parts[0]==='v1','token_format');
  const iv=Buffer.from(parts[1],'base64url'),tag=Buffer.from(parts[2],'base64url');
  check(iv.length===12&&tag.length===16,'token_format');
  const decipher=createDecipheriv('aes-256-gcm',key(rawKey),iv);
  decipher.setAAD(Buffer.from(context));decipher.setAuthTag(tag);
  const value=JSON.parse(Buffer.concat([decipher.update(Buffer.from(parts[3],'base64url')),decipher.final()]).toString('utf8'));
  check(typeof value.accessToken==='string'&&value.accessToken,'token_value');return value.accessToken;
}
function object(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
function list(value){return Array.isArray(value)?value:[];}
function string(value){return typeof value==='string'?value:String(value??'');}
function imageUrls(product){return list(object(product).images).map(item=>string(object(item).url)).filter(Boolean);}
function amount(product){const value=object(object(product).price).amount;return value===undefined?null:String(value);}
function productLink(product){
  const p=object(product),urls=object(p.urls);
  for(const value of [p.url,urls.customer,urls.admin,urls.product])if(typeof value==='string'&&/^https:\/\//.test(value))return value;
  return null;
}
function sourceProduct(product){const p=object(product);return {externalId:string(p.id),sku:string(p.sku),name:string(p.name),price:amount(p),quantity:p.unlimited_quantity===true?null:p.quantity??null,imageUrls:imageUrls(p),link:productLink(p)};}
function storedImages(value){try{return list(typeof value==='string'?JSON.parse(value):value).filter(item=>typeof item==='string');}catch{return [];}}
async function get(path,token){
  const response=await fetch(API+path,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
  check(response.ok,`http_${response.status}`);const body=await response.json();check(body?.success===true,'api_response');return body;
}
function exact(a,b){return JSON.stringify(a)===JSON.stringify(b);}
async function main(){
  check(process.env.SUPPLIER_ALLOW_LIVE_ORDERS!=='true','live_orders_enabled');
  const suppliers=await db.$queryRawUnsafe("SELECT s.id,s.name,c.id AS connection_id,c.external_store_id,c.status,c.encrypted_tokens,p.mode,p.sync_enabled,p.last_sync_at,p.last_error,o.store_url FROM commerce_suppliers s JOIN supplier_connections c ON c.supplier_id=s.id AND c.provider='salla' JOIN supplier_integration_profiles p ON p.supplier_id=s.id AND p.provider='salla' LEFT JOIN supplier_onboarding o ON o.supplier_id=s.id WHERE s.name LIKE '%شعبي%' ORDER BY s.id LIMIT 5");
  check(suppliers.length>0,'supplier_missing');
  const report=[];
  for(const supplier of suppliers){
    const token=openTokens(supplier.encrypted_tokens,`salla:${supplier.connection_id}:${supplier.external_store_id}`,process.env.SUPPLIER_TOKEN_ENCRYPTION_KEY);
    const identity=await fetch('https://accounts.salla.sa/oauth2/user/info',{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
    check(identity.ok,`identity_${identity.status}`);const identityBody=await identity.json(),merchant=object(identityBody?.data?.merchant),identityId=string(merchant.id);
    const count=await db.$queryRawUnsafe('SELECT COUNT(*) AS n FROM supplier_products WHERE connection_id=?',supplier.connection_id);
    const rows=await db.$queryRawUnsafe('SELECT id,external_id,sku,name,public_price_minor,quantity,images,last_sync_at,source_updated_at FROM supplier_products WHERE connection_id=? ORDER BY id DESC LIMIT 20',supplier.connection_id);
    const pageBody=await get('/products?page=1&per_page=60',token),page=list(pageBody.data).map(sourceProduct),pageById=new Map(page.map(item=>[item.externalId,item]));
    const samples=[];
    for(const row of rows.slice(0,8)){
      const detailBody=await get(`/products/${encodeURIComponent(row.external_id)}`,token),detail=sourceProduct(detailBody.data),listed=pageById.get(string(row.external_id))||null,images=storedImages(row.images);
      samples.push({db:{rowId:string(row.id),externalId:string(row.external_id),sku:string(row.sku),name:string(row.name),priceMinor:Number(row.public_price_minor),quantity:row.quantity,imageUrls:images,lastSyncAt:row.last_sync_at,sourceUpdatedAt:row.source_updated_at},detail,listed,proof:{identityMatchesConnection:identityId===string(supplier.external_store_id),externalIdMatches:detail.externalId===string(row.external_id),skuMatches:detail.sku===string(row.sku),nameMatches:detail.name===string(row.name),priceMatches:Number(detail.price)*100===Number(row.public_price_minor),quantityMatches:detail.quantity===row.quantity,imagesMatch:exact(detail.imageUrls,images),listAndDetailImagesMatch:listed?exact(listed.imageUrls,detail.imageUrls):null,listAndDetailRecordMatch:listed?listed.externalId===detail.externalId&&listed.sku===detail.sku&&listed.name===detail.name:null}});
    }
    report.push({supplier:{id:string(supplier.id),name:supplier.name,connectionId:string(supplier.connection_id),externalStoreId:string(supplier.external_store_id),identityId,identityName:string(merchant.name),identityDomain:string(merchant.domain),status:supplier.status,mode:supplier.mode,storeUrl:supplier.store_url,syncEnabled:Boolean(supplier.sync_enabled),lastSyncAt:supplier.last_sync_at,lastError:supplier.last_error,storedProductCount:Number(count[0].n),sourceFirstPageCount:page.length},samples});
  }
  process.stdout.write(JSON.stringify({ok:true,readOnly:true,liveOrdersDisabled:true,report},(_,value)=>typeof value==='bigint'?String(value):value,2)+'\n');
}
main().catch(error=>{process.stderr.write(`Salla image forensics failed: ${String(error?.message||'unknown').replace(/[^a-zA-Z0-9_-]/g,'_')}\n`);process.exitCode=1;}).finally(()=>db.$disconnect());
