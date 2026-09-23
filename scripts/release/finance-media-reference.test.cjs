'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(x).digest('hex');
const helper=()=>require('./finance-media-reference.cjs');
function fixture(){
  const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'finance-media-reference-'))),parent=path.join(base,'audit-35603864905'),child=path.join(base,'finance-123');
  fs.chmodSync(base,0o700);fs.mkdirSync(parent,{mode:0o700});fs.mkdirSync(child,{mode:0o700});
  const manifest=JSON.stringify({format:'trbhh-media-proof-v1',capturedAt:'2026-09-23T00:00:00Z',entryCount:1,entries:[{path:'photo.jpg',kind:'file',bytes:3,sha256:hash('abc')}]});
  const files={'VERIFIED':'07d2e9ead8e0b28824102d5c8a31b097e01f9459','commit.txt':'07d2e9ead8e0b28824102d5c8a31b097e01f9459','DEPLOYMENT_VERIFIED':'5f8dbc01c38bf431a9ae099a581b80536097b346','container-after.json':JSON.stringify([{Image:'sha256:'+'a'.repeat(64)}]),'database.sql.gz':'database','code.tar.gz':'code','image.tar.gz':'image','storage.tar.gz':'storage','legacy.tar.gz':'legacy'};
  for(const label of ['storage','legacy']){files[label+'.path']='/app/'+label+'\n';files[label+'-before.json']=manifest;}
  files.SHA256SUMS=Object.entries(files).filter(([name])=>name.endsWith('.gz')).map(([name,data])=>hash(data)+'  '+name+'\n').join('');
  for(const [name,data] of Object.entries(files))fs.writeFileSync(path.join(parent,name),data,{mode:0o600});
  const checkpoint=path.join(base,'audit-35607654850');fs.mkdirSync(checkpoint,{mode:0o700});
  const sealed={'VERIFIED':'5f8dbc01c38bf431a9ae099a581b80536097b346','commit.txt':'5f8dbc01c38bf431a9ae099a581b80536097b346','candidate.txt':'415a8fe593522859f4cf85c2fa10e47a7d40109b','DEPLOYMENT_VERIFIED':'415a8fe593522859f4cf85c2fa10e47a7d40109b','REUSED_MEDIA_SOURCE':'35603864905\n','PARENT_MEDIA_REFERENCE.json':JSON.stringify(require('./merchant-media-reference.cjs').inspectParent(parent,base))+'\n'};
  for(const label of ['storage','legacy'])for(const suffix of ['.path','-before.json'])sealed[label+suffix]=files[label+suffix];
  sealed.SHA256SUMS=['PARENT_MEDIA_REFERENCE.json','REUSED_MEDIA_SOURCE','storage.path','legacy.path','storage-before.json','legacy-before.json'].map(name=>hash(sealed[name])+'  '+name+'\n').join('');
  for(const [name,data] of Object.entries(sealed))fs.writeFileSync(path.join(checkpoint,name),data,{mode:0o600});
  // The current application's image deliberately differs from the old media parent.
  fs.writeFileSync(path.join(child,'container-before.json'),JSON.stringify([{Image:'sha256:'+'b'.repeat(64)}]));
  return {base,parent,checkpoint,child,manifest,cleanup:()=>fs.rmSync(base,{recursive:true,force:true})};
}
test('retained parent supplies only pinned manifests without constraining the fresh app image or modifying parent',()=>{
  const f=fixture();try{
    const before=fs.readdirSync(f.parent).map(n=>[n,hash(fs.readFileSync(path.join(f.parent,n)))]);
    assert.equal(helper().inspect(f.parent,f.base).parent.parentId,'35603864905');
    assert.deepEqual(helper().prepare(f.parent,f.child,f.base),{ok:true,referencedMedia:2});assert.equal(helper().verify(f.child,f.base).ok,true);
    const names=fs.readdirSync(f.child);assert(names.includes('FINANCE_MEDIA_REFERENCE.json'));assert(!names.some(n=>n.endsWith('.tar.gz')||n.endsWith('-extracted')));
    assert.deepEqual(before,fs.readdirSync(f.parent).map(n=>[n,hash(fs.readFileSync(path.join(f.parent,n)))]));
  }finally{f.cleanup();}
});
test('missing or corrupted parent archives fail before creating a reference and after a checkpoint is prepared',()=>{
  for(const file of ['storage.tar.gz','legacy.tar.gz','database.sql.gz','image.tar.gz'])for(const change of ['remove','corrupt']){
    const f=fixture();try{
      const target=path.join(f.parent,file);if(change==='remove')fs.unlinkSync(target);else fs.appendFileSync(target,'changed');
      assert.throws(()=>helper().inspect(f.parent,f.base));assert.throws(()=>helper().prepare(f.parent,f.child,f.base));assert(!fs.existsSync(path.join(f.child,'FINANCE_MEDIA_REFERENCE.json')));
    }finally{f.cleanup();}
  }
  const f=fixture();try{helper().prepare(f.parent,f.child,f.base);fs.appendFileSync(path.join(f.parent,'storage.tar.gz'),'changed');assert.throws(()=>helper().verify(f.child,f.base));}finally{f.cleanup();}
});
test('reference, marker, manifest and path corruption or duplicate child archives invalidate verification',()=>{
  for(const file of ['FINANCE_MEDIA_REFERENCE.json','storage-before.json','legacy.path','storage.tar.gz']){
    const f=fixture();try{helper().prepare(f.parent,f.child,f.base);fs.writeFileSync(path.join(f.child,file),'changed');assert.throws(()=>helper().verify(f.child,f.base));}finally{f.cleanup();}
  }
  for(const file of ['VERIFIED','storage-before.json','legacy.path']){
    const f=fixture();try{helper().prepare(f.parent,f.child,f.base);fs.appendFileSync(path.join(f.parent,file),'changed');assert.throws(()=>helper().verify(f.child,f.base));}finally{f.cleanup();}
  }
});
test('exact current media rejects missing, changed and newly added entries',()=>{
  const f=fixture();try{
    helper().prepare(f.parent,f.child,f.base);
    for(const label of ['storage','legacy'])fs.writeFileSync(path.join(f.child,label+'-current.json'),f.manifest);
    assert.equal(helper().verifyCurrent(f.child,f.base).ok,true);
    for(const change of [m=>{m.entries=[];m.entryCount=0;},m=>{m.entries[0].sha256=hash('bad');},m=>{m.entries.push({path:'new.jpg',kind:'file',bytes:3,sha256:hash('new')});m.entryCount++;}]){
      const value=JSON.parse(f.manifest);change(value);fs.writeFileSync(path.join(f.child,'storage-current.json'),JSON.stringify(value));assert.throws(()=>helper().verifyCurrent(f.child,f.base));
    }
  }finally{f.cleanup();}
});
test('finance reference refuses non-finance or existing child checkpoints',()=>{
  const f=fixture();try{assert.throws(()=>helper().prepare(f.parent,f.parent,f.base));helper().prepare(f.parent,f.child,f.base);assert.throws(()=>helper().prepare(f.parent,f.child,f.base));}finally{f.cleanup();}
});
test('historical seal rejects a well-formed parent manifest replacement before prepare',()=>{
  const f=fixture();try{
    const changed=JSON.parse(f.manifest);changed.entries=[];changed.entryCount=0;
    fs.writeFileSync(path.join(f.parent,'storage-before.json'),JSON.stringify(changed));
    assert.throws(()=>helper().inspect(f.parent,f.base));assert.throws(()=>helper().prepare(f.parent,f.child,f.base));assert(!fs.existsSync(path.join(f.child,'FINANCE_MEDIA_REFERENCE.json')));
  }finally{f.cleanup();}
});
test('missing, rewritten or unsealed historical references fail closed',()=>{
  for(const target of ['PARENT_MEDIA_REFERENCE.json','SHA256SUMS','VERIFIED','storage-before.json']){
    const f=fixture();try{fs.writeFileSync(path.join(f.checkpoint,target),'changed');assert.throws(()=>helper().prepare(f.parent,f.child,f.base));}finally{f.cleanup();}
  }
  const f=fixture();try{fs.unlinkSync(path.join(f.checkpoint,'PARENT_MEDIA_REFERENCE.json'));assert.throws(()=>helper().inspect(f.parent,f.base));}finally{f.cleanup();}
});
test('a valid-shape parent manifest replacement after prepare cannot pass final verification',()=>{
  const f=fixture();try{helper().prepare(f.parent,f.child,f.base);const changed=JSON.parse(f.manifest);changed.capturedAt='2026-09-24T00:00:00Z';fs.writeFileSync(path.join(f.parent,'storage-before.json'),JSON.stringify(changed));assert.throws(()=>helper().verify(f.child,f.base));}finally{f.cleanup();}
});
test('paused current-media comparison avoids archive reads and later sealing detects archive mutation',()=>{
  const f=fixture();try{
    helper().prepare(f.parent,f.child,f.base);for(const label of ['storage','legacy'])fs.writeFileSync(path.join(f.child,label+'-current.json'),f.manifest);
    fs.appendFileSync(path.join(f.parent,'storage.tar.gz'),'changed during snapshot');
    assert.equal(helper().verifyCurrent(f.child,f.base).ok,true);assert.throws(()=>helper().verify(f.child,f.base));
    const source=fs.readFileSync(path.join(__dirname,'finance-backup.sh'),'utf8');const pause=source.slice(source.indexOf('docker pause "$container"'),source.indexOf('# RESUME_BEFORE_RESTORE'));
    assert.match(pause,/finance-media-reference.cjs" verify-current/);assert.doesNotMatch(pause,/finance-media-reference.cjs" (?:inspect|prepare|verify) /);
    assert(source.indexOf('finance-media-reference.cjs" verify "$backup"')>source.indexOf('docker unpause "$container"'));
  }finally{f.cleanup();}
});
