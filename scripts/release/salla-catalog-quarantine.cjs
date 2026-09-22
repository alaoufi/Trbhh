'use strict';

/*
 * One-purpose, fail-closed release tool for the proven shabiat24.com/demo-store
 * mismatch. It preserves source rows and price history by moving them to an
 * inactive archive supplier/connection. It never creates, refreshes or uses an
 * order and cannot operate while live supplier ordering is enabled.
 */
const {createDecipheriv,createHash}=require('node:crypto');
const {PrismaClient}=require('@prisma/client');
const plan=module.exports.catalogFingerprint?module.exports:require('./salla-catalog-quarantine-plan.cjs');

const EXPECTED={supplierId:1n,connectionId:1n,storeUrl:'https://shabiat24.com',wrongStoreId:'1921390206',productCount:20};
const MARKER='catalog_quarantine:shabiat24.com:1921390206';
const ARCHIVE_PROVIDER='salla_archive';
const CONFIRM='QUARANTINE_DEMO_MERCHANT_1921390206';
const db=new PrismaClient({log:[]});

function check(value,code='catalog_quarantine_unsafe'){if(!value)throw Error(code);}
function string(value){return typeof value==='string'?value:String(value??'');}
function number(value){const n=Number(value);check(Number.isSafeInteger(n)&&n>=0);return n;}
function key(raw){check(/^[a-fA-F0-9]{64}$/.test(raw||''),'encryption_key');return Buffer.from(raw,'hex');}
function openTokens(sealed,context,rawKey){
  const parts=String(sealed||'').split('.');check(parts.length===4&&parts[0]==='v1','token_format');
  const iv=Buffer.from(parts[1],'base64url'),tag=Buffer.from(parts[2],'base64url');check(iv.length===12&&tag.length===16,'token_format');
  const decipher=createDecipheriv('aes-256-gcm',key(rawKey),iv);decipher.setAAD(Buffer.from(context));decipher.setAuthTag(tag);
  const value=JSON.parse(Buffer.concat([decipher.update(Buffer.from(parts[3],'base64url')),decipher.final()]).toString('utf8'));
  check(typeof value.accessToken==='string'&&value.accessToken,'token_value');return value.accessToken;
}
async function identity(token){
  const response=await fetch('https://accounts.salla.sa/oauth2/user/info',{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
  check(response.ok,`identity_${response.status}`);const body=await response.json(),merchant=body?.data?.merchant;
  check(body?.success===true&&merchant&&merchant.id&&merchant.domain,'identity_invalid');
  return {id:string(merchant.id),name:string(merchant.name),domain:string(merchant.domain).replace(/\/+$/,'')};
}
async function footprint(client,connectionId){
  const [row]=await client.$queryRawUnsafe(`SELECT
    COUNT(*) AS total,COALESCE(SUM(active=1),0) AS active,COALESCE(SUM(visible=1),0) AS visible,
    COALESCE(SUM(featured=1),0) AS featured,COALESCE(SUM(commerce_product_id IS NOT NULL),0) AS commerceLinked,
    (SELECT COUNT(*) FROM supplier_price_history h JOIN supplier_products p2 ON p2.id=h.supplier_product_id WHERE p2.connection_id=?) AS priceHistory,
    (SELECT COUNT(*) FROM supplier_price_tiers t JOIN supplier_products p2 ON p2.id=t.supplier_product_id WHERE p2.connection_id=?) AS priceTiers,
    (SELECT COUNT(*) FROM supplier_stock_reservations r JOIN supplier_products p2 ON p2.id=r.supplier_product_id WHERE p2.connection_id=?) AS reservations,
    (SELECT COUNT(*) FROM supplier_orders so WHERE so.connection_id=?) AS supplierOrders,
    (SELECT COUNT(*) FROM supplier_webhook_events we WHERE we.connection_id=?) AS webhookEvents
    FROM supplier_products p WHERE p.connection_id=?`,connectionId,connectionId,connectionId,connectionId,connectionId,connectionId);
  return row;
}
async function products(client,connectionId,lock=false){
  return client.$queryRawUnsafe(`SELECT id,external_id,sku,name FROM supplier_products WHERE connection_id=? ORDER BY id${lock?' FOR UPDATE':''}`,connectionId);
}
async function beforeState(){
  check(process.env.SUPPLIER_ALLOW_LIVE_ORDERS!=='true','live_orders_enabled');
  const rows=await db.$queryRawUnsafe(`SELECT s.id AS supplier_id,s.name,c.id AS connection_id,c.external_store_id,c.status,c.encrypted_tokens,c.version,
    p.mode,p.sync_enabled,p.auto_orders_enabled,p.maintenance,o.store_url
    FROM commerce_suppliers s JOIN supplier_onboarding o ON o.supplier_id=s.id
    JOIN supplier_integration_profiles p ON p.supplier_id=s.id AND p.provider='salla'
    JOIN supplier_connections c ON c.supplier_id=s.id AND c.provider='salla'
    WHERE s.id=? AND c.id=? AND o.store_url=? AND c.external_store_id=?`,EXPECTED.supplierId,EXPECTED.connectionId,EXPECTED.storeUrl,EXPECTED.wrongStoreId);
  check(rows.length===1);const row=rows[0];
  check(row.status==='connected'&&row.maintenance===0&&row.encrypted_tokens);
  const token=openTokens(row.encrypted_tokens,`salla:${row.supplier_id}:${row.external_store_id}`,process.env.SUPPLIER_TOKEN_ENCRYPTION_KEY);
  const merchant=await identity(token),items=await products(db,row.connection_id),counts=await footprint(db,row.connection_id);
  const candidate={supplierId:row.supplier_id,connectionId:row.connection_id,storeUrl:row.store_url,externalStoreId:row.external_store_id,
    identityId:merchant.id,identityDomain:merchant.domain,mode:row.mode,...counts};
  plan.assertSafeCandidate(candidate,EXPECTED);
  return {row,merchant,items,counts,fingerprint:plan.catalogFingerprint(items),tokenCipherHash:createHash('sha256').update(row.encrypted_tokens).digest('hex')};
}
async function verifyAfter(){
  const [original]=await db.$queryRawUnsafe(`SELECT s.id,s.name,p.sync_enabled,p.auto_orders_enabled,p.mode,p.last_error,p.oauth_generation,o.store_url,
    (SELECT COUNT(*) FROM supplier_connections c WHERE c.supplier_id=s.id) AS connections,
    (SELECT COUNT(*) FROM supplier_products sp WHERE sp.supplier_id=s.id) AS products
    FROM commerce_suppliers s JOIN supplier_onboarding o ON o.supplier_id=s.id JOIN supplier_integration_profiles p ON p.supplier_id=s.id
    WHERE s.id=? AND o.store_url=?`,EXPECTED.supplierId,EXPECTED.storeUrl);
  check(original);
  const archives=await db.$queryRawUnsafe(`SELECT s.id AS archive_supplier_id,s.active,c.id AS connection_id,c.supplier_id,c.provider,c.external_store_id,c.status,
    c.encrypted_tokens,(SELECT COUNT(*) FROM supplier_products sp WHERE sp.connection_id=c.id AND sp.supplier_id=s.id) AS products,
    (SELECT COUNT(*) FROM supplier_price_history h JOIN supplier_products sp ON sp.id=h.supplier_product_id WHERE sp.connection_id=c.id) AS priceHistory
    FROM commerce_suppliers s JOIN supplier_connections c ON c.supplier_id=s.id WHERE s.notes=? AND c.id=?`,MARKER,EXPECTED.connectionId);
  check(archives.length===1);const archive=archives[0];
  const [catalog]=await db.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM supplier_products sp
    JOIN supplier_connections c ON c.id=sp.connection_id AND c.supplier_id=sp.supplier_id
    JOIN supplier_integration_profiles ip ON ip.supplier_id=sp.supplier_id
    WHERE sp.supplier_id=? AND c.provider='salla' AND ip.provider='salla'`,EXPECTED.supplierId);
  const remaining=await db.$queryRawUnsafe('SELECT id,external_id,sku,name FROM supplier_products WHERE supplier_id=? ORDER BY id',EXPECTED.supplierId);
  check(number(original.connections)===0&&number(original.products)===0&&number(catalog.n)===0&&remaining.length===0);
  check(original.sync_enabled===0&&original.auto_orders_enabled===0&&original.mode==='development'&&original.last_error==='merchant_identity_mismatch');
  check(archive.provider===ARCHIVE_PROVIDER&&archive.external_store_id===EXPECTED.wrongStoreId&&archive.status==='disconnected'&&archive.encrypted_tokens===null);
  check(number(archive.products)===EXPECTED.productCount&&number(archive.priceHistory)===EXPECTED.productCount&&archive.active===0);
  return {supplier:{id:string(original.id),name:original.name,storeUrl:original.store_url,productCount:number(original.products),connectionCount:number(original.connections),catalogCount:number(catalog.n),remainingProducts:remaining},archive:{supplierId:string(archive.archive_supplier_id),connectionId:string(archive.connection_id),provider:archive.provider,status:archive.status,source:`salla-merchant:${archive.external_store_id}`,productCount:number(archive.products),priceHistoryCount:number(archive.priceHistory),tokensRemoved:archive.encrypted_tokens===null}};
}
async function apply(expectedFingerprint,confirmation){
  check(confirmation===CONFIRM,'catalog_quarantine_confirmation');
  check(/^[a-f0-9]{64}$/.test(expectedFingerprint||''),'catalog_quarantine_fingerprint');
  const before=await beforeState();check(before.fingerprint===expectedFingerprint,'catalog_quarantine_changed');
  const archiveSupplierId=await db.$transaction(async tx=>{
    const rows=await tx.$queryRawUnsafe(`SELECT s.id AS supplier_id,c.id AS connection_id,c.external_store_id,c.status,c.encrypted_tokens,c.version,
      p.mode,p.sync_enabled,p.auto_orders_enabled,p.maintenance,o.store_url
      FROM commerce_suppliers s JOIN supplier_onboarding o ON o.supplier_id=s.id
      JOIN supplier_integration_profiles p ON p.supplier_id=s.id AND p.provider='salla'
      JOIN supplier_connections c ON c.supplier_id=s.id AND c.provider='salla'
      WHERE s.id=? AND c.id=? AND o.store_url=? AND c.external_store_id=? FOR UPDATE`,EXPECTED.supplierId,EXPECTED.connectionId,EXPECTED.storeUrl,EXPECTED.wrongStoreId);
    check(rows.length===1);const row=rows[0];
    check(row.status==='connected'&&row.maintenance===0&&row.encrypted_tokens&&row.version===before.row.version);
    check(createHash('sha256').update(row.encrypted_tokens).digest('hex')===before.tokenCipherHash,'catalog_quarantine_changed');
    const items=await products(tx,row.connection_id,true);check(plan.catalogFingerprint(items)===expectedFingerprint,'catalog_quarantine_changed');
    const counts=await footprint(tx,row.connection_id);
    plan.assertSafeCandidate({supplierId:row.supplier_id,connectionId:row.connection_id,storeUrl:row.store_url,externalStoreId:row.external_store_id,
      identityId:before.merchant.id,identityDomain:before.merchant.domain,mode:row.mode,...counts},EXPECTED);
    const existing=await tx.$queryRawUnsafe('SELECT id FROM commerce_suppliers WHERE notes=? FOR UPDATE',MARKER);check(existing.length===0,'catalog_quarantine_exists');
    const inserted=await tx.$executeRawUnsafe(`INSERT INTO commerce_suppliers(name,notes,active,api_enabled) VALUES(?,?,0,0)`,`عزل متجر سلة التجريبي ${EXPECTED.wrongStoreId}`,MARKER);check(inserted===1);
    const [archiveSupplier]=await tx.$queryRawUnsafe('SELECT LAST_INSERT_ID() AS id');check(archiveSupplier?.id);
    const movedProducts=await tx.$executeRawUnsafe(`UPDATE supplier_products SET supplier_id=?,active=0,visible=0,featured=0,sync_error='merchant_quarantined',revision=revision+1 WHERE connection_id=? AND supplier_id=?`,archiveSupplier.id,EXPECTED.connectionId,EXPECTED.supplierId);
    check(movedProducts===EXPECTED.productCount,'catalog_quarantine_changed');
    const movedConnection=await tx.$executeRawUnsafe(`UPDATE supplier_connections SET supplier_id=?,provider=?,status='disconnected',encrypted_tokens=NULL,expires_at=NULL,refresh_claim=NULL,refresh_claimed_at=NULL,sync_claim=NULL,sync_claimed_at=NULL,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=? AND supplier_id=? AND provider='salla' AND external_store_id=?`,archiveSupplier.id,ARCHIVE_PROVIDER,EXPECTED.connectionId,EXPECTED.supplierId,EXPECTED.wrongStoreId);
    check(movedConnection===1,'catalog_quarantine_changed');
    const resetProfile=await tx.$executeRawUnsafe(`UPDATE supplier_integration_profiles SET oauth_generation=oauth_generation+1,sync_enabled=0,auto_orders_enabled=0,mode='development',last_sync_at=NULL,last_error='merchant_identity_mismatch' WHERE supplier_id=? AND provider='salla'`,EXPECTED.supplierId);check(resetProfile===1);
    await tx.$executeRawUnsafe(`INSERT INTO admin_log(admin_id,action,target,note) VALUES(0,'عزل كتالوج سلة خاطئ',?,?)`,String(EXPECTED.supplierId),`connection=${EXPECTED.connectionId};merchant=${EXPECTED.wrongStoreId};products=${EXPECTED.productCount};archive_supplier=${archiveSupplier.id}`);
    return archiveSupplier.id;
  },{isolationLevel:'Serializable'});
  return {before:{supplierId:string(EXPECTED.supplierId),connectionId:string(EXPECTED.connectionId),storeUrl:EXPECTED.storeUrl,merchantId:before.merchant.id,merchantName:before.merchant.name,merchantDomain:before.merchant.domain,productCount:number(before.counts.total),fingerprint:before.fingerprint},archiveSupplierId:string(archiveSupplierId),after:await verifyAfter()};
}
async function main(){
  const mode=process.argv[2]||'inspect';let result;
  if(mode==='inspect'){
    const state=await beforeState();result={mode,readOnly:true,supplierId:string(state.row.supplier_id),connectionId:string(state.row.connection_id),storeUrl:state.row.store_url,merchant:{id:state.merchant.id,name:state.merchant.name,domain:state.merchant.domain},productCount:number(state.counts.total),footprint:Object.fromEntries(Object.entries(state.counts).map(([k,v])=>[k,number(v)])),fingerprint:state.fingerprint};
  }else if(mode==='apply')result={mode,mutated:true,...await apply(process.argv[3],process.argv[4])};
  else if(mode==='verify')result={mode,readOnly:true,after:await verifyAfter()};
  else throw Error('catalog_quarantine_mode');
  process.stdout.write(JSON.stringify({ok:true,liveOrdersDisabled:true,...result},null,2)+'\n');
}
main().catch(error=>{process.stderr.write(`Salla catalog quarantine failed: ${String(error?.message||'unknown').replace(/[^a-zA-Z0-9_-]/g,'_')}\n`);process.exitCode=1;}).finally(()=>db.$disconnect());
