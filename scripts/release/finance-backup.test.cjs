'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const file=path.join(__dirname,'finance-backup.sh');
// The invalid-argument tests deliberately remove PATH; resolve Bash itself
// absolutely so only the script's external commands are unavailable.
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'/bin/bash';
const read=()=>fs.existsSync(file)?fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n'):'';
const candidate='a'.repeat(40),baseline='b'.repeat(40);
test('storage additions during live legacy archiving are captured only after the guarded pause',()=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(require('node:os').tmpdir(),'cj-storage-freeze-')));
 try{
  const source=read(),media=source.match(/# MEDIA_ARCHIVES_BEGIN\n([\s\S]*?)# MEDIA_ARCHIVES_END/)[1];
  const frozen=source.slice(source.indexOf('substep=snapshot_verify_paused'),source.indexOf('substep=snapshot_protected_database'));
  const script=`set -euo pipefail\nbackup="$1";reader=reader;container=production;tools_dir=/tools;current_image=old;media_capacity=fresh;late=0;paused=0\ndocker(){ case "$*" in *'STORAGE_DIR /app/storage') printf /app/storage;; *'LEGACY_LOCAL_DIR '*) return 0;; *'tar -czf - -C /app/storage .') printf 'late=%s;paused=%s' "$late" "$paused";; 'run --rm -i --network none '*) cat >/dev/null;; *'inspect -f {{.State.Paused}} '*) printf true;; *) return 91;; esac; }\ngzip(){ return 0; }\nmkdir(){ command mkdir "$3"; }\nnode(){ printf manifest; }\n${media}\nlate=6;paused=1\n${frozen}\ncat "$backup/storage.tar.gz"`;
  const result=spawnSync(bash,['-c',script,'fixture',root.replace(/\\/g,'/')],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'late=6;paused=1');
  assert(source.indexOf('--on-active=15m')<source.indexOf('docker pause "$container"'));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('backup entrypoint exists and parses as Bash',()=>{
  assert(fs.existsSync(file),'The standalone finance backup entrypoint must exist');
  const result=spawnSync(bash,['-n',file],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});

test('rejects malformed and ambiguous identities without running an external command',()=>{
  assert(fs.existsSync(file),'The standalone finance backup entrypoint must exist');
  for(const args of [[],['12',candidate],['../12',candidate,baseline],['12',candidate.toUpperCase(),baseline],['12',candidate,candidate],['0',candidate,baseline],['12',candidate,baseline,'unexpected'],['12; secret',candidate,baseline]]){
    const result=spawnSync(bash,[file,...args],{encoding:'utf8',env:{...process.env,PATH:'/does-not-exist'}});
    assert.equal(result.status,2,JSON.stringify({args,status:result.status,stderr:result.stderr}));
    assert.equal(result.stdout,'');assert.match(result.stderr,/Finance backup arguments rejected/);
    assert.doesNotMatch(result.stderr,/command not found|secret|\.\.\//);
  }
});

test('a failed snapshot resumes the app before deleting only labelled temporary resources',()=>{
  const source=read(),fragment=source.match(/# CLEANUP_BEGIN\n([\s\S]*?)# CLEANUP_END/);
  assert(fragment,'Cleanup must be independently exercisable');
  const result=spawnSync(bash,['-c',`
    exec 3>&1 4>&2
    backup_id=123; container=production; reader=reader; restore_name=restore; restore_network=isolated; watchdog=guard; paused=1; stage=snapshot
    docker(){
      printf 'docker %s\\n' "$*" >&3
      case "$*" in
        'inspect -f {{.State.Running}} {{.State.Paused}} production') printf 'true false\\n';;
        *'trbhh.finance-backup'*' reader'|*'trbhh.finance-backup'*' restore'|*'trbhh.finance-backup'*' isolated') printf '123\\n';;
      esac
    }
    systemctl(){ printf 'systemctl %s\\n' "$*" >&3; }
    ${fragment[1]}
    trap cleanup EXIT
    exit 19
  `],{encoding:'utf8'});
  assert.equal(result.status,19,result.stderr);
  assert(result.stdout.indexOf('docker unpause production')>=0);
  assert(result.stdout.indexOf('docker unpause production')<result.stdout.indexOf('docker rm -fv restore'));
  assert.match(result.stdout,/systemctl stop guard.timer/);
  assert.match(result.stdout,/docker rm -fv restore/);
  assert.doesNotMatch(result.stdout,/docker rm[^\n]*production|volume rm|prune/);
});

test('failed resume leaves the independent watchdog armed and refuses success',()=>{
  const fragment=read().match(/# CLEANUP_BEGIN\n([\s\S]*?)# CLEANUP_END/);assert(fragment);
  const result=spawnSync(bash,['-c',`
    exec 3>&1 4>&2
    backup_id=123; container=production; reader=reader; restore_name=restore; restore_network=isolated; watchdog=guard; paused=1; stage=snapshot
    docker(){ printf 'docker %s\\n' "$*" >&3; case "$*" in unpause*) return 1;; *'State.Paused'*) printf 'true true\\n';; *'trbhh.finance-backup'*) printf '123\\n';; esac; }
    systemctl(){ printf 'systemctl %s\\n' "$*" >&3; }
    ${fragment[1]}
    trap cleanup EXIT
    exit 0
  `],{encoding:'utf8'});
  assert.notEqual(result.status,0);
  assert.doesNotMatch(result.stdout,/systemctl stop|rm -fv|network rm/);
  assert.match(result.stderr,/Finance backup failed/);
});

test('failed temporary-resource cleanup cannot issue a successful backup checkpoint',()=>{
  const fragment=read().match(/# CLEANUP_BEGIN\n([\s\S]*?)# CLEANUP_END/);assert(fragment);
  const result=spawnSync(bash,['-c',`
    exec 3>&1 4>&2
    backup_id=123; container=production; reader=reader; restore_name=restore; restore_network=isolated; watchdog=guard; paused=0; stage=complete
    docker(){
      case "$*" in
        'inspect -f {{.State.Running}} {{.State.Paused}} production') printf 'true false\\n';;
        *'trbhh.finance-backup'*) printf '123\\n';;
        'rm -fv restore') return 1;;
      esac
    }
    systemctl(){ return 0; }
    ${fragment[1]}
    trap cleanup EXIT
    exit 0
  `],{encoding:'utf8'});
  assert.notEqual(result.status,0);
  assert.doesNotMatch(result.stdout,/BACKUP_ID=|verified/);
  assert.match(result.stderr,/Finance backup failed/);
});

test('successful checkpoint is issued only after owned helpers are removed',()=>{
  const fragment=read().match(/# CLEANUP_BEGIN\n([\s\S]*?)# CLEANUP_END/);assert(fragment);
  const result=spawnSync(bash,['-c',`
    exec 3>&1 4>&2
    backup_id=123; container=production; reader=reader; restore_name=restore; restore_network=isolated; watchdog=guard; paused=0; stage=complete
    docker(){ printf 'docker %s\\n' "$*" >&3; case "$*" in *'State.Paused'*) printf 'true false\\n';; *'trbhh.finance-backup'*) printf '123\\n';; esac; }
    systemctl(){ return 0; }
    seal_backup(){ printf 'checkpoint_verified\\n' >&3; }
    ${fragment[1]}
    trap cleanup EXIT
    exit 0
  `],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert(result.stdout.indexOf('checkpoint_verified')>result.stdout.indexOf('docker rm -f reader'));
  assert(result.stdout.indexOf('docker network rm isolated')>result.stdout.indexOf('docker rm -fv restore'));
});

test('release safety ordering keeps capacity and archive validation before the bounded pause',()=>{
  const source=read();assert(source);
  const at=needle=>{const n=source.indexOf(needle);assert(n>=0,needle);return n;};
  assert(at('backup-capacity-proof.cjs" check')<at('mkdir -m 700 "$backup"'));
  assert(at('docker image save')<at('docker pause "$container"'));
  assert(at('--on-active=15m')<at('docker pause "$container"'));
  assert(at('verify-restore-full "$backup/full-before.json" "$backup/full-current.json"')<at('# RESUME_BEFORE_RESTORE'));
  assert(at('# RESUME_BEFORE_RESTORE')<at('docker network create --internal'));
  assert(at('verify-restore-full "$backup/full-before.json" "$backup/full-restored.json"')<at('> "$backup/VERIFIED"'));
  assert.match(source,/--network none[\s\S]*?--read-only[\s\S]*?--mount "type=bind,src=\$backup\/\$label-extracted,dst=\/restore"/);
  assert.match(source,/media-proof.cjs" verify "\$backup\/\$label-before.json" "\$backup\/\$label-current.json"/);
  assert.match(source,/media-proof.cjs" verify "\$backup\/\$label-current.json" "\$backup\/\$label-before.json"/);
  assert.doesNotMatch(source,/docker (?:volume rm|system prune)|git (?:reset|switch|checkout)|prisma (?:db push|migrate)|--publish|--network host|curl|wget/);
});
test('parent capacity is available only after a successful immutable-parent inspection',()=>{
  const match=read().match(/# MEDIA_CAPACITY_BEGIN\n([\s\S]*?)# MEDIA_CAPACITY_END/);assert(match);
  for(const [fresh,parent,expected] of [[0,0,'fresh'],[1,0,'fresh-storage-retained-legacy'],[1,1,null]]){
    const result=spawnSync(bash,['-c',`set -euo pipefail\nexec 3>&1\ntools_dir=/tools; base=/backups; capacity=measured; image_bytes=1; code_bytes=1; docker_root=/docker\nnode(){ printf 'call %s\\n' "$*" >&3; if [[ "$1" == /tools/finance-media-reference.cjs ]]; then return ${parent}; fi; if [[ "\${!#}" == fresh ]]; then return ${fresh}; fi; return 0; }\n${match[1]}\nprintf 'mode=%s\\n' "$media_capacity"`],{encoding:'utf8'});
    assert.equal(result.status,expected?0:1,result.stderr);
    if(expected)assert.match(result.stdout,new RegExp('mode='+expected+'\\n'));
    if(fresh===0)assert.doesNotMatch(result.stdout,/finance-media-reference/);
    if(parent===1)assert.doesNotMatch(result.stdout,/check[^\n]* fresh-storage-retained-legacy|mode=/);
    if(expected==='fresh-storage-retained-legacy')assert(result.stdout.indexOf('finance-media-reference.cjs inspect')<result.stdout.indexOf('check measured 1 1 /backups /docker fresh-storage-retained-legacy'));
  }
});
test('retained legacy media resolves only from the exact verified finance checkpoint',()=>{
  const source=read();assert.match(source,/media_parent="\$base\/finance-36082393573"/);
  assert.match(source,/stage=parent_media\n  substep=parent_inspect/);
  assert.match(source,/finance-media-reference\.cjs" inspect "\$media_parent"/);
  assert.match(source,/finance-media-reference\.cjs" prepare-legacy "\$media_parent"/);
});

test('mixed archive loop creates a fresh storage archive and isolated extraction while retaining only legacy',()=>{
  const fragment=read().match(/# MEDIA_ARCHIVES_BEGIN\n([\s\S]*?)# MEDIA_ARCHIVES_END/);assert(fragment);
  const backup=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'finance-archive-loop-'));
  try{
    fs.writeFileSync(path.join(backup,'legacy.path'),'/app/legacy\n');fs.writeFileSync(path.join(backup,'legacy-before.json'),'sealed-legacy');
    const result=spawnSync(bash,['-c',`set -euo pipefail
exec 3>&1
backup="$FINANCE_TEST_DIRECTORY"; reader=reader; tools_dir=/tools; current_image=old; media_capacity=fresh-storage-retained-legacy
docker(){
  printf 'docker %s\\n' "$*" >&3
  case "$*" in
    *'STORAGE_DIR /app/storage') printf /app/storage;;
    *'LEGACY_LOCAL_DIR '*) printf /app/legacy;;
    'exec -u 0 reader tar -czf - -C /app/storage .') printf fresh-storage-archive;;
    'run --rm -i --network none '*) cat >/dev/null;;
    *) return 91;;
  esac
}
gzip(){ return 0; }
mkdir(){ [[ "$1" == -m && "$2" == 700 ]] || return 1; command mkdir "$3"; }
node(){ printf fresh-storage-manifest; }
${fragment[1]}
archive_media_phase frozen
`],{encoding:'utf8',env:{...process.env,FINANCE_TEST_DIRECTORY:backup.replace(/\\/g,'/')}});
    assert.equal(result.status,0,result.stderr);
    assert.equal(fs.readFileSync(path.join(backup,'storage.tar.gz'),'utf8'),'fresh-storage-archive');
    assert.equal(fs.readFileSync(path.join(backup,'storage-before.json'),'utf8'),'fresh-storage-manifest');
    assert.equal(fs.readFileSync(path.join(backup,'legacy-before.json'),'utf8'),'sealed-legacy');
    assert(!fs.existsSync(path.join(backup,'legacy.tar.gz')));assert(!fs.existsSync(path.join(backup,'legacy-extracted')));
    assert.match(result.stdout,/--network none --user 0 --read-only/);assert.match(result.stdout,/dst=\/restore --entrypoint tar/);
    assert.doesNotMatch(result.stdout,/tar -czf - -C \/app\/legacy/);
    const deploy=fs.readFileSync(path.join(__dirname,'finance-deploy.sh'),'utf8');assert.match(deploy,/verified-parent\|fresh-storage-retained-legacy\) node .*finance-media-reference.cjs" verify/);
  }finally{fs.rmSync(backup,{recursive:true,force:true});}
});

test('failed media extraction reports its actual media substep before any snapshot proof',()=>{
 const os=require('node:os'),root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'finance-media-stage-')));
 try{
  const loop=read().match(/# MEDIA_ARCHIVES_BEGIN\n([\s\S]*?)# MEDIA_ARCHIVES_END/)[1];
  const script=`set -Eeuo pipefail\nstage=archives;substep=verify_archives\ntrap 'printf "FAILED_SUBSTEP=%s\\n" "$substep" >&2' ERR\nbackup="$1";reader=fixture;current_image=fixture;tools_dir=fixture;media_capacity=fresh\ndocker(){ if [[ "$*" == *LEGACY_LOCAL_DIR* ]]; then return 0; elif [[ "$1" == exec && "$3" == node ]]; then printf /app/storage; elif [[ "$1" == exec ]]; then printf ARCHIVE; elif [[ "$1" == run ]]; then return 17; fi; }\ngzip(){ return 0; }\nmkdir(){ return 0; }\nnode(){ echo UNEXPECTED_SNAPSHOT; }\n${loop}\narchive_media_phase frozen`;
  const result=spawnSync(bash,['-c',script,'fixture',root.split(String.fromCharCode(92)).join('/')],{encoding:'utf8'});assert.equal(result.status,17,result.stderr);assert.match(result.stderr,/FAILED_SUBSTEP=extract_media_storage/);assert.doesNotMatch(result.stdout,/UNEXPECTED_SNAPSHOT/);
 }finally{assert.equal(path.dirname(root),fs.realpathSync(os.tmpdir()));fs.rmSync(root,{recursive:true,force:true});}
});
