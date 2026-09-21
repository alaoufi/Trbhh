'use strict';

/*
 * Non-mutating Salla capability probe. POST probes deliberately send malformed
 * JSON, so they can distinguish an OAuth scope rejection from request parsing
 * without ever reaching order/customer creation.
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
async function responseFact(response){
  const text=(await response.text()).slice(0,65536);let body={};try{body=JSON.parse(text);}catch{}
  const code=typeof body?.error?.code==='string'?body.error.code:typeof body?.error==='string'?body.error:'';
  return {status:response.status,acceptedScope:response.status!==401&&response.status!==403,errorCode:code.slice(0,80)};
}
async function request(path,token,method='GET'){
  const headers={Authorization:`Bearer ${token}`,Accept:'application/json'};
  const init={method,headers,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)};
  if(method==='POST'){headers['Content-Type']='application/json';init.body='{';}
  return responseFact(await fetch(API+path,init));
}
async function main(){
  check(process.env.SUPPLIER_ALLOW_LIVE_ORDERS!=='true','live_orders_enabled');
  const rows=await db.$queryRawUnsafe("SELECT c.id,c.supplier_id,c.external_store_id,c.encrypted_tokens,p.mode FROM supplier_connections c JOIN supplier_integration_profiles p ON p.supplier_id=c.supplier_id WHERE c.provider='salla' AND c.status='connected' AND c.encrypted_tokens IS NOT NULL ORDER BY (p.mode='development') DESC,c.id LIMIT 1");
  check(rows.length===1,'connection_missing');const row=rows[0];
  const token=openTokens(row.encrypted_tokens,`salla:${row.supplier_id}:${row.external_store_id}`,process.env.SUPPLIER_TOKEN_ENCRYPTION_KEY);
  const result={connectionId:String(row.id),storeId:String(row.external_store_id),mode:row.mode,liveOrdersDisabled:true,
    ordersRead:await request('/orders?page=1&per_page=1',token),
    ordersWrite:await request('/orders',token,'POST'),
    customersRead:await request('/customers?page=1&per_page=1',token),
    customersWrite:await request('/customers',token,'POST')};
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
main().catch(error=>{process.stderr.write(`Salla capability probe failed: ${String(error?.message||'unknown').replace(/[^a-zA-Z0-9_-]/g,'_')}\n`);process.exitCode=1;}).finally(()=>db.$disconnect());
