'use strict';
const fs=require('node:fs'),path=require('node:path');
const {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes}=require('node:crypto');
const CALLBACK='https://trbhh.sa/api/integrations/cj/webhooks';
const keyContext=apiKey=>'cj:webhook:'+createHash('sha256').update(apiKey).digest('hex');
function seal(value,context,key){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);cipher.setAAD(Buffer.from(context));
 const text=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
 return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),text.toString('base64url')].join('.');
}
function unseal(raw,context,key){
 const [version,iv,tag,body,extra]=raw.split('.');if(version!=='v1'||extra!==undefined)throw Error('existing_private_key_invalid');
 const d=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),Buffer.from(iv,'base64url'));d.setAAD(Buffer.from(context));d.setAuthTag(Buffer.from(tag,'base64url'));
 return JSON.parse(Buffer.concat([d.update(Buffer.from(body,'base64url')),d.final()]).toString('utf8'));
}
function topic(value){
 if(!value||!['ENABLE','CANCEL'].includes(value.type))throw Error('existing_callback_settings_incomplete');
 const urls=value.urls??value.callbackUrls;
 if(!Array.isArray(urls)||urls.length>1||urls.some(u=>typeof u!=='string'||u.length>2048||!u.startsWith('https://')))throw Error('existing_callback_urls_invalid');
 if(value.type==='ENABLE'&&urls.length!==1)throw Error('existing_callback_settings_incomplete');
 return {type:value.type,callbackUrls:urls};
}
function readCallbacks(settings){
 const source=settings.callback;
 if(!source||typeof source!=='object'||Array.isArray(source))throw Error('existing_callback_settings_incomplete');
 // Live /setting/get returns singular `logistic`; /webhook/set documents plural.
 if(source.logistic!=null&&source.logistics!=null&&JSON.stringify(topic(source.logistic))!==JSON.stringify(topic(source.logistics)))throw Error('callback_alias_conflict');
 const callback={...source};delete callback.logistic;
 if(source.logistic!=null&&source.logistics==null)callback.logistics=source.logistic;
 return callback;
}
function registration(settings){
 const callback=readCallbacks(settings);
 // Required topics must be read and preserved, never guessed or cancelled.
 const result={product:topic(callback.product),stock:topic(callback.stock)};
 for(const name of ['order','logistics']){
  if(callback[name]){const previous=topic(callback[name]);if(previous.type==='ENABLE'&&previous.callbackUrls[0]!==CALLBACK)throw Error('callback_conflict_manual_review');}
  result[name]={type:'ENABLE',callbackUrls:[CALLBACK]};
 }
 for(const name of ['makeup','privateOrder','dispute'])if(callback[name])result[name]=topic(callback[name]);
 // CJ requires one URL even for CANCEL (confirmed rejection: "URL is empty").
 // Supplying the receiver address must never change the inactive topic's type.
 for(const value of Object.values(result))if(value.type==='CANCEL'&&value.callbackUrls.length===0)value.callbackUrls=[CALLBACK];
 return result;
}
function verifyRegistration(after,expected){
 const callback=readCallbacks(after);
 return Object.entries(expected).every(([name,wanted])=>{const actual=topic(callback[name]);return JSON.stringify(actual)===JSON.stringify(wanted)||(wanted.type==='CANCEL'&&actual.type==='CANCEL'&&actual.callbackUrls.length===0&&wanted.callbackUrls.length===1&&wanted.callbackUrls[0]===CALLBACK);});
}
function inspectSettings(settings){
 const callback=readCallbacks(settings);
 const topics=Object.fromEntries(['product','stock','order','logistics','makeup','privateOrder','dispute'].map(name=>{
  const item=callback[name],urls=item?.urls??item?.callbackUrls;
  return [name,{present:!!item,type:['ENABLE','CANCEL'].includes(item?.type)?item.type:null,urlCount:Array.isArray(urls)?urls.length:null,expectedDestination:Array.isArray(urls)&&urls.length===1&&urls[0]===CALLBACK}];
 }));
 let registrationValid=false,registrationIssue=null;
 try{registration(settings);registrationValid=true;}catch(e){registrationIssue=/^[a-z_]+$/.test(e.message)?e.message:'settings_invalid';}
 return {topics,registrationValid,registrationIssue};
}
function claimActivation(settings,storage,resume=false,io=fs){
 if(![false,true,'empty-url'].includes(resume))throw Error('setup_claim_mode_invalid');
 if(resume){
  // Resume only the exact inactive state inspected after the rejected write.
  const callback=readCallbacks(settings),names=Object.keys(callback).filter(name=>callback[name]!=null).sort().join(',');
  if(!['order,product,stock','logistics,order,product,stock'].includes(names)||!['product','stock','order',...(callback.logistics?['logistics']:[])].every(name=>{const value=callback[name],urls=value?.urls??value?.callbackUrls;return value?.type==='CANCEL'&&Array.isArray(urls)&&urls.length===0;}))throw Error('reviewed_resume_state_changed');
  const previous=io.lstatSync(path.join(storage,resume==='empty-url'?'cj-webhook-activation-reviewed-resume-once':'cj-webhook-activation-once'));
  if(!previous.isDirectory()||previous.isSymbolicLink())throw Error('previous_setup_claim_invalid');
 }
 io.mkdirSync(path.join(storage,resume==='empty-url'?'cj-webhook-empty-url-repair-once':resume?'cj-webhook-activation-reviewed-resume-once':'cj-webhook-activation-once'));
 return resume==='empty-url'?'cj-webhook-empty-url-before.sealed':resume?'cj-webhook-resume-before.sealed':'cj-webhook-callbacks-before.sealed';
}
async function verifyReceiver(openId,fetcher=fetch){
 const options={method:'POST',redirect:'error',signal:AbortSignal.timeout(10000)};
 const unsigned=await fetcher(CALLBACK,{...options,headers:{'Content-Type':'application/json'},body:'null'});
 if(unsigned.status!==401)throw Error('receiver_not_ready_deploy_first');
 const sign=createHmac('sha256',openId).update('null').digest('base64');
 const signed=await fetcher(CALLBACK,{...options,signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json',sign},body:'null'});
 if(signed.status!==400)throw Error('official_signature_not_verified');
}
async function setupApi(token,pathName,body,fetcher=fetch){
 if(!['/setting/get','/webhook/set'].includes(pathName)||((pathName==='/webhook/set')!==!!body))throw Error('setup_endpoint_blocked');
 const {safeProviderMessage}=require('./cj-sandbox-probe.cjs');
 for(let attempt=0;attempt<3;attempt++){
  await new Promise(r=>setTimeout(r,attempt?4000*2**attempt:3000));
  const r=await fetcher('https://developers.cjdropshipping.com/api2.0/v1'+pathName,{method:body?'POST':'GET',headers:{'CJ-Access-Token':token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(20000)});
  const j=await r.json();if(!body&&(r.status===429||j.code===1600200)&&attempt<2)continue;
  if(!r.ok||j.code!==200||j.result!==true){const e=Error('cj_setup_rejected');Object.assign(e,{endpoint:pathName,httpStatus:r.status,requestId:typeof j.requestId==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(j.requestId)?j.requestId:null,providerCode:j.code,providerMessage:safeProviderMessage(j.message,token)});throw e;}return j.data;
 }
}
async function main(){
 const {PrismaClient}=require('@prisma/client'),{decryptToken}=require('./cj-catalog-audit.cjs'),db=new PrismaClient({log:[]});
 let stage='initial';const secrets=[];
 try{
  const mode=process.argv[2];if(!['--prepare','--activate','--inspect','--reviewed-resume','--repair-empty-url'].includes(mode))throw Error('setup_mode_required');
  const key=process.env.SUPPLIER_TOKEN_ENCRYPTION_KEY||'',apiKey=process.env.CJ_API_KEY||'';
  secrets.push(key,apiKey);
  if(!/^[a-f0-9]{64}$/i.test(key)||!apiKey)throw Error('encryption_configuration_missing');
  const [auth]=await db.$queryRawUnsafe('SELECT sealed_tokens,access_expires_at FROM cj_auth WHERE id=1 LIMIT 1');
  const token=decryptToken(auth,key);secrets.push(token);stage='settings_read';const settings=await setupApi(token,'/setting/get');
  const openId=typeof settings.openId==='string'?settings.openId:Number.isSafeInteger(settings.openId)?String(settings.openId):'';
  if(!/^[1-9]\d{0,63}$/.test(openId))throw Error('source_signing_identity_invalid');
  secrets.push(openId);
  if(process.env.CJ_WEBHOOK_OPEN_ID&&process.env.CJ_WEBHOOK_OPEN_ID.trim()!==openId)throw Error('configured_account_mismatch');
  const storage=path.resolve(process.env.STORAGE_DIR||'/app/storage'),file=path.join(storage,'cj-webhook-auth.sealed');
  if(['--reviewed-resume','--repair-empty-url'].includes(mode)&&!fs.existsSync(file))throw Error('previous_private_key_required');
  if(mode==='--inspect'){
   const facts=inspectSettings(settings);stage='inspect_receiver';
   console.log(JSON.stringify({event:'CJ_WEBHOOK_SETTINGS_INSPECTED',...facts,activationPreviouslyAttempted:fs.existsSync(path.join(storage,'cj-webhook-activation-once')),privateKeyPresent:fs.existsSync(file),configurationWriteAttempted:false,realPaymentAttempted:false}));
   await verifyReceiver(openId);
   console.log(JSON.stringify({event:'CJ_WEBHOOK_RECEIVER_VERIFIED',configurationWriteAttempted:false,realPaymentAttempted:false}));return;
  }
  stage='private_key_prepare';
  if(fs.existsSync(file)){
   const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4096||(stat.mode&0o077)!==0)throw Error('existing_private_key_invalid');
   const saved=unseal(fs.readFileSync(file,'utf8').trim(),keyContext(apiKey),key);
   if(saved.accessToken!==openId||saved.refreshToken!=='cj-webhook-auth-v1')throw Error('existing_private_key_mismatch');
  }else fs.writeFileSync(file,seal({accessToken:openId,refreshToken:'cj-webhook-auth-v1'},keyContext(apiKey),key),{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({event:'CJ_WEBHOOK_KEY_PREPARED',encrypted:true,credentialsPrinted:false,accountQpsLimit:Number.isSafeInteger(settings.setting?.qpsLimit)?settings.setting.qpsLimit:null}));
  if(mode==='--prepare')return;
  // null is rejected before event insertion; differential status proves official auth.
  stage='receiver_verify';await verifyReceiver(openId);
  stage='registration_validate';
  const config=registration(settings);
  const current=readCallbacks(settings);
  const ready=['order','logistics'].every(name=>{const value=current[name];return value?.type==='ENABLE'&&(value.urls??value.callbackUrls)?.length===1&&(value.urls??value.callbackUrls)[0]===CALLBACK;});
  if(!ready){
   const backup=claimActivation(settings,storage,mode==='--repair-empty-url'?'empty-url':mode==='--reviewed-resume');
   fs.writeFileSync(path.join(storage,backup),seal({accessToken:JSON.stringify(settings.callback),refreshToken:'cj-webhook-backup-v1'},'cj:webhook-backup',key),{mode:0o600,flag:'wx'});
   stage='callback_write';if(await setupApi(token,'/webhook/set',config)!==true)throw Error('callback_write_unverified');
  }
  stage='callback_readback';const after=await setupApi(token,'/setting/get');
  if(!verifyRegistration(after,config))throw Error('callback_readback_unverified');
  console.log(JSON.stringify({event:'CJ_WEBHOOK_REGISTERED',orderEnabled:true,logisticsEnabled:true,topics:inspectSettings(after).topics,deliveryVerified:false,realPaymentAttempted:false}));
 }catch(e){let message=e.providerMessage??null;if(message)for(const secret of secrets.filter(Boolean))message=message.split(secret).join('[REDACTED]');console.log(JSON.stringify({event:'CJ_WEBHOOK_SETUP_STOPPED',stage,reason:e.code==='EEXIST'?'previous_setup_attempt_review_required':/^[a-z_]+$/.test(e.message)?e.message:'setup_failed',endpoint:e.endpoint??null,httpStatus:e.httpStatus??null,requestId:e.requestId??null,providerMessage:message,providerCode:e.providerCode??null,realPaymentAttempted:false}));process.exitCode=1;}
 finally{await db.$disconnect();}
}
module.exports={seal,keyContext,registration,setupApi,verifyReceiver,verifyRegistration,inspectSettings,claimActivation};
if(require.main===module)main().catch(()=>{console.log('SETUP_START_FAILED');process.exitCode=1;});
