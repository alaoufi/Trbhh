import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe,expect,it} from 'vitest';

const workflow=readFileSync('.github/workflows/release-safeguards.yml','utf8');
const script=readFileSync('scripts/release/safeguards.sh','utf8');
const runtime=readFileSync('scripts/release/verify-runtime.cjs','utf8');
const helper=readFileSync('scripts/release/onboarding-legacy-identity-media-reference.cjs','utf8');
const baseline='706f1da6999def43dab8d329ba3b576f3e764a87',checkpoint='35651818861',candidate='e'.repeat(40);
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
const shell=(source:string)=>spawnSync(bash,['-c',source],{encoding:'utf8',timeout:10000,env:process.env});

describe('connected legacy supplier identity production release',()=>{
 it('selects only its exact verified parent checkpoint',()=>{const expression=workflow.match(/^          RELEASE_PROFILE: \$\{\{ (.+) \}\}$/m)?.[1];expect(expression).toBeDefined();expect(runInNewContext(expression!,{github:{ref:'refs/heads/codex/supplier-visual-selection-20260921'},inputs:{reuse_media_id:checkpoint}},{timeout:1000})).toBe('onboarding_legacy_identity');});
 it('rejects another checkpoint and pins the current live baseline',()=>{const prefix=script.slice(0,script.indexOf('\nprod=/root/trbhh'));expect(shell(`set -- before 999 ${candidate} ${checkpoint} onboarding_legacy_identity\n${prefix}`).status).toBe(0);expect(shell(`set -- before 999 ${candidate} 123 onboarding_legacy_identity\n${prefix}`).status).not.toBe(0);expect(script).toContain(`current_commit\" == ${baseline}`);});
 it('chains the verified legacy-email release and preservation proofs',()=>{expect(helper).toContain(`const CHECKPOINT_ID='${checkpoint}'`);expect(helper).toContain("const BASELINE='97563332511adda499f86ec87a0df54aaf4551b9'");expect(helper).toContain(`const CURRENT='${baseline}'`);expect(helper).toContain('legacyEmail.verify(checkpoint,base).ok===true');expect(helper).toContain("'verify-known-migration'");expect(script).toContain('onboarding-legacy-identity-media-reference.cjs\" prepare');expect(script).toContain('onboarding-legacy-identity-media-reference.cjs\" verify');expect(runtime).toContain("'onboarding_legacy_identity'");});
});
