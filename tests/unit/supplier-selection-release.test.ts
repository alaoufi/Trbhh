import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {describe, expect, it} from 'vitest';

const require=createRequire(import.meta.url);
const workflow=readFileSync('.github/workflows/release-safeguards.yml','utf8');
const script=readFileSync('scripts/release/safeguards.sh','utf8');
const runtime=readFileSync('scripts/release/verify-runtime.cjs','utf8');
const baseline='415a8fe593522859f4cf85c2fa10e47a7d40109b';
const candidate='a'.repeat(40);
const branch='codex/supplier-visual-selection-20260921';
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
function shell(source:string,env:Record<string,string>={}){
  return spawnSync(bash,['-c',source],{encoding:'utf8',timeout:10000,env:{...process.env,...env}});
}
function expression(key:string){
  const line=workflow.match(new RegExp('^          '+key+': \\$\\{\\{ (.+) \\}\\}$','m'))?.[1];
  if(!line)throw Error('workflow expression missing');return line;
}

describe('supplier selection release boundaries',()=>{
  it('executes real filesystem media-chain, previous-profile and capacity proofs in CI',()=>{
    const result=spawnSync(process.execPath,['--test','scripts/release/selection-media-reference.test.cjs','scripts/release/merchant-media-reference.test.cjs','scripts/release/backup-capacity-proof.test.cjs'],{encoding:'utf8',timeout:30000});
    expect(result.error).toBeUndefined();
    expect(result.status,result.stdout+'\n'+result.stderr).toBe(0);
  },35000);
  it.each([
    ['workflow_dispatch',branch,'before',true],
    ['workflow_dispatch',branch,'after',true],
    ['workflow_dispatch',branch,'salla_activate',false],
    ['workflow_dispatch',branch+'-other','before',false],
    ['push',branch,'before',false],
  ])('allows only manual exact-branch backup/verification: %s %s %s',(event,ref,phase,allowed)=>{
    const condition=workflow.split('  safeguard:')[1].match(/^    if: (.+)$/m)?.[1];
    expect(condition).toBeDefined();
    expect(runInNewContext(condition!,{github:{event_name:event,ref:'refs/heads/'+ref},inputs:{phase}},{timeout:1000})).toBe(allowed);
  });
  it.each([
    [branch,'','supplier_selection'],
    [branch,'35603864905','supplier_selection'],
    ['codex/salla-owner-release-20260921','','merchant_oauth'],
    ['codex/salla-owner-release-20260921','35603864905','merchant_headers'],
    ['claude/hostinger-vps-project-amw8vb','','standard'],
  ])('keeps old profile routing intact: %s / %s',(ref,reuse,profile)=>{
    expect(runInNewContext(expression('RELEASE_PROFILE'),{github:{ref:'refs/heads/'+ref},inputs:{reuse_media_id:reuse}},{timeout:1000})).toBe(profile);
  });
  it('requires the exact verified media checkpoint before any production path or Docker access',()=>{
    const prefix=script.slice(0,script.indexOf('\nprod=/root/trbhh'));
    for(const phase of ['before','after']){
      const ok=shell(`set -- ${phase} 123 ${candidate} 35607654850 supplier_selection\n${prefix}`);
      expect(ok.status,ok.stderr).toBe(0);
      for(const reuse of ["''",'456','35603864905']){
        const denied=shell(`set -- ${phase} 123 ${candidate} ${reuse} supplier_selection\n${prefix}`);
        expect(denied.status).not.toBe(0);
        expect(denied.stdout).toContain('exact verified media chain');
      }
      expect(shell(`set -- ${phase} 35607654850 ${candidate} 35607654850 supplier_selection\n${prefix}`).status).not.toBe(0);
    }
  });
  it('executes the exact live baseline gate and rejects drift',()=>{
    const gate=script.match(/\nif \[\[ "\$release_profile" == salla \]\]; then\n[\s\S]*?\nfi\n(?=if \[\[ "\$release_profile" == merchant_oauth)/)?.[0];
    expect(gate).toBeDefined();
    for(const [current,reuse,allowed] of [[baseline,'35607654850',true],[candidate,'35607654850',false],[baseline,'',false],[baseline,'456',false]] as const){
      const result=shell(gate!,{release_profile:'supplier_selection',current_commit:current,reuse_media_id:reuse});
      expect(result.status===0,result.stderr).toBe(allowed);
    }
  });
  it('requires matching backup marker, baseline and candidate after deployment',()=>{
    const gate=script.split('\n').find(line=>line.includes('$(cat "$backup/VERIFIED")')&&line.includes(baseline));
    expect(gate).toBeDefined();
    const reader='cat() { case "$1" in fixture/VERIFIED) printf %s "$marker";; fixture/commit.txt) printf %s "$commit";; fixture/candidate.txt) printf %s "$saved";; *) return 1;; esac; }\n';
    for(const overrides of [{},{marker:candidate},{commit:candidate},{saved:baseline}]){
      const result=shell(reader+gate,{backup:'fixture',candidate,marker:baseline,commit:baseline,saved:candidate,...overrides});
      expect(result.status===0,result.stderr).toBe(Object.keys(overrides).length===0);
    }
  });
  it('retains pre-archive capacity, full restore, supplier proofs and watchdog',()=>{
    const freshGate=script.indexOf('Supplier selection requires its exact reviewed baseline');
    const capacity=script.indexOf('capacity=$(docker exec');
    expect(capacity).toBeGreaterThan(freshGate);
    expect(capacity).toBeLessThan(script.indexOf('mkdir -m 700 "$backup"'));
    expect(script.slice(capacity,script.indexOf('mkdir -m 700 "$backup"'))).toContain('media_capacity=fresh');
    expect(script.slice(capacity,script.indexOf('mkdir -m 700 "$backup"'))).toContain('"$release_profile" == supplier_selection && -n "$reuse_media_id" ]]; then media_capacity=verified-parent');
    expect(script).toContain('verify-restore-full "$backup/full-before.json" "$backup/full-restored.json"');
    expect(script).toContain('verify-restore-full "$backup/full-before.json" "$backup/full-current.json"');
    expect(script).toContain('--on-active=15m');
    expect(script).toContain('trap resume_production EXIT');
    for(const path of ['supplier-before.json','supplier-after.json'])expect(script).toContain(`supplier-preservation-proof.cjs" > "$backup/${path}`);
    expect(script).toContain('verify "$backup/supplier-before.json" "$backup/supplier-after.json"');
    expect(script.indexOf('selection-media-reference.cjs" prepare')).toBeLessThan(script.indexOf('docker image save'));
    expect(script.indexOf('selection-media-reference.cjs" verify')).toBeLessThan(script.indexOf('> "$backup/DEPLOYMENT_VERIFIED"'));
    expect(script).toContain('sha256sum SELECTION_MEDIA_REFERENCE.json REUSED_MEDIA_SOURCE *-before.json *.path');
  });
});

describe('supplier selection live runtime preservation',()=>{
  const variables:Record<string,string>={DATABASE_URL:'synthetic-db',AUTH_SECRET:'synthetic-auth',STORAGE_DIR:'/app/storage',LEGACY_LOCAL_DIR:'/app/legacy',SALLA_CLIENT_ID:'synthetic-id',SALLA_CLIENT_SECRET:'synthetic-secret',SALLA_WEBHOOK_SECRET:'synthetic-webhook',SUPPLIER_TOKEN_ENCRYPTION_KEY:'a'.repeat(64),SUPPLIER_RECONCILE_SECRET:'synthetic-reconcile',SUPPLIER_PUBLIC_ORIGIN:'https://trbhh.sa',SUPPLIER_ALLOW_LIVE_ORDERS:'false'};
  function verify(changes:Record<string,string>={},changedMount=false){
    const container=(env:Record<string,string>,mount='/fixture/storage')=>[{Config:{Env:Object.entries(env).map(([key,value])=>key+'='+value)},Mounts:[{Type:'volume',Name:'storage',Source:mount,Destination:'/app/storage',RW:true}]}];
    const fixtures:Record<string,unknown>={before:container(variables),after:container({...variables,...changes},changedMount?'/fixture/other':'/fixture/storage')};
    return ()=>runInNewContext(runtime,{require:(name:string)=>name==='node:fs'?{readFileSync:(path:string)=>JSON.stringify(fixtures[path])}:require(name),process:{argv:['node','verify-runtime','before','after','supplier_selection'],exit:()=>{throw Error('denied');}},console:{error:()=>{},info:()=>{}}},{timeout:1000});
  }
  it('accepts unchanged required credentials and disabled live orders',()=>expect(verify()).not.toThrow());
  it.each(['DATABASE_URL','AUTH_SECRET','SALLA_CLIENT_ID','SALLA_CLIENT_SECRET','SALLA_WEBHOOK_SECRET','SUPPLIER_TOKEN_ENCRYPTION_KEY','SUPPLIER_RECONCILE_SECRET','SUPPLIER_PUBLIC_ORIGIN','SUPPLIER_ALLOW_LIVE_ORDERS'])('rejects altered %s without printing values',key=>expect(verify({[key]:'changed'})).toThrow('denied'));
  it('rejects changed persistent storage mounts',()=>expect(verify({},true)).toThrow('denied'));
  it.each(['commerce_purchasing_enabled','commerce_payments_enabled','commerce_enabled'])('rejects an enabled %s in the supplier preservation proof',key=>{
    const {disabledFlags}=require('../../scripts/release/supplier-preservation-proof.cjs');
    expect(()=>disabledFlags([{k:key,v:'true'}])).toThrow('supplier_preservation_failed');
    expect(disabledFlags([{k:key,v:'false'}]).disabled).toBe(true);
  });
});
