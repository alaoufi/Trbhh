'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const file=path.join(__dirname,'finance-deploy.sh');
const workflow=path.join(__dirname,'../../.github/workflows/deploy.yml');
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
const read=()=>fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
const sha='a'.repeat(40);
test('orchestrator parses as Bash and rejects bad mode, run or revision before external work',()=>{
  assert(fs.existsSync(file),'Finance deployment orchestrator is required');
  assert.equal(spawnSync(bash,['-n',file],{encoding:'utf8'}).status,0);
  for(const args of [[],['deploy','1'],['other','1',sha],['deploy','../1',sha],['deploy','0',sha],['deploy','1',sha.toUpperCase()],['finalize','1',sha,'extra']]){
    const result=spawnSync(bash,[file,...args],{encoding:'utf8',env:{...process.env,PATH:'/does-not-exist'}});
    assert.equal(result.status,2,result.stderr);assert.equal(result.stdout,'');assert.match(result.stderr,/Finance deployment arguments rejected/);
    assert.doesNotMatch(result.stderr,/command not found|\.\.\//);
  }
});
test('check policy ignores other SHAs and requires the latest exact-revision run to succeed',()=>{
  const source=fs.readFileSync(workflow,'utf8'),match=source.match(/\/\/ GATE_POLICY_BEGIN\n([\s\S]*?)\n\s*\/\/ GATE_POLICY_END/);assert(match);
  const js=match[1].split('\n').map(line=>line.replace(/^\s{10}/,'')).join('\n');
  const context={};vm.createContext(context);vm.runInContext(js+'\nthis.gate=gate;',context);
  const r=(id,status,conclusion,head_sha=sha)=>({id,status,conclusion,head_sha});
  assert.equal(context.gate([r(99,'completed','success','b'.repeat(40))],sha),'pending');
  assert.equal(context.gate([r(2,'in_progress',null),r(1,'completed','success')],sha),'pending');
  assert.equal(context.gate([r(2,'completed','failure'),r(1,'completed','success')],sha),'failed');
  assert.equal(context.gate([r(2,'completed','success'),r(1,'completed','failure')],sha),'success');
  for(const conclusion of ['cancelled','skipped','neutral','timed_out','action_required'])assert.equal(context.gate([r(1,'completed',conclusion)],sha),'failed');
});
test('capture secret is generated locally without changing any other env bytes or rotating existing secrets',()=>{
  const match=read().match(/# CAPTURE_ENV_BEGIN\nnode - "\$prod" "\$backup" <<'NODE'\n([\s\S]*?)\nNODE\n# CAPTURE_ENV_END/);assert(match);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'finance-deploy-env-')),prod=path.join(dir,'prod'),backup=path.join(dir,'backup');
  fs.mkdirSync(prod);fs.mkdirSync(backup);
  const run=value=>{fs.writeFileSync(path.join(backup,'candidate-config.json'),JSON.stringify({services:{app:{environment:{FINANCE_CAPTURE_SECRET:value}}}}));return spawnSync(process.execPath,['-',prod,backup],{input:match[1],encoding:'utf8'});};
  const original='CJ_API_KEY="private#sentinel"\r\nAUTH_SECRET=untouched\r\nFINANCE_CAPTURE_SECRET=\r\n';
  try{
    fs.writeFileSync(path.join(prod,'.env'),original);
    let result=run('');assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'');
    const updated=fs.readFileSync(path.join(prod,'.env'),'utf8'),secret=updated.match(/^FINANCE_CAPTURE_SECRET=([a-f0-9]{64})/m)?.[1];assert(secret);
    assert.equal(updated.replace(secret,''),original);
    result=run(secret);assert.equal(result.status,0);assert.equal(fs.readFileSync(path.join(prod,'.env'),'utf8'),updated);
    fs.writeFileSync(path.join(prod,'.env'),'FINANCE_CAPTURE_SECRET=\nFINANCE_CAPTURE_SECRET=\n');
    assert.notEqual(run('').status,0);
    fs.writeFileSync(path.join(prod,'.env'),'FINANCE_CAPTURE_SECRET=short\n');assert.notEqual(run('short').status,0);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('container revision check consumes stdin and rejects a wrong runtime revision',()=>{
  const match=read().match(/(check_container\(\) \{[\s\S]*?\n\})\n\nprove_preservation/);assert(match);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'finance-deploy-revision-'));
  try {
    fs.writeFileSync(path.join(dir,'candidate-image-id.txt'),'sha256:'+'c'.repeat(64)+'\n');
    fs.writeFileSync(path.join(dir,'mock.cjs'),"global.fetch=async()=>({status:200,headers:{get:()=> 'no-store'},json:async()=>({commit:process.env.MOCK_REVISION})});\n");
    const script=`
      set -euo pipefail
      backup=$1; tools_dir=$1; candidate=$2; real_node=$3
      git(){ printf '%s\\n' "$candidate"; }
      docker(){
        case "$1 $2" in
          'compose ps') printf '%064d\\n' 1;;
          'inspect -f') cat "$backup/candidate-image-id.txt";;
          'image inspect') printf '%s\\n' "$candidate";;
          'exec -i') shift 2; shift; "$real_node" --require "$backup/mock.cjs" "\${@:2}";;
          'exec '*) return 0;;
          *) return 1;;
        esac
      }
      ${match[1]}
      check_container
    `;
    for(const revision of [sha,'b'.repeat(40)]){
      const result=spawnSync(bash,['-c',script,'test',dir.replaceAll('\\','/'),sha,process.execPath.replaceAll('\\','/')],{encoding:'utf8',env:{...process.env,MOCK_REVISION:revision}});
      assert.equal(result.status,revision===sha?0:1,result.stderr);
    }
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('rollback pins original runtime secrets and mounts, rejecting unapplied host configuration drift',()=>{
  const match=read().match(/# BASELINE_CONFIG_BEGIN\nnode - "\$backup" <<'NODE'\n([\s\S]*?)\nNODE\n# BASELINE_CONFIG_END/);assert(match);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'finance-deploy-baseline-'));
  const container={Config:{Env:['AUTH_SECRET=old$private${VALUE}','CJ_API_KEY=cj$private','NODE_ENV=production']},Mounts:[{Type:'volume',Name:'trbhh_storage',Destination:'/app/storage',RW:true},{Type:'bind',Source:'/old/media',Destination:'/app/legacy',RW:false}]};
  const config={name:'trbhh',services:{app:{build:{context:'/root/trbhh'},image:'mutable-old-tag',environment:{AUTH_SECRET:'old$private${VALUE}',CJ_API_KEY:'cj$private'},volumes:[{type:'volume',source:'storage',target:'/app/storage'},{type:'bind',source:'/old/media',target:'/app/legacy',read_only:true}]}},volumes:{storage:{name:'trbhh_storage'}}};
  const image='sha256:'+'c'.repeat(64);
  try{
    fs.writeFileSync(path.join(dir,'container-before.json'),JSON.stringify([container]));fs.writeFileSync(path.join(dir,'image-id.txt'),image+'\n');
    const run=()=>{fs.writeFileSync(path.join(dir,'baseline-compose.json'),JSON.stringify(config));return spawnSync(process.execPath,['-',dir],{input:match[1],encoding:'utf8'});};
    let result=run();assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'');
    const saved=JSON.parse(fs.readFileSync(path.join(dir,'rollback-compose.json')));
    assert.equal(saved.services.app.environment.AUTH_SECRET,'old$$private$${VALUE}');assert.equal(saved.services.app.environment.CJ_API_KEY,'cj$$private');
    assert.equal(saved.services.app.environment.NODE_ENV,'production');assert.equal(saved.services.app.image,image);assert.equal(saved.services.app.build,undefined);
    config.services.app.environment.AUTH_SECRET='unapplied-new-secret';assert.notEqual(run().status,0);
    config.services.app.environment.AUTH_SECRET='old$private${VALUE}';config.services.app.volumes[1].source='/different/media';assert.notEqual(run().status,0);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('capture unit recovery tolerates either partial installation and repeat rollback, but rejects foreign changes',()=>{
  const match=read().match(/# CAPTURE_UNITS_BEGIN\n([\s\S]*?)# CAPTURE_UNITS_END/);assert(match);
  const fragment=match[1].replaceAll('/etc/systemd/system','$units_dir');
  for(const hadOriginal of [false,true])for(const installed of [0,1,2]){
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'finance-deploy-units-')),backup=path.join(dir,'backup'),units=path.join(dir,'units');
    fs.mkdirSync(backup);fs.mkdirSync(units);
    try{
      fs.writeFileSync(path.join(backup,'CAPTURE_SNAPSHOT_READY'),'');fs.writeFileSync(path.join(backup,'UNIT_FILES_INSTALLED'),'');
      fs.writeFileSync(path.join(backup,'capture-enabled.txt'),'0');fs.writeFileSync(path.join(backup,'capture-active.txt'),'0');
      for(const [i,unit] of ['service','timer'].entries()){
        fs.writeFileSync(path.join(backup,`capture-${unit}.new`),`new ${unit}\n`);
        if(hadOriginal)fs.writeFileSync(path.join(backup,`capture-${unit}.old`),`old ${unit}\n`);
        if(i<installed)fs.writeFileSync(path.join(units,`trbhh-finance-capture.${unit}`),`new ${unit}\n`);
        else if(hadOriginal)fs.writeFileSync(path.join(units,`trbhh-finance-capture.${unit}`),`old ${unit}\n`);
      }
      const script=`set -euo pipefail\nbackup=$1; units_dir=$2\nsystemctl(){ return 0; }\n${fragment}\nrestore_capture_units\nrestore_capture_units`;
      const args=['-c',script,'test',backup.replaceAll('\\','/'),units.replaceAll('\\','/')];
      const result=spawnSync(bash,args,{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
      for(const unit of ['service','timer']){
        const target=path.join(units,`trbhh-finance-capture.${unit}`);
        if(hadOriginal)assert.equal(fs.readFileSync(target,'utf8'),`old ${unit}\n`);else assert.equal(fs.existsSync(target),false);
      }
      const foreign=path.join(units,'trbhh-finance-capture.timer');fs.writeFileSync(foreign,'foreign change\n');
      assert.notEqual(spawnSync(bash,args,{encoding:'utf8'}).status,0);assert.equal(fs.readFileSync(foreign,'utf8'),'foreign change\n');
    }finally{fs.rmSync(dir,{recursive:true,force:true});}
  }
});
test('Docker receives only the exact candidate tree, excluding edited and private host files',()=>{
  const match=read().match(/# BUILD_IMAGE_BEGIN\n([\s\S]*?)# BUILD_IMAGE_END/);assert(match);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'finance-deploy-context-')),repo=path.join(dir,'repo'),archive=path.join(dir,'context.tar');fs.mkdirSync(repo);
  const git=(...args)=>{const r=spawnSync('git',args,{cwd:repo,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
  try{
    git('init','--quiet');fs.writeFileSync(path.join(repo,'.gitignore'),'.env*\n');fs.writeFileSync(path.join(repo,'source.txt'),'reviewed candidate\n');
    git('add','.');git('-c','user.email=release-test@example.invalid','-c','user.name=Release Test','commit','--quiet','-m','fixture');const candidate=git('rev-parse','HEAD');
    fs.writeFileSync(path.join(repo,'source.txt'),'unreviewed tracked edit\n');fs.writeFileSync(path.join(repo,'untracked.ts'),'unreviewed source\n');fs.writeFileSync(path.join(repo,'.env.production'),'AUTH_SECRET=private-host-only\n');
    const script=`set -euo pipefail\ncandidate=$1; archive_file=$2; image=trbhh-finance:$1\ndocker(){ [[ "$1" == build && "\${!#}" == - ]]; cat > "$archive_file"; }\n${match[1]}`;
    const built=spawnSync(bash,['-c',script,'test',candidate,archive.replaceAll('\\','/')],{cwd:repo,encoding:'utf8'});assert.equal(built.status,0,built.stderr);
    const check=spawnSync(bash,['-c','tar -tf - < "$1"; tar -xOf - source.txt < "$1"','test',archive.replaceAll('\\','/')],{encoding:'utf8'});assert.equal(check.status,0,check.stderr);
    assert.match(check.stdout,/reviewed candidate/);assert.doesNotMatch(check.stdout,/unreviewed|untracked|\.env|private-host-only/);
    const dockerfile=fs.readFileSync(path.join(__dirname,'../../Dockerfile'),'utf8');assert.match(dockerfile,/RUN pnpm install --frozen-lockfile(?:\r?\n|$)/);assert.doesNotMatch(dockerfile,/pnpm install --frozen-lockfile\s*\|\|/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('orchestration keeps backup, immutable revision and private proofs before final worker activation',()=>{
  const s=read();assert(s);const at=t=>{const n=s.indexOf(t);assert(n>=0,t);return n;};
  assert(at('finance-backup.sh" "$run_id" "$candidate" "$baseline"')<at('merge --ff-only "$candidate"'));
  assert(at('finance-schema-check.cjs')<at('# FINALIZE_WORKER'));
  assert.match(s,/--build-arg "TRBHH_RELEASE_COMMIT=\$candidate"/);
  assert.match(s,/org.opencontainers.image.revision/);
  assert.match(s,/verify-runtime.cjs/);assert.match(s,/supplier-preservation-proof.cjs/);assert.match(s,/media-proof.cjs/);
  assert.match(s,/--on-active=15m/);assert.match(s,/CUTOVER_READY/);assert.match(s,/DEPLOYMENT_VERIFIED/);
  assert.match(s,/exec 9> \/run\/lock\/trbhh-finance-deploy.lock/);assert.match(s,/ACTIVE_DEPLOYMENT/);
  const recovery=s.slice(s.indexOf('rollback_app()'),s.indexOf('finish()'));
  assert(recovery.indexOf('up -d --no-build')<recovery.indexOf('restore_capture_units || return 1'));
  assert(recovery.indexOf('rollback-database.json')<recovery.indexOf('> "$backup/ROLLED_BACK"'));
  assert.doesNotMatch(s,/mysql --|prisma (?:db push|migrate)|gzip -dc|git reset --hard|docker (?:system|image|volume) prune/);
  const y=fs.readFileSync(workflow,'utf8');assert.match(y,/actions: read/);assert.match(y,/head_sha=\$GITHUB_SHA/);
  assert.match(y,/ci\.yml release-upgrade-check\.yml/);assert.match(y,/SECONDS \+ 2700/);assert.match(y,/sleep 30/);
  assert.match(y,/StrictHostKeyChecking=yes/);assert.doesNotMatch(y,/StrictHostKeyChecking=no/);
  assert(y.indexOf('https://trbhh.sa/api/version')>y.indexOf('finance-deploy.sh\' deploy'));
  assert(y.indexOf('https://trbhh.sa/api/version')<y.indexOf('finance-deploy.sh\' finalize'));
});
