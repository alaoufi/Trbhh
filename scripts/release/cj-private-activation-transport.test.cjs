'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
test('actual root tar extraction rejects runner ownership propagation',{skip:process.env.CJ_ACTIVATION_ROOT_TESTS!=='1'&&(process.platform!=='linux'||process.getuid?.()!==0)},()=>{
 assert.equal(process.platform,'linux');assert.equal(process.getuid(),0);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cj-transport-'));
 try{
  const source=path.join(dir,'source'),dest=path.join(dir,'dest');fs.mkdirSync(source,{mode:0o700});fs.mkdirSync(dest,{mode:0o700});fs.mkdirSync(path.join(source,'scripts','release'),{recursive:true});
  const file=path.join(source,'scripts','release','cj-private-activation-db.cjs');fs.writeFileSync(file,'test-only',{mode:0o600});fs.chownSync(file,1001,1001);
  const archive=execFileSync('tar',['--owner=1001','--group=1001','-cf','-','scripts/release/cj-private-activation-db.cjs'],{cwd:source});
  const listing=execFileSync('tar',['--numeric-owner','-tvf','-'],{input:archive,encoding:'utf8'});assert.match(listing,/1001\/1001/);
  execFileSync('tar',['--no-same-owner','--no-same-permissions','-xf','-','-C',dest,'--strip-components=2'],{input:archive});
  const extracted=path.join(dest,'cj-private-activation-db.cjs');fs.chmodSync(extracted,0o600);const stat=fs.lstatSync(extracted);assert.equal(stat.uid,0);assert.equal(stat.gid,0);assert.equal(stat.mode&0o777,0o600);assert.equal(stat.isSymbolicLink(),false);assert.equal(fs.readFileSync(extracted,'utf8'),'test-only');
  const workflow=fs.readFileSync(path.join(__dirname,'../../.github/workflows/cj-private-activation.yml'),'utf8');assert.match(workflow,/tar --no-same-owner --no-same-permissions -xf -/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('root directory permission preparation only accepts 0775 or 0755',{skip:process.env.CJ_ACTIVATION_ROOT_TESTS!=='1'&&(process.platform!=='linux'||process.getuid?.()!==0)},()=>{assert.equal(process.platform,'linux');assert.equal(process.getuid(),0);const {prepareDirectoryPermissions,directory}=require('./cj-private-activation-host.cjs'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'cj-permission-'));try{fs.chmodSync(dir,0o775);assert.throws(()=>directory(dir),/directory_ownership/);assert.deepEqual(prepareDirectoryPermissions(dir),{beforeMode:'0775',afterMode:'0755'});assert.deepEqual(prepareDirectoryPermissions(dir),{beforeMode:'0755',afterMode:'0755'});fs.chmodSync(dir,0o777);assert.throws(()=>prepareDirectoryPermissions(dir),/directory_ownership/);assert.equal(fs.statSync(dir).mode&0o777,0o777);fs.chmodSync(dir,0o775);fs.chownSync(dir,1001,1001);assert.throws(()=>prepareDirectoryPermissions(dir),/directory_ownership/);fs.chownSync(dir,0,0);const link=dir+'-link';fs.symlinkSync(dir,link);try{assert.throws(()=>prepareDirectoryPermissions(link),/directory_ownership/);}finally{fs.unlinkSync(link);}}finally{fs.rmSync(dir,{recursive:true,force:true});}});
