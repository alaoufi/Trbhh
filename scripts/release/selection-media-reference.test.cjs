'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createHash}=require('node:crypto');
const merchant=require('./merchant-media-reference.cjs');
const {prepare,verify,inspectCheckpoint,CHECKPOINT_ID,CHECKPOINT_BASELINE,CURRENT_COMMIT}=require('./selection-media-reference.cjs');
const hash=value=>createHash('sha256').update(value).digest('hex');
const clone=value=>JSON.parse(JSON.stringify(value));
const requiredSalla=['SALLA_CLIENT_ID','SALLA_CLIENT_SECRET','SALLA_WEBHOOK_SECRET','SUPPLIER_TOKEN_ENCRYPTION_KEY','SUPPLIER_RECONCILE_SECRET','SUPPLIER_PUBLIC_ORIGIN','SUPPLIER_ALLOW_LIVE_ORDERS'];
const checkpointSumNames=['database.sql.gz','code.tar.gz','image.tar.gz','PARENT_MEDIA_REFERENCE.json','REUSED_MEDIA_SOURCE','container-before.json','supplier-before.json','full-before.json','storage.path','storage-before.json','legacy.path','legacy-before.json'];
function write(directory,name,data){fs.writeFileSync(path.join(directory,name),typeof data==='string'?data:JSON.stringify(data),{mode:0o600});}
function runtime(){
  return [{Image:'sha256:'+'b'.repeat(64),Config:{Env:[
    'DATABASE_URL=mysql://fixture:fixture@db:3306/fixture','AUTH_SECRET=fixture-auth',
    'STORAGE_DIR=/app/storage','LEGACY_LOCAL_DIR=/app/legacy','NODE_ENV=production',
    'SALLA_CLIENT_ID=fixture-id','SALLA_CLIENT_SECRET=fixture-client-secret',
    'SALLA_WEBHOOK_SECRET=fixture-webhook-secret','SUPPLIER_TOKEN_ENCRYPTION_KEY=fixture-encryption',
    'SUPPLIER_RECONCILE_SECRET=fixture-reconcile','SUPPLIER_PUBLIC_ORIGIN=https://trbhh.sa',
    'SUPPLIER_ALLOW_LIVE_ORDERS=false',
  ]},Mounts:[
    {Type:'volume',Name:'fixture-storage',Source:'/var/lib/docker/volumes/fixture-storage/_data',Destination:'/app/storage',RW:true},
    {Type:'bind',Source:'/srv/fixture/legacy',Destination:'/app/legacy',RW:false},
  ]}];
}
function sums(directory,names){write(directory,'SHA256SUMS',names.map(name=>hash(fs.readFileSync(path.join(directory,name)))+'  '+name+'\n').join(''));}
function digestDirectory(directory){return fs.readdirSync(directory).sort().map(name=>[name,hash(fs.readFileSync(path.join(directory,name)))]);}
function fixture(){
  const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'trbhh-selection-chain-')));
  fs.chmodSync(base,0o700);
  const parent=path.join(base,'audit-'+merchant.PARENT_ID),checkpoint=path.join(base,'audit-'+CHECKPOINT_ID),child=path.join(base,'audit-999999');
  for(const directory of [parent,checkpoint,child])fs.mkdirSync(directory,{mode:0o700});
  const oldRuntime=runtime();oldRuntime[0].Image='sha256:'+'a'.repeat(64);
  for(const [name,value] of Object.entries({VERIFIED:merchant.PARENT_COMMIT,'commit.txt':merchant.PARENT_COMMIT,DEPLOYMENT_VERIFIED:merchant.DEPLOYED_COMMIT,'container-after.json':oldRuntime,'database.sql.gz':'full-database','code.tar.gz':'full-code','image.tar.gz':'full-image','storage.tar.gz':'full-storage','legacy.tar.gz':'full-legacy'}))write(parent,name,value);
  const manifest={format:'trbhh-media-proof-v1',capturedAt:'2026-09-21T00:00:00Z',entryCount:0,entries:[]};
  for(const label of ['storage','legacy']){write(parent,label+'.path','/app/'+label+'\n');write(parent,label+'-before.json',manifest);}
  sums(parent,['database.sql.gz','code.tar.gz','image.tar.gz','storage.tar.gz','legacy.tar.gz']);
  write(checkpoint,'container-before.json',oldRuntime);
  merchant.prepare(parent,checkpoint,base);
  for(const [name,value] of Object.entries({VERIFIED:CHECKPOINT_BASELINE,'commit.txt':CHECKPOINT_BASELINE,DEPLOYMENT_VERIFIED:CURRENT_COMMIT,'candidate.txt':CURRENT_COMMIT,'container-after.json':runtime(),'database.sql.gz':'checkpoint-database','code.tar.gz':'checkpoint-code','image.tar.gz':'checkpoint-image','supplier-before.json':{fixture:'supplier-before-proof'},'full-before.json':{fixture:'full-before-proof'}}))write(checkpoint,name,value);
  sums(checkpoint,checkpointSumNames);
  write(child,'container-before.json',runtime());
  return {base,parent,checkpoint,child,cleanup(){
    assert.equal(fs.realpathSync(base),base);
    assert.equal(path.dirname(base),fs.realpathSync(os.tmpdir()));
    assert(path.basename(base).startsWith('trbhh-selection-chain-'));
    fs.rmSync(base,{recursive:true,force:true});
  }};
}
function withFixture(run){const f=fixture();try{return run(f);}finally{f.cleanup();}}
function alterRuntime(directory,file,change){const state=JSON.parse(fs.readFileSync(path.join(directory,file),'utf8'));change(state[0]);write(directory,file,state);}
function assertRejectedBeforeCopy(f){assert.throws(()=>prepare(f.checkpoint,f.child,f.base));assert.deepEqual(fs.readdirSync(f.child),['container-before.json']);}

