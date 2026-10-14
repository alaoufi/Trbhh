'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
test('runtime gates permit exactly absent to false and preserve pre-existing values',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cj-runtime-proof-'));
 const run=(before,after)=>{const files=['before','after'].map((name,i)=>{const file=path.join(dir,name);fs.writeFileSync(file,JSON.stringify([{Config:{Env:Object.entries(i?after:before).map(([k,v])=>k+'='+v)},Mounts:[]}]));return file;});return spawnSync(process.execPath,[path.join(__dirname,'verify-runtime.cjs'),...files],{encoding:'utf8'}).status;};
 try{for(const key of ['CJ_FULFILLMENT_WORKER_ENABLED','CJ_LIVE_TRIAL_ENABLED','CJ_ALLOW_LIVE_ORDERS']){
  assert.equal(run({},{[key]:'false'}),0);assert.equal(run({[key]:'false'},{[key]:'false'}),0);
  for(const value of ['true','','0','FALSE'])assert.notEqual(run({},{[key]:value}),0);
  assert.notEqual(run({[key]:'false'},{}),0);assert.notEqual(run({[key]:'true'},{[key]:'false'}),0);
 }}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
