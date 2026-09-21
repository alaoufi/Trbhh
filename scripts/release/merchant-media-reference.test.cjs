'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {parseSums,inspectParent,prepare,verify,PARENT_ID,PARENT_COMMIT,DEPLOYED_COMMIT}=require('./merchant-media-reference.cjs');
const hash=value=>createHash('sha256').update(value).digest('hex');
function fixture(){
  const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'trbhh-media-reference-'))),parent=path.join(base,'audit-'+PARENT_ID),child=path.join(base,'audit-999');
  fs.chmodSync(base,0o700);fs.mkdirSync(parent,{mode:0o700});fs.mkdirSync(child,{mode:0o700});
  const files={'VERIFIED':PARENT_COMMIT,'commit.txt':PARENT_COMMIT,'DEPLOYMENT_VERIFIED':DEPLOYED_COMMIT,'database.sql.gz':'database','code.tar.gz':'code','image.tar.gz':'image','storage.tar.gz':'storage','legacy.tar.gz':'legacy'};
  files['container-after.json']=JSON.stringify([{Image:'sha256:'+'a'.repeat(64)}]);
  fs.writeFileSync(path.join(child,'container-before.json'),files['container-after.json'],{mode:0o600});
  const manifest=JSON.stringify({format:'trbhh-media-proof-v1',capturedAt:'2026-09-21T00:00:00Z',entryCount:0,entries:[]});
  for(const label of ['storage','legacy']){files[label+'.path']='/app/'+label+'\n';files[label+'-before.json']=manifest;}
  files.SHA256SUMS=Object.entries(files).filter(([name])=>name.endsWith('.gz')).map(([name,data])=>hash(data)+'  '+name+'\n').join('');
  for(const [name,data] of Object.entries(files))fs.writeFileSync(path.join(parent,name),data,{mode:0o600});
  return {base,parent,child,cleanup(){assert.equal(fs.realpathSync(base),base);assert(path.basename(base).startsWith('trbhh-media-reference-'));fs.rmSync(base,{recursive:true,force:true});}};
}
test('copies only media manifests and pins every parent archive without changing parent',()=>{
  const f=fixture();try{
    const before=fs.readdirSync(f.parent).map(name=>[name,hash(fs.readFileSync(path.join(f.parent,name)))]);
    assert.deepEqual(prepare(f.parent,f.child,f.base),{ok:true,referencedMedia:2});
    assert.equal(verify(f.child,f.base).ok,true);
    const names=fs.readdirSync(f.child);assert.equal(names.length,7);assert(!names.some(name=>name.endsWith('.tar.gz')||name.endsWith('-extracted')));
    const saved=JSON.parse(fs.readFileSync(path.join(f.child,'PARENT_MEDIA_REFERENCE.json')));assert.equal(saved.parentDeployment,DEPLOYED_COMMIT);assert.equal(Object.keys(saved.archives).length,5);
    assert.deepEqual(before,fs.readdirSync(f.parent).map(name=>[name,hash(fs.readFileSync(path.join(f.parent,name)))]));
  }finally{f.cleanup();}
});
test('rejects unverified, wrong deployment and wrong parent directory before reference creation',()=>{
  for(const marker of ['VERIFIED','DEPLOYMENT_VERIFIED','commit.txt']){
    const f=fixture();try{fs.writeFileSync(path.join(f.parent,marker),'wrong');assert.throws(()=>prepare(f.parent,f.child,f.base));assert.deepEqual(fs.readdirSync(f.child),['container-before.json']);}finally{f.cleanup();}
  }
  const f=fixture();try{assert.throws(()=>inspectParent(f.child,f.base));assert.throws(()=>prepare(f.parent,f.parent,f.base));}finally{f.cleanup();}
});
test('requires current running image to match the parent verified deployment',()=>{
  const f=fixture();try{
    fs.writeFileSync(path.join(f.child,'container-before.json'),JSON.stringify([{Image:'sha256:'+'b'.repeat(64)}]));
    assert.throws(()=>prepare(f.parent,f.child,f.base));
    assert(!fs.existsSync(path.join(f.child,'PARENT_MEDIA_REFERENCE.json')));
  }finally{f.cleanup();}
});
test('rejects archive corruption and subsequent manifest, reference or archive mutation',()=>{
  for(const target of ['storage.tar.gz','database.sql.gz','legacy-before.json']){
    const f=fixture();try{prepare(f.parent,f.child,f.base);fs.appendFileSync(path.join(f.parent,target),'changed');assert.throws(()=>verify(f.child,f.base));}finally{f.cleanup();}
  }
  const f=fixture();try{fs.appendFileSync(path.join(f.parent,'image.tar.gz'),'bad');assert.throws(()=>prepare(f.parent,f.child,f.base));}finally{f.cleanup();}
});
test('rejects changed child manifests and duplicate media archives',()=>{
  for(const target of ['storage-before.json','storage.tar.gz']){
    const f=fixture();try{prepare(f.parent,f.child,f.base);fs.writeFileSync(path.join(f.child,target),'changed');assert.throws(()=>verify(f.child,f.base));}finally{f.cleanup();}
  }
});
test('rejects missing media pairs and unsafe or duplicated SHA256SUMS targets',()=>{
  const f=fixture();try{fs.unlinkSync(path.join(f.parent,'legacy.path'));assert.throws(()=>prepare(f.parent,f.child,f.base));}finally{f.cleanup();}
  for(const name of ['../storage.tar.gz','/tmp/storage.tar.gz','storage.tar.gz\n','other.tar.gz'])assert.throws(()=>parseSums(hash('data')+'  '+name));
  const line=hash('data')+'  storage.tar.gz\n';assert.throws(()=>parseSums(line+line));
});
test('merchant headers checkpoint pins exact parent and baseline while retaining fresh restore and supplier proof',()=>{
  const source=fs.readFileSync(path.join(__dirname,'safeguards.sh'),'utf8');
  assert.match(source,/elif \[\[ "\$release_profile" == merchant_headers \]\]; then\s+\[\[ "\$current_commit" == 5f8dbc01c38bf431a9ae099a581b80536097b346 && "\$reuse_media_id" == 35603864905/);
  assert(source.indexOf('merchant-media-reference.cjs" prepare')<source.indexOf('docker image save'));
  assert(source.indexOf('merchant-media-reference.cjs" verify')<source.indexOf('> "$backup/DEPLOYMENT_VERIFIED"'));
  assert(source.includes('verify "$backup/$label-current.json" "$backup/$label-before.json"'));
  assert(source.includes('node - dump < "$tools_dir/database-proof.cjs"'));
  assert(source.includes('verify-restore-full "$backup/full-before.json" "$backup/full-restored.json"'));
  assert(source.includes('verify "$backup/supplier-before.json" "$backup/supplier-after.json"'));
});
