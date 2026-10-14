'use strict';
const {createHash}=require('node:crypto');
const ENV_KEYS=['CJ_ALLOW_LIVE_ORDERS','CJ_FULFILLMENT_WORKER_ENABLED','CJ_LIVE_TRIAL_ENABLED'];
const SETTING_KEYS=['commerce_gateway_enabled','commerce_payments_enabled','commerce_purchasing_enabled'];
const digest=value=>createHash('sha256').update(value).digest('hex');
function validArguments(mode,run,sha){if(!['inspect','enable','restore'].includes(mode)||! /^[1-9][0-9]{0,19}$/.test(run)||! /^[a-f0-9]{40}$/.test(sha))throw Error('activation_arguments');}
function desiredEnvironment(before){
 if(typeof before!=='string'||before.includes('\0'))throw Error('activation_env_invalid');
 const counts=new Map(ENV_KEYS.map(key=>[key,0]));let result='';
 for(const line of before.match(/[^\n]*\n|[^\n]+$/g)||[]){
  const m=line.match(/^([ \t]*(?:export[ \t]+)?(CJ_ALLOW_LIVE_ORDERS|CJ_FULFILLMENT_WORKER_ENABLED|CJ_LIVE_TRIAL_ENABLED)[ \t]*=[ \t]*)(false|"false"|'false')([ \t]*(?:#[^\r\n]*)?)(\r?\n)?$/);
  const key=line.match(/^[ \t]*(?:export[ \t]+)?(CJ_ALLOW_LIVE_ORDERS|CJ_FULFILLMENT_WORKER_ENABLED|CJ_LIVE_TRIAL_ENABLED)[ \t]*=/)?.[1];
  if(key&&!m)throw Error('activation_env_value');
  if(!m){result+=line;continue;}
  if(counts.get(m[2]))throw Error('activation_env_duplicate');counts.set(m[2],1);
  result+=m[1]+m[3].replace('false','true')+m[4]+(m[5]||'');
 }
 const missing=ENV_KEYS.filter(key=>!counts.get(key));if(missing.length){if(result&&!result.endsWith('\n'))result+='\n';result+=missing.map(key=>key+'=true\n').join('');}
 return result;
}
function states(value){
 if(!Array.isArray(value)||value.length!==3)throw Error('activation_settings_shape');
 return SETTING_KEYS.map(key=>{const rows=value.filter(row=>row&&row.k===key);if(rows.length!==1||typeof rows[0].present!=='boolean'||rows[0].v!==null&&typeof rows[0].v!=='string'||!rows[0].present&&rows[0].v!==null)throw Error('activation_settings_shape');return {k:key,present:rows[0].present,v:rows[0].v};});
}
const equal=(a,b)=>JSON.stringify(states(a))===JSON.stringify(states(b));
function guardProof(proof,enable){if(!proof||proof.publicOff!==true||proof.sharedOff!==true||enable&&(proof.bankReady!==true||proof.outboxEmpty!==true))throw Error('activation_not_ready');}
function owned(current,backup){if(current.env!==backup.beforeEnv&&current.env!==backup.desiredEnv||!equal(current.settings,backup.beforeSettings)&&!equal(current.settings,backup.desiredSettings)||current.runtimeOwned!==true)throw Error('activation_owned_state_drift');guardProof(current.proof,false);}
function validateBackup(backup,run,sha){if(!backup||backup.version!==1||backup.runId!==run||backup.sha!==sha||backup.beforeHash!==digest(backup.beforeEnv)||backup.desiredHash!==digest(backup.desiredEnv)||! /^sha256:[a-f0-9]{64}$/.test(backup.imageId))throw Error('activation_backup_invalid');states(backup.beforeSettings);states(backup.desiredSettings);}
async function restoreSaved(backup,io){
 const current=await io.current(backup);owned(current,backup);
 if(current.env===backup.beforeEnv&&equal(current.settings,backup.beforeSettings)&&backup.status==='restored'&&current.runtimeBefore===true){await io.verify(backup,'before');return;}
 await io.mark(backup,'restoring');
 if(current.env!==backup.beforeEnv)await io.replaceEnvironment(current.env,backup.beforeEnv);
 if(!equal(current.settings,backup.beforeSettings))await io.casSettings(current.settings,backup.beforeSettings,false);
 await io.recreate(backup,'before');await io.verify(backup,'before');await io.mark(backup,'restored');
}
async function operate(mode,run,sha,io){
 validArguments(mode,run,sha);await io.preflight(mode,sha);
 if(mode==='inspect'){const baseline=await io.capture();return {event:'cj_private_activation',mode,sha,ready:baseline.proof.bankReady===true&&baseline.proof.publicOff===true&&baseline.proof.sharedOff===true&&baseline.proof.outboxEmpty===true,bankReady:baseline.proof.bankReady===true,bankCredentialsReady:baseline.proof.bankCredentialsReady===true,cjApiReady:baseline.proof.cjApiReady===true,encryptionReady:baseline.proof.encryptionReady===true,workerSecretReady:baseline.proof.workerSecretReady===true,publicOff:baseline.proof.publicOff===true,sharedOff:baseline.proof.sharedOff===true,outboxEmpty:baseline.proof.outboxEmpty===true};}
 let backup=await io.load(run);
 if(!backup){
  if(mode!=='enable')throw Error('activation_backup_missing');
  const baseline=await io.capture();guardProof(baseline.proof,true);
  const beforeSettings=states(baseline.settings);if(baseline.proof.privateOff!==true||beforeSettings.some(row=>row.present&&row.v!==null&&row.v!=='0'))throw Error('activation_not_ready');
  backup={version:1,runId:run,sha,status:'prepared',imageId:baseline.imageId,beforeEnv:baseline.env,desiredEnv:desiredEnvironment(baseline.env),beforeSettings,desiredSettings:SETTING_KEYS.map(k=>({k,present:true,v:'1'})),runtime:baseline.runtime};
  backup.beforeHash=digest(backup.beforeEnv);backup.desiredHash=digest(backup.desiredEnv);await io.save(backup);
 }
 validateBackup(backup,run,sha);
 if(mode==='restore'){await restoreSaved(backup,io);return {event:'cj_private_activation',mode,sha,status:'restored'};}
 const current=await io.current(backup);owned(current,backup);guardProof(current.proof,true);
 if(current.env===backup.desiredEnv&&equal(current.settings,backup.desiredSettings)&&backup.status==='enabled'){await io.verify(backup,'desired');return {event:'cj_private_activation',mode,sha,status:'enabled'};}
 try{
  await io.mark(backup,'enabling');
  if(current.env!==backup.desiredEnv)await io.replaceEnvironment(current.env,backup.desiredEnv);
  if(!equal(current.settings,backup.desiredSettings))await io.casSettings(current.settings,backup.desiredSettings,true);
  await io.recreate(backup,'desired');await io.verify(backup,'desired');await io.mark(backup,'enabled');
 }catch{
  try{await restoreSaved(backup,io);}catch{try{await io.mark(backup,'restore_blocked');}catch{}throw Error('activation_failed_restore_blocked');}
  throw Error('activation_failed_restored');
 }
 return {event:'cj_private_activation',mode,sha,status:'enabled'};
}
module.exports={operate,desiredEnvironment,validArguments,validateBackup,states,digest,ENV_KEYS,SETTING_KEYS};