test('pins the exact approved checkpoint and deployment constants',()=>{
  assert.equal(CHECKPOINT_ID,'35607654850');
  assert.equal(CHECKPOINT_BASELINE,'5f8dbc01c38bf431a9ae099a581b80536097b346');
  assert.equal(CURRENT_COMMIT,'415a8fe593522859f4cf85c2fa10e47a7d40109b');
});

test('creates a small chained reference without copying archives or changing either ancestor',()=>withFixture(f=>{
  const fullBefore=digestDirectory(f.parent),checkpointBefore=digestDirectory(f.checkpoint);
  assert.equal(merchant.verify(f.checkpoint,f.base).ok,true);
  assert.equal(prepare(f.checkpoint,f.child,f.base).ok,true);
  assert.equal(verify(f.child,f.base).ok,true);
  assert.deepEqual(fs.readdirSync(f.child).sort(),[
    'REUSED_MEDIA_SOURCE','SELECTION_MEDIA_REFERENCE.json','container-before.json',
    'legacy-before.json','legacy.path','storage-before.json','storage.path',
  ].sort());
  assert.equal(fs.readFileSync(path.join(f.child,'REUSED_MEDIA_SOURCE'),'utf8').trim(),CHECKPOINT_ID);
  for(const label of ['storage','legacy'])for(const suffix of ['.path','-before.json']){
    assert.deepEqual(fs.readFileSync(path.join(f.child,label+suffix)),fs.readFileSync(path.join(f.parent,label+suffix)));
  }
  const proof=fs.readFileSync(path.join(f.child,'SELECTION_MEDIA_REFERENCE.json'),'utf8');
  assert(proof.includes(CHECKPOINT_ID));assert(proof.includes(CURRENT_COMMIT));assert(proof.includes(merchant.PARENT_ID));
  assert(!proof.includes('fixture-client-secret'),'private runtime values must not be copied into the reference');
  assert(!proof.includes('mysql://'),'database credentials must not be copied into the reference');
  assert.deepEqual(digestDirectory(f.parent),fullBefore);
  assert.deepEqual(digestDirectory(f.checkpoint),checkpointBefore);
}));

test('accepts semantic runtime equality when environment and mount ordering differ',()=>withFixture(f=>{
  alterRuntime(f.child,'container-before.json',state=>{
    state.Config.Env.reverse();state.Mounts.reverse();
    state.Name='/replacement-container-name';state.Id='not-a-runtime-invariant';
  });
  assert.equal(prepare(f.checkpoint,f.child,f.base).ok,true);
  assert.equal(verify(f.child,f.base).ok,true);
}));

test('refuses mismatched checkpoint verification, baseline, and deployed markers before copying',()=>{
  for(const marker of ['VERIFIED','commit.txt','DEPLOYMENT_VERIFIED','candidate.txt'])withFixture(f=>{
    write(f.checkpoint,marker,'0'.repeat(40));assertRejectedBeforeCopy(f);
  });
});

test('rejects corrupt checkpoint archives and unsafe or incomplete checksum lists',()=>{
  for(const name of ['database.sql.gz','code.tar.gz','image.tar.gz'])withFixture(f=>{
    fs.appendFileSync(path.join(f.checkpoint,name),'corrupt');assertRejectedBeforeCopy(f);
  });
  for(const malformed of [
    hash('x')+'  ../database.sql.gz\n',hash('x')+'  /tmp/image.tar.gz\n',
    hash('x')+'  unexpected.tar.gz\n',hash('x')+'  storage.tar.gz\n','',
  ])withFixture(f=>{write(f.checkpoint,'SHA256SUMS',malformed);assertRejectedBeforeCopy(f);});
  withFixture(f=>{
    const contents=fs.readFileSync(path.join(f.checkpoint,'SHA256SUMS'),'utf8');
    write(f.checkpoint,'SHA256SUMS',contents+contents.split('\n')[0]+'\n');assertRejectedBeforeCopy(f);
  });
});

