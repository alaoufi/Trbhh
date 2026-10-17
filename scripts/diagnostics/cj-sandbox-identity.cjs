'use strict';
const fs=require('node:fs');
const path=require('node:path');
const REFERENCE='trbhh-sbx-34b1f44e-cce8-4f12-9986-be0fd1576dde';
function validate(value){
 if(!value||Object.keys(value).sort().join(',')!=='cjOrderCode,orderId,reference'||value.reference!==REFERENCE||typeof value.orderId!=='string'||!/^\d{6,60}$/.test(value.orderId)||typeof value.cjOrderCode!=='string'||!/^SD\d{6,60}$/.test(value.cjOrderCode))throw Error('sandbox_source_identity_invalid');
 return {reference:value.reference,orderId:value.orderId,cjOrderCode:value.cjOrderCode};
}
function expectedIdentityFromLogs(texts){
 if(!Array.isArray(texts)||texts.length>100)throw Error('sandbox_source_logs_invalid');
 const found=new Map();
 for(const text of texts){
  if(typeof text!=='string'||Buffer.byteLength(text)>2*1024*1024)throw Error('sandbox_source_logs_invalid');
  for(const line of text.split(/\r?\n/)){
   let value;try{value=JSON.parse(line);}catch{continue;}
   if(value?.event!=='CJ_SANDBOX_IDENTIFIED'||value.reference!==REFERENCE)continue;
   const identity=validate({reference:value.reference,orderId:value.orderId,cjOrderCode:value.cjOrderCode});found.set(JSON.stringify(identity),identity);
  }
 }
 if(found.size!==1)throw Error('sandbox_source_identity_missing_or_conflicting');
 return [...found.values()][0];
}
function readExpectedIdentity(file,io=fs){
 const stat=io.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4096)throw Error('sandbox_source_identity_file_invalid');
 return validate(JSON.parse(io.readFileSync(file,'utf8')));
}
function stageExpectedIdentity(root,output,io=fs){
 const base=io.lstatSync(root);if(!base.isDirectory()||base.isSymbolicLink())throw Error('sandbox_source_logs_invalid');
 const names=io.readdirSync(root).filter(name=>/^cj-url-repair-[A-Za-z0-9]+$/.test(name));
 if(names.length>100)throw Error('sandbox_source_logs_invalid');
 const texts=[];
 for(const name of names){
  const dir=path.join(root,name),stat=io.lstatSync(dir);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('sandbox_source_logs_invalid');
  const file=path.join(dir,'sandbox-result.log');if(!io.existsSync(file))continue;
  const log=io.lstatSync(file);if(!log.isFile()||log.isSymbolicLink()||log.size>2*1024*1024)throw Error('sandbox_source_logs_invalid');
  texts.push(io.readFileSync(file,'utf8'));
 }
 const expected=expectedIdentityFromLogs(texts);
 io.writeFileSync(output,JSON.stringify(expected)+'\n',{mode:0o644,flag:'wx'});
 // The SSH wrapper uses umask 077; these synthetic IDs contain no secrets.
 io.chmodSync(output,0o644);
 return expected;
}
module.exports={expectedIdentityFromLogs,readExpectedIdentity,stageExpectedIdentity};
