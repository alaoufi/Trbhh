import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe,expect,it} from 'vitest';

const workflow=readFileSync('.github/workflows/release-safeguards.yml','utf8');
const script=readFileSync('scripts/release/safeguards.sh','utf8');
const runtime=readFileSync('scripts/release/verify-runtime.cjs','utf8');
const helper=readFileSync('scripts/release/onboarding-audit-compact-media-reference.cjs','utf8');
const baseline='1b700dbdcb7d6a2c6fba8ea2cc03cb50aeb20b7d',checkpoint='35653890678',candidate='f'.repeat(40);
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
const shell=(source:string)=>spawnSync(bash,['-c',source],{encoding:'utf8',timeout:10000,env:process.env});

describe('onboarding compact audit production release',()=>{
 it('selects only its exact verified parent checkpoint',()=>{const expression=workflow.match(/^          RELEASE_PROFILE: \$\{\{ (.+) \}\}$/m)?.[1];expect(expression).toBeDefined();expect(runInNewContext(expression!,{github:{ref:'refs/heads/codex/supplier-visual-selection-20260921'},inputs:{reuse_media_id:checkpoint}},{timeout:1000})).toBe('onboarding_audit_compact');});
 it('rejects another checkpoint and pins the current live baseline',()=>{const prefix=script.slice(0,script.indexOf('\nprod=/root/trbhh'));expect(shell(`set -- before 999 ${candidate} ${checkpoint} onboarding_audit_compact\n${prefix}`).status).toBe(0);expect(shell(`set -- before 999 ${candidate} 123 onboarding_audit_compact\n${prefix}`).status).not.toBe(0);expect(script).toContain(`current_commit\" == ${baseline}`);});
 it('chains the verified legacy-identity release and preservation proofs',()=>{expect(helper).toContain(`const CHECKPOINT_ID='${checkpoint}'`);expect(helper).toContain("const BASELINE='706f1da6999def43dab8d329ba3b576f3e764a87'");expect(helper).toContain(`const CURRENT='${baseline}'`);expect(helper).toContain('legacyIdentity.verify(checkpoint,base).ok===true');expect(helper).toContain("'verify-known-migration'");expect(script).toContain('onboarding-audit-compact-media-reference.cjs\" prepare');expect(script).toContain('onboarding-audit-compact-media-reference.cjs\" verify');expect(runtime).toContain("'onboarding_audit_compact'");});
});
