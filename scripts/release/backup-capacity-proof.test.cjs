'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {integer,mediaSize,measure,checkCapacity}=require('./backup-capacity-proof.cjs');
const GiB=1024n*1024n*1024n;
const sample={format:'trbhh-backup-capacity-v1',databaseBytes:String(GiB),tableCount:'172',mediaBytes:String(2n*GiB),mediaEntries:'1000'};
const space=device=>({device,totalBytes:String(200n*GiB),availableBytes:String(100n*GiB),availableInodes:'1000000'});

test('retains OS floor and workload contingency independent of historical disk size',()=>{
  for(const image of [GiB,10n*GiB]){
    const a=checkCapacity(sample,String(image),'1024',space('1'),space('1')).filesystems[0];
    const larger={...space('1'),totalBytes:String(1000n*GiB)};
    const b=checkCapacity(sample,String(image),'1024',larger,larger).filesystems[0];
    assert.equal(a.requiredBytes,b.requiredBytes);
    assert(BigInt(a.reserveBytes)>=5n*GiB);
    assert(BigInt(a.reserveBytes)*4n>=BigInt(a.plannedBytes));
    const exact={...space('1'),availableBytes:a.requiredBytes};
    assert.equal(checkCapacity(sample,String(image),'1024',exact,exact).ok,true);
    const below={...exact,availableBytes:String(BigInt(a.requiredBytes)-1n)};
    assert.equal(checkCapacity(sample,String(image),'1024',below,below).ok,false);
  }
});
test('checks shared filesystems against combined allocations, not each budget independently',()=>{
  const separate=checkCapacity(sample,String(GiB),'1024',space('1'),space('2'));
  const combined=checkCapacity(sample,String(GiB),'1024',space('1'),space('1'));
  assert.equal(separate.filesystems.length,2);assert.equal(combined.filesystems.length,1);assert.equal(combined.ok,true);
  const independentMaximum=separate.filesystems.reduce((max,item)=>BigInt(item.requiredBytes)>max?BigInt(item.requiredBytes):max,0n);
  assert(BigInt(combined.filesystems[0].requiredBytes)>independentMaximum);
  const near={...space('1'),availableBytes:String(independentMaximum)};
  assert.equal(checkCapacity(sample,String(GiB),'1024',near,near).ok,false);
});
test('fails for either low disk or inode exhaustion with counts only',()=>{
  for(const low of [{availableBytes:'1'},{availableInodes:'1'}]){
    const result=checkCapacity(sample,String(GiB),'1024',space('1'),{...space('2'),...low});
    assert.equal(result.ok,false);assert.equal(result.filesystems[1].ok,false);assert.doesNotMatch(JSON.stringify(result),/root|password|DATABASE_URL/);
  }
});
test('rejects missing metrics, unsafe counts and empty database/image before estimating',()=>{
  for(const value of ['-1','NaN','1.5',null,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>integer(value),/backup_capacity_invalid/);
  assert.throws(()=>checkCapacity({...sample,tableCount:'0'},String(GiB),'10',space('1'),space('1')),/backup_capacity_invalid/);
  assert.throws(()=>checkCapacity(sample,'0','10',space('1'),space('1')),/backup_capacity_invalid/);
});
test('media metadata walk counts symlinks without following them',()=>{
  const observed=[];
  const fake={lstatSync:entry=>{observed.push(entry);const base=path.basename(entry);return {size:base==='photo'?12n:5n,isDirectory:()=>base==='media',isFile:()=>base==='photo',isSymbolicLink:()=>base==='link'};},readdirSync:()=>['photo','link']};
  assert.deepEqual(mediaSize('/media',fake),{bytes:'17',entries:'3'});assert.equal(observed.length,3);
});
test('live measurement uses database metadata SELECT and allowed media paths only',async()=>{
  const db={$queryRawUnsafe:async sql=>{assert.match(sql,/^SELECT /);assert.match(sql,/information_schema.TABLES/);return [{bytes:{toString:()=> '12345'},tables_count:172n}];}};
  const fs={lstatSync:()=>({size:0n,isDirectory:()=>true,isFile:()=>false,isSymbolicLink:()=>false}),readdirSync:()=>[]};
  const result=await measure(db,{STORAGE_DIR:'/app/storage',LEGACY_LOCAL_DIR:'/app/legacy'},fs);
  assert.equal(result.tableCount,'172');assert.equal(result.mediaEntries,'2');
  await assert.rejects(()=>measure(db,{STORAGE_DIR:'/unexpected'},fs),/backup_capacity_unsupported_media/);
});
test('capacity preflight belongs only to merchant baseline and precedes audit directory and pause',()=>{
  const source=readFileSync(path.join(__dirname,'safeguards.sh'),'utf8');
  const start=source.indexOf('capacity=$(docker exec');
  assert(start>source.indexOf('elif [[ "$release_profile" == merchant_oauth ]]'));
  assert(start<source.indexOf('mkdir -m 700 "$backup"'));
  assert(start<source.indexOf('docker image save'));
  assert(start<source.indexOf('docker pause "$container"'));
  assert.equal((source.match(/capacity=\$\(docker exec/g)||[]).length,1);
});
