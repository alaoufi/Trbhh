'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const {TARGET_STORE, URLS, reportPublicKey, encryptReport, decryptStoredTokens, providerGet, inspect, inspectConnection} = require('./salla-connection-inspect.cjs');

const encryptionKey = 'c'.repeat(64);
function seal(accessToken='PRIVATE_ACCESS_TOKEN', refreshToken='PRIVATE_REFRESH_TOKEN') {
  const iv=crypto.randomBytes(12), cipher=crypto.createCipheriv('aes-256-gcm',Buffer.from(encryptionKey,'hex'),iv);
  cipher.setAAD(Buffer.from('salla:7:12345'));
  const body=Buffer.concat([cipher.update(JSON.stringify({accessToken,refreshToken})),cipher.final()]);
  return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),body.toString('base64url')].join('.');
}
const row = () => ({id:9n,supplier_id:7n,external_store_id:'12345',status:'connected',encrypted_tokens:seal(),refresh_claim:null});
const ok = data => new Response(JSON.stringify({success:true,...data}),{status:200});

test('node stdin execution fails closed before DB when report encryption key is absent',()=>{
  const source=readFileSync(path.join(__dirname,'salla-connection-inspect.cjs'),'utf8');
  const processResult=spawnSync(process.execPath,['-'],{input:source,encoding:'utf8',env:{...process.env,SALLA_AUDIT_REPORT_PUBLIC_KEY_B64:''}});
  assert.equal(processResult.status,1);assert.equal(processResult.stdout,'');assert.equal(processResult.stderr,'Salla inspection refused: encrypted report key required.\n');
});

