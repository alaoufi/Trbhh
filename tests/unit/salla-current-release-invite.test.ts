import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {runInNewContext} from 'node:vm';
import {describe,expect,it} from 'vitest';

const LIVE='9a64552faca2b99e63a0e915ea73fd0989336b86',BASE='6b9ad47c6ace6cc7a7c25fc0d04947a5eaece2fb',BACKUP='35629850346';
const branch='codex/supplier-visual-selection-20260921',legacy='codex/salla-owner-release-20260921';
const workflow=readFileSync('.github/workflows/integration-readiness.yml','utf8');
const job=workflow.split('  owner-invite:')[1],condition=job.match(/^    if: (.+)$/m)![1];
const gate=readFileSync('scripts/release/issue-owner-invite.sh','utf8');
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
function expression(name:string){return job.match(new RegExp('^      '+name+': \\$\\{\\{ (.+) \\}\\}$','m'))![1];}
function guard(overrides:Record<string,string>={},markers:Record<string,string>={}){
  const temp=mkdtempSync(path.join(tmpdir(),'trbhh-invite-gate-'));
  const prod=path.join(temp,'prod'),backups=path.join(temp,'backups'),backup=path.join(backups,'audit-'+BACKUP);mkdirSync(prod);mkdirSync(backup,{recursive:true});
  const original={VERIFIED:BASE,'commit.txt':BASE,'candidate.txt':LIVE,DEPLOYMENT_VERIFIED:LIVE,...markers};
  for(const [name,value] of Object.entries(original))writeFileSync(path.join(backup,name),value);
  writeFileSync(path.join(backup,'container-after.json'),JSON.stringify([{Id:'recorded-container',Image:'sha256:'+'a'.repeat(64)}]));
  const script=gate.replaceAll('/root/trbhh-release-backups',backups.replaceAll('\\','/')).replaceAll('/root/trbhh',prod.replaceAll('\\','/'));
  const mocks=`realpath(){ printf %s "$1"; }
git(){ [[ "$*" == 'rev-parse HEAD' ]] || return 1; printf %s "$LIVE_HEAD"; }
node(){ printf '%s %s' recorded-container 'sha256:${'a'.repeat(64)}'; }
docker(){
 if [[ "$*" == 'compose ps -q app' ]]; then printf %s "$LIVE_CONTAINER";
 elif [[ "$*" == *'.State.Running'* ]]; then printf %s "$LIVE_STATE";
 elif [[ "$*" == *'.Id'* ]]; then printf '%s %s' "$LIVE_CONTAINER" "$LIVE_IMAGE";
 elif [[ "$*" == 'compose exec -T app node -' ]]; then printf ISSUED;
 else return 1; fi
}
set -- "$CANDIDATE" "$BACKUP_ID" "$PROFILE"
`;
  try{return spawnSync(bash,['-c',mocks+script],{encoding:'utf8',timeout:10000,env:{...process.env,CANDIDATE:LIVE,BACKUP_ID:BACKUP,PROFILE:'national_day',LIVE_HEAD:LIVE,LIVE_CONTAINER:'recorded-container',LIVE_STATE:'true false',LIVE_IMAGE:'sha256:'+'a'.repeat(64),...overrides}});}
  finally{if(path.dirname(temp)!==tmpdir()||!path.basename(temp).startsWith('trbhh-invite-gate-'))throw Error('unsafe fixture path');rmSync(temp,{recursive:true,force:true});}
}
describe('current verified release owner invitation',()=>{
  it.each([
    ['workflow_dispatch',branch,true,BACKUP,true],['workflow_dispatch',branch,true,'35626587686',false],
    ['workflow_dispatch',branch,false,BACKUP,false],['push',branch,true,BACKUP,false],
    ['workflow_dispatch',branch+'-other',true,BACKUP,false],['workflow_dispatch','claude/hostinger-vps-project-amw8vb',true,BACKUP,false],
    ['workflow_dispatch',legacy,true,'previous-backup',true],
  ])('allows only approved dispatch %s/%s/%s/%s',(event,ref,owner,backup,expected)=>{
    expect(runInNewContext(condition,{github:{event_name:event,ref:'refs/heads/'+ref},inputs:{owner_invite:owner,backup_id:backup}},{timeout:1000})).toBe(expected);
  });
  it('pins deployed SHA independently from the ops-only commit and preserves legacy routing',()=>{
    for(const ref of [branch,legacy]){
      const context={github:{ref:'refs/heads/'+ref,sha:'b'.repeat(40)}};
      expect(runInNewContext(expression('PRODUCTION_SHA'),context)).toBe(ref===branch?LIVE:'b'.repeat(40));
      expect(runInNewContext(expression('INVITATION_PROFILE'),context)).toBe(ref===branch?'national_day':'merchant_oauth');
    }
    expect(job).toContain('remote_tools="/root/trbhh-release-tools/$PRODUCTION_SHA"');
    expect(job).not.toContain('docker compose up');expect(job).not.toContain('git reset');
  });
  it('allows issuance only with exact markers and unchanged running container',()=>{
    const ok=guard();expect(ok.status,ok.stderr).toBe(0);expect(ok.stdout).toBe('ISSUED');
    for(const change of [{CANDIDATE:'b'.repeat(40)},{BACKUP_ID:'1'},{PROFILE:'unknown'},{LIVE_HEAD:'b'.repeat(40)},{LIVE_CONTAINER:'replacement'},{LIVE_STATE:'false false'},{LIVE_STATE:'true true'},{LIVE_IMAGE:'sha256:'+'b'.repeat(64)}]){
      const denied=guard(change);expect(denied.status).not.toBe(0);expect(denied.stdout).not.toContain('ISSUED');
    }
    for(const marker of ['VERIFIED','commit.txt','candidate.txt','DEPLOYMENT_VERIFIED']){
      const denied=guard({}, {[marker]:'b'.repeat(40)});expect(denied.status).not.toBe(0);expect(denied.stdout).not.toContain('ISSUED');
    }
  });
  it('keeps the original merchant baseline flow available',()=>{
    const old='07d2e9ead8e0b28824102d5c8a31b097e01f9459';
    const result=guard({PROFILE:'merchant_oauth'},{VERIFIED:old,'commit.txt':old});expect(result.status,result.stderr).toBe(0);expect(result.stdout).toBe('ISSUED');
  });
  it('requires identical bundled OAuth sources before building a newer ops revision',()=>{
    const block=job.split('      - name: Build the reviewed invitation operation')[1].split('          pnpm install')[0];
    expect(block).toContain('git fetch --no-tags --depth=1 origin "$PRODUCTION_SHA"');
    expect(block).toContain('git diff --exit-code "$PRODUCTION_SHA" HEAD --');
    for(const file of ['scripts/release/build-salla-owner-invite.cjs','scripts/release/salla-owner-invite.ts','src/lib/suppliers/merchant-oauth.ts','src/lib/suppliers/config.ts','src/lib/suppliers/crypto.ts','src/lib/suppliers/http.ts','src/lib/commerce/config.ts','src/lib/commerce/money.ts'])expect(block).toContain(file);
    const shellBlock=block.split('        run: |')[1].split('\n').map(line=>line.replace(/^          /,'')).join('\n');
    for(const changed of ['0','1']){
      const result=spawnSync(bash,['-c','git(){ if [[ "$1" == diff ]]; then return "$SOURCE_CHANGED"; fi; }\n'+shellBlock+'\necho BUILD_ALLOWED'],{encoding:'utf8',timeout:10000,env:{...process.env,INVITATION_PROFILE:'national_day',PRODUCTION_SHA:LIVE,SOURCE_CHANGED:changed}});
      expect(result.status===0).toBe(changed==='0');expect(result.stdout.includes('BUILD_ALLOWED')).toBe(changed==='0');
    }
  });
});
