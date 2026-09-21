import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {describe, expect, it} from 'vitest';

const require=createRequire(import.meta.url);
const workflow=readFileSync('.github/workflows/release-safeguards.yml','utf8');
const script=readFileSync('scripts/release/safeguards.sh','utf8');
const runtime=readFileSync('scripts/release/verify-runtime.cjs','utf8');
const baseline='1a2111ccd9a17c151a2f47cf793f3bddf4d0451f';
const candidate='a'.repeat(40);
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
function shell(source:string,env:Record<string,string>={}){return spawnSync(bash,['-c',source],{encoding:'utf8',timeout:10000,env:{...process.env,...env}});}
describe('public homepage preservation release',()=>{
  it('runs real filesystem chain and historical raw-proof review in CI',()=>{
    const result=spawnSync(process.execPath,['--test','scripts/release/home-media-reference.test.cjs'],{encoding:'utf8',timeout:30000});
    expect(result.error).toBeUndefined();expect(result.status,result.stdout+'\n'+result.stderr).toBe(0);
  },35000);
  it('selects public_home only on exact feature branch and reviewed checkpoint',()=>{
    const expression=workflow.match(/^          RELEASE_PROFILE: \$\{\{ (.+) \}\}$/m)?.[1];expect(expression).toBeDefined();
    for(const [ref,reuse,profile] of [
      ['codex/supplier-visual-selection-20260921','35619790007','public_home'],
      ['codex/supplier-visual-selection-20260921','35607654850','supplier_selection'],
      ['codex/supplier-visual-selection-20260921-other','35619790007','standard'],
      ['claude/hostinger-vps-project-amw8vb','35619790007','standard'],
    ])expect(runInNewContext(expression!,{github:{ref:'refs/heads/'+ref},inputs:{reuse_media_id:reuse}},{timeout:1000})).toBe(profile);
  });
  it('rejects an unreviewed checkpoint before any production access',()=>{
    const prefix=script.slice(0,script.indexOf('\nprod=/root/trbhh'));
    for(const phase of ['before','after'])for(const reuse of ['35619790007','35607654850','123',"''"]){
      expect(shell(`set -- ${phase} 999 ${candidate} ${reuse} public_home\n${prefix}`).status===0).toBe(reuse==='35619790007');
    }
    expect(shell(`set -- before 35619790007 ${candidate} 35619790007 public_home\n${prefix}`).status).not.toBe(0);
  });
  it('rejects production baseline drift or wrong parent before archives',()=>{
    const gate=script.match(/\nif \[\[ "\$release_profile" == salla \]\]; then\n[\s\S]*?\nfi\n(?=if \[\[ "\$release_profile" == merchant_oauth)/)?.[0];expect(gate).toBeDefined();
    for(const [current,reuse,allowed] of [[baseline,'35619790007',true],[candidate,'35619790007',false],[baseline,'35607654850',false],[baseline,'',false]] as const){
      const result=shell(gate!,{release_profile:'public_home',current_commit:current,reuse_media_id:reuse});expect(result.status===0,result.stderr).toBe(allowed);
    }
  });
  it('pins both backup baseline markers and exact candidate after deployment',()=>{
    const gate=script.split('\n').find(line=>line.includes('$(cat "$backup/VERIFIED")')&&line.includes(baseline));expect(gate).toBeDefined();
    const reader='cat() { case "$1" in fixture/VERIFIED) printf %s "$marker";; fixture/commit.txt) printf %s "$commit";; fixture/candidate.txt) printf %s "$saved";; *) return 1;; esac; }\n';
    for(const overrides of [{},{marker:candidate},{commit:candidate},{saved:baseline}]){
      const result=shell(reader+gate,{backup:'fixture',candidate,marker:baseline,commit:baseline,saved:candidate,...overrides});expect(result.status===0,result.stderr).toBe(Object.keys(overrides).length===0);
    }
  });
  it('keeps current after proof strict and completes it before recording success',()=>{
    expect(script).toContain('node "$tools_dir/database-proof.cjs" verify "$backup/before.json" "$backup/after.json"');
    expect(script).not.toContain('after-reviewed');
    const finish=script.indexOf('> "$backup/DEPLOYMENT_VERIFIED"');
    for(const proof of ['home-media-reference.cjs" verify','verify "$backup/supplier-before.json" "$backup/supplier-after.json"','verify "$backup/before.json" "$backup/after.json"','verify-schema <','verify-runtime.cjs" "$backup/container-before.json" "$backup/container-after.json"','verify "$backup/$media-before.json" "$backup/$media-after.json"']){
      expect(script.indexOf(proof)).toBeGreaterThan(-1);expect(script.indexOf(proof)).toBeLessThan(finish);
    }
    expect(script.indexOf('home-media-reference.cjs" prepare')).toBeLessThan(script.indexOf('docker image save'));
    expect(script).toContain('"$release_profile" == public_home ]]; then media_capacity=verified-parent');
    expect(script).toContain('sha256sum HOME_MEDIA_REFERENCE.json REUSED_MEDIA_SOURCE *-before.json *.path');
  });
  it('enforces runtime credentials and disabled live orders for public_home',()=>{
    const variables:Record<string,string>={DATABASE_URL:'synthetic-db',AUTH_SECRET:'synthetic-auth',STORAGE_DIR:'/app/storage',LEGACY_LOCAL_DIR:'/app/legacy',SALLA_CLIENT_ID:'id',SALLA_CLIENT_SECRET:'secret',SALLA_WEBHOOK_SECRET:'hook',SUPPLIER_TOKEN_ENCRYPTION_KEY:'encryption',SUPPLIER_RECONCILE_SECRET:'reconcile',SUPPLIER_PUBLIC_ORIGIN:'https://trbhh.sa',SUPPLIER_ALLOW_LIVE_ORDERS:'false'};
    const container=(env:Record<string,string>)=>[{Config:{Env:Object.entries(env).map(([key,value])=>key+'='+value)},Mounts:[{Type:'volume',Name:'storage',Source:'/fixture/storage',Destination:'/app/storage',RW:true}]}];
    function verify(changes:Record<string,string>={}){
      const fixtures:Record<string,unknown>={before:container(variables),after:container({...variables,...changes})};
      return ()=>runInNewContext(runtime,{require:(name:string)=>name==='node:fs'?{readFileSync:(file:string)=>JSON.stringify(fixtures[file])}:require(name),process:{argv:['node','verify-runtime','before','after','public_home'],exit:()=>{throw Error('denied');}},console:{error:()=>{},info:()=>{}}},{timeout:1000});
    }
    expect(verify()).not.toThrow();
    for(const key of Object.keys(variables))expect(verify({[key]:'changed'})).toThrow('denied');
  });
});
