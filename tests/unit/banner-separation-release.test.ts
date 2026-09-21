import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe,expect,it} from 'vitest';

const workflow=readFileSync('.github/workflows/release-safeguards.yml','utf8');
const script=readFileSync('scripts/release/safeguards.sh','utf8');
const runtime=readFileSync('scripts/release/verify-runtime.cjs','utf8');
const helper=readFileSync('scripts/release/banner-separation-media-reference.cjs','utf8');
const baseline='7def385fc2a161f829486544815b6f3a58e327e7',checkpoint='35640414518',candidate='e'.repeat(40);
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
const shell=(source:string)=>spawnSync(bash,['-c',source],{encoding:'utf8',timeout:10000,env:process.env});

describe('separated National Day banner production release',()=>{
  it('selects only the pinned current-production checkpoint',()=>{
    const expression=workflow.match(/^          RELEASE_PROFILE: \$\{\{ (.+) \}\}$/m)?.[1];
    expect(expression).toBeDefined();
    expect(runInNewContext(expression!,{github:{ref:'refs/heads/codex/supplier-visual-selection-20260921'},inputs:{reuse_media_id:checkpoint}},{timeout:1000})).toBe('banner_separation');
  });
  it('rejects a different checkpoint and pins the live baseline',()=>{
    const prefix=script.slice(0,script.indexOf('\nprod=/root/trbhh'));
    expect(shell(`set -- before 999 ${candidate} ${checkpoint} banner_separation\n${prefix}`).status).toBe(0);
    expect(shell(`set -- before 999 ${candidate} 123 banner_separation\n${prefix}`).status).not.toBe(0);
    expect(script).toContain(`current_commit\" == ${baseline}`);
  });
  it('chains the verified supplier release and preservation proofs',()=>{
    expect(helper).toContain(`const CHECKPOINT_ID='${checkpoint}'`);
    expect(helper).toContain("const BASELINE='b5bf261a7a03cf28cbdca8387363616e0386b9e8'");
    expect(helper).toContain(`const CURRENT='${baseline}'`);
    expect(helper).toContain('supplierAdmin.verify(checkpoint,base).ok===true');
    expect(script).toContain('banner-separation-media-reference.cjs\" prepare');
    expect(script).toContain('banner-separation-media-reference.cjs\" verify');
    expect(runtime).toContain("'banner_separation'");
  });
});
