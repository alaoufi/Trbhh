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
const read=()=>fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
const candidate='a'.repeat(40),baseline='b'.repeat(40);

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
  for(const [fresh,parent,expected] of [[0,0,'fresh'],[1,0,'verified-parent'],[1,1,null]]){
    const result=spawnSync(bash,['-c',`set -euo pipefail\nexec 3>&1\ntools_dir=/tools; base=/backups; capacity=measured; image_bytes=1; code_bytes=1; docker_root=/docker\nnode(){ printf 'call %s\\n' "$*" >&3; if [[ "$1" == /tools/finance-media-reference.cjs ]]; then return ${parent}; fi; if [[ "\${!#}" == fresh ]]; then return ${fresh}; fi; return 0; }\n${match[1]}\nprintf 'mode=%s\\n' "$media_capacity"`],{encoding:'utf8'});
    assert.equal(result.status,expected?0:1,result.stderr);
    if(expected)assert.match(result.stdout,new RegExp('mode='+expected+'\\n'));
    if(fresh===0)assert.doesNotMatch(result.stdout,/finance-media-reference/);
    if(parent===1)assert.doesNotMatch(result.stdout,/check[^\n]* verified-parent|mode=/);
    if(expected==='verified-parent')assert(result.stdout.indexOf('finance-media-reference.cjs inspect')<result.stdout.indexOf('check measured 1 1 /backups /docker verified-parent'));
  }
});
