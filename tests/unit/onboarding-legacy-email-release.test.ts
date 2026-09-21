import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe,expect,it} from 'vitest';

const workflow=readFileSync('.github/workflows/release-safeguards.yml','utf8');
const script=readFileSync('scripts/release/safeguards.sh','utf8');
const runtime=readFileSync('scripts/release/verify-runtime.cjs','utf8');
const helper=readFileSync('scripts/release/onboarding-legacy-email-media-reference.cjs','utf8');
const baseline='97563332511adda499f86ec87a0df54aaf4551b9',checkpoint='35649868888',candidate='d'.repeat(40);
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
const shell=(source:string)=>spawnSync(bash,['-c',source],{encoding:'utf8',timeout:10000,env:process.env});

describe('connected supplier legacy email production release',()=>{
 it('selects only the latest verified production checkpoint',()=>{const expression=workflow.match(/^          RELEASE_PROFILE: \$\{\{ (.+) \}\}$/m)?.[1];expect(expression).toBeDefined();expect(runInNewContext(expression!,{github:{ref:'refs/heads/codex/supplier-visual-selection-20260921'},inputs:{reuse_media_id:checkpoint}},{timeout:1000})).toBe('onboarding_legacy_email');});
 it('rejects another checkpoint and pins the current live baseline',()=>{const prefix=script.slice(0,script.indexOf('\nprod=/root/trbhh'));expect(shell(`set -- before 999 ${candidate} ${checkpoint} onboarding_legacy_email\n${prefix}`).status).toBe(0);expect(shell(`set -- before 999 ${candidate} 123 onboarding_legacy_email\n${prefix}`).status).not.toBe(0);expect(script).toContain(`current_commit\" == ${baseline}`);});
 it('chains the verified template release and preservation proofs',()=>{expect(helper).toContain(`const CHECKPOINT_ID='${checkpoint}'`);expect(helper).toContain("const BASELINE='408fb10d18ddad9f83259ffd8d006e441e6a6515'");expect(helper).toContain(`const CURRENT='${baseline}'`);expect(helper).toContain('onboardingTemplate.verify(checkpoint,base).ok===true');expect(helper).toContain("'verify-known-migration'");expect(script).toContain('onboarding-legacy-email-media-reference.cjs\" prepare');expect(script).toContain('onboarding-legacy-email-media-reference.cjs\" verify');expect(runtime).toContain("'onboarding_legacy_email'");});
});
