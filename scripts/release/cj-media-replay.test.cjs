'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process');
const file=path.join(__dirname,'cj-media-replay.sh'),bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'/bin/bash';
test('isolated archive replay entrypoint parses',()=>{const result=spawnSync(bash,['-n',file],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);});
test('invalid replay identifiers are rejected before any external command',()=>{
 for(const args of [[],['0'],['../../private'],['12;secret'],['12','extra']]){
  const result=spawnSync(bash,[file,...args],{encoding:'utf8',env:{...process.env,PATH:'/no-external-commands'}});assert.equal(result.status,2,result.stderr);assert.match(result.stderr,/CJ media replay arguments rejected/);assert.equal(result.stdout,'');
 }
});

test('cleanup refuses changed scratch identity instead of reporting successful replay',()=>{
 const fs=require('node:fs'),source=fs.readFileSync(file,'utf8'),cleanup=source.match(/cleanup\(\) \{[\s\S]*?\n\}\ntrap cleanup/)[0].replace(/\ntrap cleanup$/,'');
 const script=`${cleanup}\ndocker(){ return 1; }\nrealpath(){ echo /outside; }\nrm(){ echo UNSAFE_DELETE; }\nscratch=/owned;reader=temporary;run_id=1;success=1;exec 3>&1 4>&2;cleanup`;
 const result=spawnSync(bash,['-c',script],{encoding:'utf8'});assert.equal(result.status,1);assert.equal(result.stdout,'');assert.match(result.stderr,/CJ media replay failed/);
});

test('only owned scratch cleanup success may issue replay success',()=>{
 const fs=require('node:fs'),source=fs.readFileSync(file,'utf8'),cleanup=source.match(/cleanup\(\) \{[\s\S]*?\n\}\ntrap cleanup/)[0].replace(/\ntrap cleanup$/,'');
 for(const rmStatus of [0,1]){
  const script=`${cleanup}\ndocker(){ return 1; }\nrealpath(){ echo "$1"; }\nrm(){ [[ "$*" == "-rf -- /owned/extracted" ]] || return 1; return ${rmStatus}; }\nscratch=/owned;reader=temporary;run_id=1;success=1;exec 3>&1 4>&2;cleanup`;
  const result=spawnSync(bash,['-c',script],{encoding:'utf8'});assert.equal(result.status,rmStatus);if(rmStatus===0){assert.equal(JSON.parse(result.stdout).archiveReplaySucceeded,true);}else{assert.equal(result.stdout,'');assert.match(result.stderr,/replay failed/);}
 }
});