test('requires the checkpoint old reference, full ancestor hashes, and copied media to remain valid',()=>{
  for(const name of ['PARENT_MEDIA_REFERENCE.json','REUSED_MEDIA_SOURCE','storage-before.json','legacy.path'])withFixture(f=>{
    write(f.checkpoint,name,'invalid');assertRejectedBeforeCopy(f);
  });
  for(const name of ['database.sql.gz','code.tar.gz','image.tar.gz','storage.tar.gz','legacy.tar.gz'])withFixture(f=>{
    fs.appendFileSync(path.join(f.parent,name),'corrupt');assertRejectedBeforeCopy(f);
  });
  withFixture(f=>{fs.unlinkSync(path.join(f.parent,'legacy-before.json'));assertRejectedBeforeCopy(f);});
});

test('rejects changed image, complete environment, and storage mount semantics before copying',()=>{
  const changes=[
    state=>{state.Image='sha256:'+'c'.repeat(64);},
    state=>{state.Config.Env.push('UNREVIEWED_SETTING=true');},
    state=>{state.Config.Env=state.Config.Env.filter(value=>!value.startsWith('NODE_ENV='));},
    state=>{state.Config.Env.push('SALLA_CLIENT_ID=duplicate');},
    state=>{state.Mounts[0].Source='/some/other/volume';},
    state=>{state.Mounts[0].Name='wrong-volume';},
    state=>{state.Mounts[0].RW=false;},
    state=>{state.Mounts.pop();},
  ];
  for(const change of changes)withFixture(f=>{alterRuntime(f.child,'container-before.json',change);assertRejectedBeforeCopy(f);});
  for(const key of [...requiredSalla,'DATABASE_URL','AUTH_SECRET','STORAGE_DIR','LEGACY_LOCAL_DIR'])withFixture(f=>{
    alterRuntime(f.child,'container-before.json',state=>{state.Config.Env=state.Config.Env.map(value=>value.startsWith(key+'=')?key+'=changed':value);});
    assertRejectedBeforeCopy(f);
  });
});

test('rejects unsafe runtime even if checkpoint and child agree on it',()=>{
  const changes=[
    state=>{state.Config.Env=state.Config.Env.map(value=>value.startsWith('SUPPLIER_ALLOW_LIVE_ORDERS=')?'SUPPLIER_ALLOW_LIVE_ORDERS=true':value);},
    state=>{state.Config.Env=state.Config.Env.map(value=>value.startsWith('SUPPLIER_PUBLIC_ORIGIN=')?'SUPPLIER_PUBLIC_ORIGIN=https://example.invalid':value);},
    ...[...requiredSalla,'DATABASE_URL','AUTH_SECRET','STORAGE_DIR'].map(key=>state=>{state.Config.Env=state.Config.Env.filter(value=>!value.startsWith(key+'='));}),
    ...[...requiredSalla,'DATABASE_URL','AUTH_SECRET','STORAGE_DIR'].map(key=>state=>{state.Config.Env=state.Config.Env.map(value=>value.startsWith(key+'=')?key+'=':value);}),
  ];
  for(const change of changes)withFixture(f=>{
    alterRuntime(f.checkpoint,'container-before.json',change);alterRuntime(f.checkpoint,'container-after.json',change);alterRuntime(f.child,'container-before.json',change);
    sums(f.checkpoint,checkpointSumNames);assertRejectedBeforeCopy(f);
  });
});

test('pins checkpoint marker and runtime bytes, checksum bytes, archives, and the full parent reference',()=>{
  for(const name of ['VERIFIED','commit.txt','DEPLOYMENT_VERIFIED','candidate.txt','container-after.json','SHA256SUMS','PARENT_MEDIA_REFERENCE.json'])withFixture(f=>{
    prepare(f.checkpoint,f.child,f.base);
    fs.appendFileSync(path.join(f.checkpoint,name),'\n');
    assert.throws(()=>verify(f.child,f.base),name+' must be pinned even if its parsed meaning is unchanged');
  });
  for(const name of ['database.sql.gz','code.tar.gz','image.tar.gz'])withFixture(f=>{
    prepare(f.checkpoint,f.child,f.base);fs.appendFileSync(path.join(f.checkpoint,name),'changed');
    sums(f.checkpoint,checkpointSumNames);
    assert.throws(()=>verify(f.child,f.base),'changing an archive and its checksum must not rewrite the approved checkpoint');
  });
});

