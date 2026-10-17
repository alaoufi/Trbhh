const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const file='scripts/release/manual-cj-webhook-completion.sh',source=fs.readFileSync(file,'utf8');
test('completion job and embedded result verifier parse',()=>{
 const shell=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
 const r=spawnSync(shell,['-n',file],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 const js=source.match(/<<'NODE'\n([\s\S]*?)\nNODE/)[1];
 const check=spawnSync(process.execPath,['--check'],{input:js,encoding:'utf8'});assert.equal(check.status,0,check.stderr);
});
test('completion requires verified CJ simulation and both independently received signals',()=>{
 const js=source.match(/<<'NODE'\n([\s\S]*?)\nNODE/)[1];
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cj-completion-')),log=path.join(dir,'result.log');
 try{for(const [simulation,payment,tracking,expected] of [[true,true,true,0],[false,true,true,2],[true,false,true,2],[true,true,false,2]]){
  fs.writeFileSync(log,JSON.stringify({event:'TRBHH_INBOUND_RESULT',cjSimulationVerified:simulation,paidStatusReceived:payment,trackingReceived:tracking}));
  const r=spawnSync(process.execPath,['-',log],{input:js,encoding:'utf8'});assert.equal(r.status,expected,r.stderr);
 }}finally{fs.unlinkSync(log);fs.rmdirSync(dir);}
});