test('stored token decryption uses merchant-bound AAD without exposing refresh token',()=>{
  assert.deepEqual(decryptStoredTokens(row(),encryptionKey),{accessToken:'PRIVATE_ACCESS_TOKEN',refreshTokenPresent:true});
  assert.throws(()=>decryptStoredTokens({...row(),external_store_id:'999'},encryptionKey),/^Error: stored_token_decryption_failed$/);
});
test('report is OAEP SHA256 encrypted with authenticated ciphertext and fresh keys',()=>{
  const {publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
  const encoded=publicKey.export({type:'spki',format:'pem'}).toString();
  const key=reportPublicKey({SALLA_AUDIT_REPORT_PUBLIC_KEY_B64:Buffer.from(encoded).toString('base64')});
  const report={store:TARGET_STORE,id:'12345'}, envelope=encryptReport(report,key);
  assert.equal(JSON.stringify(envelope).includes(TARGET_STORE),false);
  assert.notEqual(envelope.iv,encryptReport(report,key).iv);
  const raw=crypto.privateDecrypt({key:privateKey,padding:crypto.constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(envelope.wrappedKey,'base64'));
  const decipher=crypto.createDecipheriv('aes-256-gcm',raw,Buffer.from(envelope.iv,'base64'));
  decipher.setAAD(Buffer.from(envelope.aad,'base64'));decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
  assert.deepEqual(JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64')),decipher.final()]).toString()),report);
  assert.throws(()=>reportPublicKey({}),/report_encryption_key_invalid/);
});
test('diagnosis uses only fixed GETs and whitelists store/product data',async()=>{
  const calls=[];
  const result=await inspectConnection(row(),{SUPPLIER_TOKEN_ENCRYPTION_KEY:encryptionKey},async(url,options)=>{
    calls.push(url);assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer PRIVATE_ACCESS_TOKEN');assert.equal(options.body,undefined);
    if(url===URLS.identity)return ok({data:{merchant:{id:12345},email:'PRIVATE_CONTACT'}});
    if(url===URLS.store)return ok({data:{id:12345,name:TARGET_STORE,domain:'https://salla.sa/test?secret=PRIVATE_QUERY',status:'active',currency:'SAR',email:'PRIVATE_CONTACT',licenses:{tax_number:'PRIVATE_TAX'}}});
    return ok({data:[{id:77,name:'منتج تجربة',price:{amount:49.5,currency:'SAR'},quantity:12,is_available:true,cost_price:5,description:'PRIVATE_DESCRIPTION'}],pagination:{total:73}});
  });
  assert.deepEqual(calls,Object.values(URLS));assert.equal(result.connected,true);assert.equal(result.tokenValid,true);assert.equal(result.productCount,73);assert.equal(result.productFetched,true);assert.equal(result.product.price,'49.5');assert.equal(result.product.quantity,12);
  assert.equal(JSON.stringify(result).includes('PRIVATE_'),false);assert.equal(result.refreshTokenValidity,'not_tested_read_only');
});
test('401 does not refresh, persist, leak response body or call more APIs',async()=>{
  let calls=0;
  const result=await inspectConnection(row(),{SUPPLIER_TOKEN_ENCRYPTION_KEY:encryptionKey},async()=>{calls++;return new Response('PRIVATE_PROVIDER_ERROR',{status:401});});
  assert.equal(calls,1);assert.equal(result.tokenValid,false);assert.equal(result.connected,false);assert.equal(JSON.stringify(result).includes('PRIVATE_'),false);
});
test('identity mismatch stops catalog access, and network errors remain unknown validity',async()=>{
  let calls=0;
  const mismatch=await inspectConnection(row(),{SUPPLIER_TOKEN_ENCRYPTION_KEY:encryptionKey},async()=>{calls++;return ok({data:{merchant:{id:555}}});});
  assert.equal(calls,1);assert.deepEqual(mismatch.errors,['merchant_identity_mismatch']);
  const unavailable=await inspectConnection(row(),{SUPPLIER_TOKEN_ENCRYPTION_KEY:encryptionKey},async()=>{throw Error('PRIVATE_ERROR');});
  assert.equal(unavailable.tokenValid,null);assert.deepEqual(unavailable.errors,['provider_request_failed']);
});
test('a differently named provider store is inspected only for identity, never products',async()=>{
  const calls=[];
  const result=await inspectConnection(row(),{SUPPLIER_TOKEN_ENCRYPTION_KEY:encryptionKey},async url=>{
    calls.push(url);return url===URLS.identity?ok({data:{merchant:{id:12345}}}):ok({data:{id:12345,name:'متجر آخر'}});
  });
  assert.deepEqual(calls,[URLS.identity,URLS.store]);assert.equal(result.targetStoreMatch,false);assert.equal(result.productFetched,false);assert.deepEqual(result.errors,['target_store_name_mismatch']);
});
test('no token or active refresh claim causes no provider request',async()=>{
  const fail=async()=>{throw Error('unexpected_fetch');};
  assert.deepEqual((await inspectConnection({...row(),encrypted_tokens:null},{},fail)).errors,['stored_token_missing']);
  assert.deepEqual((await inspectConnection({...row(),refresh_claim:'claimed'},{},fail)).errors,['token_refresh_in_progress']);
});
test('response size is bounded and only hard-coded endpoints are allowed',async()=>{
  await assert.rejects(()=>providerGet('http://attacker','token',async()=>{throw Error('unexpected');}),/audit_endpoint_not_allowed/);
  const result=await providerGet('identity','token',async()=>new Response('a'.repeat(2*1024*1024+1)));
  assert.equal(result.error,'provider_response_too_large');
});
test('inspection issues SELECT statements only, reports missing target connection and effective flags',async()=>{
  const statements=[];
  const db={$queryRawUnsafe:async sql=>{
    statements.push(sql);assert.match(sql,/^SELECT /);assert.doesNotMatch(sql,/\b(?:UPDATE|INSERT|DELETE|ALTER|CREATE)\b/);
    if(sql.includes('FROM site_settings'))return [{k:'commerce_purchasing_enabled',v:'0'}];
    if(sql.includes('FROM commerce_suppliers'))return [{id:7n,name:TARGET_STORE,active:1,provider:'salla',mode:'development'}];
    return [];
  }};
  const result=await inspect(db,{SUPPLIER_ALLOW_LIVE_ORDERS:'false'},async()=>{throw Error('unexpected_fetch');});
  assert.equal(statements.length,6);assert.deepEqual(result.errors,['target_connection_missing']);assert.equal(result.flags.commerce_purchasing_enabled.enabled,false);assert.equal(result.flags.SUPPLIER_ALLOW_LIVE_ORDERS.explicitlyFalse,true);assert.equal(result.productsPublished,false);
});