test('detects later corruption in the original full backup, including changes with rewritten checksums',()=>{
  for(const name of ['storage.tar.gz','legacy.tar.gz','database.sql.gz','container-after.json','storage-before.json'])withFixture(f=>{
    prepare(f.checkpoint,f.child,f.base);fs.appendFileSync(path.join(f.parent,name),'changed');
    assert.throws(()=>verify(f.child,f.base));
  });
  withFixture(f=>{
    prepare(f.checkpoint,f.child,f.base);fs.appendFileSync(path.join(f.parent,'storage.tar.gz'),'changed');
    sums(f.parent,['database.sql.gz','code.tar.gz','image.tar.gz','storage.tar.gz','legacy.tar.gz']);
    assert.throws(()=>verify(f.child,f.base));
  });
});

test('rejects changed child proof, source marker, manifests, paths, and runtime',()=>{
  for(const name of ['SELECTION_MEDIA_REFERENCE.json','REUSED_MEDIA_SOURCE','storage-before.json','legacy-before.json','storage.path','legacy.path'])withFixture(f=>{
    prepare(f.checkpoint,f.child,f.base);write(f.child,name,'changed');assert.throws(()=>verify(f.child,f.base));
  });
  withFixture(f=>{
    prepare(f.checkpoint,f.child,f.base);
    alterRuntime(f.child,'container-before.json',state=>{state.Image='sha256:'+'d'.repeat(64);});
    assert.throws(()=>verify(f.child,f.base));
  });
});

test('rejects duplicate child media archives and extraction directories',()=>{
  for(const label of ['storage','legacy'])for(const suffix of ['.tar.gz','-extracted'])withFixture(f=>{
    prepare(f.checkpoint,f.child,f.base);
    if(suffix==='-extracted')fs.mkdirSync(path.join(f.child,label+suffix));else write(f.child,label+suffix,'unexpected-copy');
    assert.throws(()=>verify(f.child,f.base));
  });
});

test('never accepts the full parent, checkpoint, sibling, or noncanonical paths as a new child',()=>withFixture(f=>{
  assert.throws(()=>prepare(f.checkpoint,f.checkpoint,f.base));
  assert.throws(()=>prepare(f.checkpoint,f.parent,f.base));
  assert.throws(()=>inspectCheckpoint(f.parent,f.base));
  assert.throws(()=>inspectCheckpoint(f.child,f.base));
  const sibling=path.join(f.base,'not-an-audit');fs.mkdirSync(sibling,{mode:0o700});write(sibling,'container-before.json',runtime());
  assert.throws(()=>prepare(f.checkpoint,sibling,f.base));
  const noncanonical=f.base+path.sep+'.'+path.sep+path.basename(f.child);
  assert.throws(()=>prepare(f.checkpoint,noncanonical,f.base));
}));

test('does not overwrite an existing reference or its copied manifests',()=>withFixture(f=>{
  prepare(f.checkpoint,f.child,f.base);const before=digestDirectory(f.child);
  assert.throws(()=>prepare(f.checkpoint,f.child,f.base));
  assert.deepEqual(digestDirectory(f.child),before);
}));

test('rejects hardlinked archive and child proof files',()=>{
  for(const location of ['checkpoint','child'])withFixture(f=>{
    if(location==='child')prepare(f.checkpoint,f.child,f.base);
    const name=location==='checkpoint'?'database.sql.gz':'SELECTION_MEDIA_REFERENCE.json';
    fs.linkSync(path.join(f[location],name),path.join(f.base,'linked-copy'));
    if(location==='checkpoint')assertRejectedBeforeCopy(f);else assert.throws(()=>verify(f.child,f.base));
  });
});

test('rejects directory aliases and symlinked checkpoint metadata where supported',t=>{
  const f=fixture();try{
    const alias=path.join(f.base,'audit-888888');
    try{fs.symlinkSync(f.child,alias,process.platform==='win32'?'junction':'dir');}
    catch(error){if(['EPERM','EACCES','ENOTSUP'].includes(error.code)){t.skip('OS does not permit test symlinks');return;}throw error;}
    assert.throws(()=>prepare(f.checkpoint,alias,f.base));
    const metadata=path.join(f.checkpoint,'VERIFIED'),target=path.join(f.base,'verified-target');
    fs.renameSync(metadata,target);
    try{fs.symlinkSync(target,metadata,'file');}
    catch(error){if(['EPERM','EACCES','ENOTSUP'].includes(error.code)){t.diagnostic('OS does not permit file symlinks; directory alias rejection was verified');return;}throw error;}
    assertRejectedBeforeCopy(f);
  }finally{f.cleanup();}
});
